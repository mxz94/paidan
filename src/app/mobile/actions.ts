"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns, ensureDispatchRecordGpsColumns, ensureUserManageColumns } from "@/lib/db-ensure";
import { saveCompressedImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import { getSystemConfigValues, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";

const DEFAULT_PRECISE_DAILY_LIMIT = 3;
const DEFAULT_SERVICE_DAILY_LIMIT = 20;
const END_REASON_OPTIONS = ["无效客资", "未见面", "已见面"] as const;
const GEOCODE_MIN_INTERVAL_MS = 220;
const GEOCODE_MAX_RETRY = 2;
const RESCHEDULE_MAX_DAYS = 7;
const CONVERT_APPOINTMENT_MAX_DAYS = 15;

function normalizeMobilePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("86")) {
    return digits.slice(2);
  }
  return digits;
}

function normalizeNotHandledReason(value: string) {
  return value.replace(/\s+/g, "").replace(/[\u3000]/g, "");
}

function isPreciseCustomerType(customerType: string | null | undefined) {
  const text = String(customerType ?? "").trim();
  return text === "精准" || (text.includes("精准") && !text.includes("客服"));
}

function parseClaimTypeFromRemark(remark: string | null | undefined): "PRECISE" | "SERVICE" | null {
  const text = String(remark ?? "");
  if (text.includes("[CLAIM_TYPE:PRECISE]")) return "PRECISE";
  if (text.includes("[CLAIM_TYPE:SERVICE]")) return "SERVICE";
  return null;
}

function getShanghaiDayRange(now = new Date()) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + offsetMs);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dayStartUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - offsetMs);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { dayStart: dayStartUtc, dayEnd: dayEndUtc };
}

async function getOperatorTenantId(operatorId: number) {
  const user = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { tenantId: true, isDeleted: true, isDisabled: true },
  });
  if (!user || user.isDeleted || user.isDisabled) {
    return null;
  }
  return user.tenantId ?? null;
}

async function getOperatorLocationSnapshot(operatorId: number) {
  const me = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { longitude: true, latitude: true },
  });
  return {
    operatorLongitude: me?.longitude ?? null,
    operatorLatitude: me?.latitude ?? null,
  };
}

function buildMobileQuery(formData: FormData, nextTab: "new" | "doing" | "done", extra?: Record<string, string>) {
  const search = new URLSearchParams();
  search.set("tab", nextTab);
  const district = String(formData.get("district") ?? "").trim();
  if (district) {
    search.set("district", district);
  }
  const region = String(formData.get("region") ?? "").trim();
  if (region) {
    search.set("region", region);
  }
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
  }
  return `/mobile?${search.toString()}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createGeocodeThrottle(minIntervalMs: number) {
  let lastAt = 0;
  return async () => {
    const now = Date.now();
    const wait = minIntervalMs - (now - lastAt);
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  };
}

function isConvertAppointmentWithinFutureDays(value: Date) {
  const now = new Date();
  const maxAt = new Date(now.getTime() + CONVERT_APPOINTMENT_MAX_DAYS * 24 * 60 * 60 * 1000);
  const ts = value.getTime();
  return ts >= now.getTime() && ts <= maxAt.getTime();
}

function normalizeLooseAddress(text: string) {
  return text.replace(/\s+/g, "").replace(/[，,。；;、]/g, "");
}

function buildAddressCandidates(address: string) {
  const raw = String(address || "").trim();
  const compact = normalizeLooseAddress(raw);
  const set = new Set<string>();

  if (raw) set.add(raw);
  if (compact) set.add(compact);
  if (compact && !compact.startsWith("洛阳市")) set.add(`洛阳市${compact}`);
  if (compact && !compact.startsWith("河南省")) set.add(`河南省洛阳市${compact}`);

  if (compact.includes("城关") && !compact.includes("城关镇")) {
    const withTown = compact.replace("城关", "城关镇");
    set.add(withTown);
    set.add(`洛阳市${withTown}`);
    set.add(`河南省洛阳市${withTown}`);
  }

  return Array.from(set).filter(Boolean);
}

function resolveAmapWebKey() {
  return (
    process.env.AMAP_WEB_SERVICE_KEY ||
    process.env.AMAP_WEB_KEY ||
    process.env.NEXT_PUBLIC_AMAP_KEY ||
    process.env.VUE_APP_AMAP_KEY ||
    ""
  );
}

async function geocodeAddress(address: string, throttle?: () => Promise<void>) {
  const key = resolveAmapWebKey();
  const sig = process.env.AMAP_WEB_SERVICE_SIG || process.env.AMAP_WEB_SIG || "";
  if (!key) return { longitude: null as number | null, latitude: null as number | null };

  try {
    if (throttle) await throttle();
    const search = new URLSearchParams({ key, address, city: "洛阳" });
    if (sig) search.set("sig", sig);
    const resp = await fetch(`https://restapi.amap.com/v3/geocode/geo?${search.toString()}`, { cache: "no-store" });
    if (!resp.ok) return { longitude: null as number | null, latitude: null as number | null };
    const json = (await resp.json()) as { status?: string; geocodes?: Array<{ location?: string }> };
    if (json.status !== "1") return { longitude: null as number | null, latitude: null as number | null };
    const location = json.geocodes?.[0]?.location ?? "";
    const [lngText, latText] = location.split(",");
    const longitude = Number(lngText);
    const latitude = Number(latText);
    if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
      return { longitude: null as number | null, latitude: null as number | null };
    }
    return { longitude, latitude };
  } catch {
    return { longitude: null as number | null, latitude: null as number | null };
  }
}

async function geocodeAddressWithRetry(address: string, throttle: () => Promise<void>) {
  const candidates = buildAddressCandidates(address);
  for (const candidate of candidates) {
    for (let i = 0; i <= GEOCODE_MAX_RETRY; i += 1) {
      const result = await geocodeAddress(candidate, throttle);
      if (result.longitude != null && result.latitude != null) return result;
      if (i < GEOCODE_MAX_RETRY) await sleep(180 * (i + 1));
    }
  }
  return { longitude: null as number | null, latitude: null as number | null };
}

export async function claimDispatchOrder(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
  await ensureUserManageColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    redirect(buildMobileQuery(formData, "new", { claimed: "0" }));
  }

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "new", { claimed: "0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const config = await getSystemConfigValues([
    SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit,
    SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit,
    SYSTEM_CONFIG_KEYS.claimLimitDisabled,
  ]);
  const preciseLimitRaw = Number(config.get(SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit) ?? "");
  const serviceLimitRaw = Number(config.get(SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit) ?? "");
  const preciseLimit =
    Number.isInteger(preciseLimitRaw) && preciseLimitRaw >= 0 ? preciseLimitRaw : DEFAULT_PRECISE_DAILY_LIMIT;
  const serviceLimit =
    Number.isInteger(serviceLimitRaw) && serviceLimitRaw >= 0 ? serviceLimitRaw : DEFAULT_SERVICE_DAILY_LIMIT;
  const claimLimitDisabled = config.get(SYSTEM_CONFIG_KEYS.claimLimitDisabled) === "1";
  const operatorConfigRows = (await prisma.$queryRaw`
    SELECT "canClaimOrders", "preciseClaimLimit", "serviceClaimLimit"
    FROM "User"
    WHERE "id" = ${operatorId}
      AND "tenantId" = ${tenantId}
      AND "isDeleted" = false
      AND "isDisabled" = false
    LIMIT 1
  `) as Array<{
    canClaimOrders: boolean | number | null;
    preciseClaimLimit: number | null;
    serviceClaimLimit: number | null;
  }>;
  const operatorConfig = operatorConfigRows[0];
  const canClaim =
    operatorConfig &&
    (operatorConfig.canClaimOrders === true ||
      operatorConfig.canClaimOrders === 1 ||
      operatorConfig.canClaimOrders == null);
  if (!canClaim) {
    redirect(buildMobileQuery(formData, "new", { op: "claim-disabled" }));
  }

  const targetOrder = await prisma.dispatchOrder.findFirst({
    where: {
      id: orderId,
      tenantId,
      isDeleted: false,
      status: "PENDING",
      claimedById: null,
    },
    select: { id: true, customerType: true },
  });
  if (!targetOrder) redirect(buildMobileQuery(formData, "new", { claimed: "0" }));

  const isPreciseOrder = isPreciseCustomerType(targetOrder.customerType);
  if (!claimLimitDisabled) {
    const { dayStart, dayEnd } = getShanghaiDayRange();
    const todayClaims = await prisma.dispatchOrderRecord.findMany({
      where: {
        operatorId,
        tenantId,
        actionType: "CLAIM",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: {
        remark: true,
        order: { select: { customerType: true } },
      },
    });
    const todayClaimedCount = todayClaims.filter((item) => {
      const taggedType = parseClaimTypeFromRemark(item.remark);
      if (taggedType) {
        return isPreciseOrder ? taggedType === "PRECISE" : taggedType === "SERVICE";
      }
      const currentIsPrecise = isPreciseCustomerType(item.order?.customerType);
      return isPreciseOrder ? currentIsPrecise : !currentIsPrecise;
    }).length;

    const hasPersonalPreciseLimit =
      operatorConfig?.preciseClaimLimit != null &&
      Number.isInteger(Number(operatorConfig.preciseClaimLimit)) &&
      Number(operatorConfig.preciseClaimLimit) >= 0;
    const hasPersonalServiceLimit =
      operatorConfig?.serviceClaimLimit != null &&
      Number.isInteger(Number(operatorConfig.serviceClaimLimit)) &&
      Number(operatorConfig.serviceClaimLimit) >= 0;
    const maxLimit = isPreciseOrder
      ? hasPersonalPreciseLimit
        ? Number(operatorConfig?.preciseClaimLimit)
        : preciseLimit
      : hasPersonalServiceLimit
        ? Number(operatorConfig?.serviceClaimLimit)
        : serviceLimit;
    if (todayClaimedCount >= maxLimit) {
      redirect(buildMobileQuery(formData, "new", { op: isPreciseOrder ? "claim-limit-precise" : "claim-limit-service" }));
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: {
        id: orderId,
        tenantId,
        isDeleted: false,
        status: "PENDING",
        claimedById: null,
      },
      data: {
        status: "CLAIMED",
        claimedById: operatorId,
        claimedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "CLAIM",
          remark: "领取单据",
          operatorLongitude: snapshot.operatorLongitude,
          operatorLatitude: snapshot.operatorLatitude,
        },
      });
    }

    return updated.count;
  });

  revalidatePath("/mobile");
  if (result > 0) redirect(buildMobileQuery(formData, "doing", { claimed: "1" }));
  redirect(buildMobileQuery(formData, "new", { claimed: "0" }));
}

export async function appendDispatchOrderRecord(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    redirect(buildMobileQuery(formData, "doing", { op: "append0" }));
  }

  const remark = String(formData.get("remark") ?? "").trim();
  const photo = formData.get("photo");
  const photoUrl = photo instanceof File ? await saveCompressedImage(photo, "orders") : undefined;
  if (photoUrl === "__TOO_LARGE__") redirect(buildMobileQuery(formData, "doing", { op: "file" }));
  if (!remark && !photoUrl) redirect(buildMobileQuery(formData, "doing", { op: "append-empty" }));

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "append0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "append0" }));

  await prisma.dispatchOrderRecord.create({
    data: {
      orderId,
      operatorId,
      tenantId,
      actionType: "APPEND",
      remark: remark || null,
      photoUrl,
      operatorLongitude: snapshot.operatorLongitude,
      operatorLatitude: snapshot.operatorLatitude,
    },
  });

  revalidatePath("/mobile");
  redirect(buildMobileQuery(formData, "doing", { op: "append1" }));
}

export async function finishDispatchOrder(formData: FormData) {
  await ensureDispatchOrderBusinessColumns();
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));
  const handledPhoneRaw = String(formData.get("handledPhone") ?? "").trim();
  const handledPhone = normalizeMobilePhone(handledPhoneRaw);
  const handledPhoneToSave = handledPhone || handledPhoneRaw || null;
  const handledRemark = String(formData.get("remark") ?? "").trim();
  const handledPhoto = formData.get("photo");
  const handledPhotoUrl = handledPhoto instanceof File ? await saveCompressedImage(handledPhoto, "orders") : undefined;
  if (handledPhotoUrl === "__TOO_LARGE__") redirect(buildMobileQuery(formData, "doing", { op: "file" }));
  const convertToPrecise = String(formData.get("convertToPrecise") ?? "") === "1";

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true, customerType: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const nextCustomerType = convertToPrecise ? "精准" : order.customerType;
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: {
        status: "DONE",
        handledPhone: handledPhoneToSave,
        notHandledReason: null,
        customerType: nextCustomerType,
        convertedToPreciseById: convertToPrecise ? operatorId : null,
        convertedToPreciseAt: convertToPrecise ? now : null,
      },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "FINISH",
          remark: `单据已办理${handledPhoneToSave ? `；办理号码：${handledPhoneToSave}` : ""}${handledRemark ? `；备注：${handledRemark}` : ""}${convertToPrecise ? "；转精准" : ""}`,
          photoUrl: handledPhotoUrl,
          operatorLongitude: snapshot.operatorLongitude,
          operatorLatitude: snapshot.operatorLatitude,
        },
      });
    }
    return updated.count;
  });

  revalidatePath("/mobile");
  if (result > 0) redirect(buildMobileQuery(formData, "doing", { op: "finish1" }));
  redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));
}

export async function endDispatchOrder(formData: FormData) {
  await ensureDispatchOrderBusinessColumns();
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));
  const endReasonRaw = String(formData.get("notHandledReason") ?? "").trim();
  const endReason = normalizeNotHandledReason(endReasonRaw);
  if (!END_REASON_OPTIONS.includes(endReason as (typeof END_REASON_OPTIONS)[number])) {
    redirect(buildMobileQuery(formData, "doing", { op: "end-reason" }));
  }
  const endRemark = String(formData.get("remark") ?? "").trim();
  if (!endRemark) {
    redirect(buildMobileQuery(formData, "doing", { op: "end-remark" }));
  }
  const endPhoto = formData.get("photo");
  const endPhotoUrl = endPhoto instanceof File ? await saveCompressedImage(endPhoto, "orders") : undefined;
  if (endPhotoUrl === "__TOO_LARGE__") redirect(buildMobileQuery(formData, "doing", { op: "file" }));

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: { status: "ENDED", notHandledReason: endReason, handledPhone: null },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "END",
          remark: `单据不办理；原因：${endReason}${endRemark ? `；备注：${endRemark}` : ""}`,
          photoUrl: endPhotoUrl,
          operatorLongitude: snapshot.operatorLongitude,
          operatorLatitude: snapshot.operatorLatitude,
        },
      });
    }
    return updated.count;
  });

  revalidatePath("/mobile");
  if (result > 0) redirect(buildMobileQuery(formData, "doing", { op: "end1" }));
  redirect(buildMobileQuery(formData, "doing", { op: "end0" }));
}

export async function rescheduleDispatchOrder(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));

  const scheduleAtText = String(formData.get("scheduleAt") ?? "").trim();
  const scheduleAt = scheduleAtText ? new Date(scheduleAtText) : null;
  if (!scheduleAt || Number.isNaN(scheduleAt.getTime())) {
    redirect(buildMobileQuery(formData, "doing", { op: "reschedule-empty" }));
  }
  const now = new Date();
  const maxAt = new Date(now.getTime() + RESCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000);
  if (scheduleAt.getTime() < now.getTime()) {
    redirect(buildMobileQuery(formData, "doing", { op: "reschedule-range" }));
  }
  if (scheduleAt.getTime() > maxAt.getTime()) {
    redirect(buildMobileQuery(formData, "doing", { op: "reschedule-range" }));
  }

  const remark = String(formData.get("remark") ?? "").trim();
  const nextAddress = String(formData.get("address") ?? "").trim();
  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true, address: true, longitude: true, latitude: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));

  const finalAddress = nextAddress || order.address || "";
  let finalLongitude = order.longitude ?? null;
  let finalLatitude = order.latitude ?? null;
  if (finalAddress) {
    const geocodeThrottle = createGeocodeThrottle(GEOCODE_MIN_INTERVAL_MS);
    const geo = await geocodeAddressWithRetry(finalAddress, geocodeThrottle);
    if (geo.longitude != null && geo.latitude != null) {
      finalLongitude = geo.longitude;
      finalLatitude = geo.latitude;
    }
  }

  const updatedCount = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false },
      data: {
        appointmentAt: scheduleAt,
        address: finalAddress,
        longitude: finalLongitude,
        latitude: finalLatitude,
      },
    });
    if (updated.count <= 0) {
      return 0;
    }
    await tx.dispatchOrderRecord.create({
      data: {
        orderId,
        operatorId,
        tenantId,
        actionType: "RESCHEDULE",
        remark: `改约时间：${new Date(scheduleAt).toLocaleString("zh-CN")}；地址：${finalAddress || "-"}${remark ? `；备注：${remark}` : ""}`,
        operatorLongitude: snapshot.operatorLongitude,
        operatorLatitude: snapshot.operatorLatitude,
      },
    });
    return updated.count;
  });

  revalidatePath("/mobile");
  if (updatedCount > 0) {
    redirect(buildMobileQuery(formData, "doing", { op: "reschedule1" }));
  }
  redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));
}

export async function convertDispatchOrderToPrecise(formData: FormData) {
  await ensureDispatchOrderBusinessColumns();
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "convert0" }));

  const operatorId = Number(session.user.id);
  const operator = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { tenantId: true, accessMode: true, isDeleted: true, isDisabled: true },
  });
  if (!operator || operator.isDeleted || operator.isDisabled || operator.accessMode !== "SUPERVISOR") {
    redirect(buildMobileQuery(formData, "doing", { op: "convert0" }));
  }
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "convert0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const remark = String(formData.get("remark") ?? "").trim();
  const region = String(formData.get("regionText") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const appointmentAtText = String(formData.get("appointmentAt") ?? "").trim();
  const appointmentAt = appointmentAtText ? new Date(appointmentAtText) : null;
  if (appointmentAt && Number.isNaN(appointmentAt.getTime())) {
    redirect(buildMobileQuery(formData, "doing", { op: "convert-date" }));
  }
  if (appointmentAt && !isConvertAppointmentWithinFutureDays(appointmentAt)) {
    redirect(buildMobileQuery(formData, "doing", { op: "convert-date" }));
  }

  const geocodeThrottle = createGeocodeThrottle(GEOCODE_MIN_INTERVAL_MS);
  let longitude: number | null = null;
  let latitude: number | null = null;
  if (address) {
    const geo = await geocodeAddressWithRetry(address, geocodeThrottle);
    longitude = geo.longitude;
    latitude = geo.latitude;
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.dispatchOrder.findFirst({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      select: { id: true, region: true, address: true, appointmentAt: true, longitude: true, latitude: true },
    });
    if (!current) return 0;

    const finalRegion = region || current.region || "";
    const finalAddress = address || current.address || "";
    const finalAppointmentAt = appointmentAt ?? current.appointmentAt ?? null;

    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: {
        customerType: "精准",
        status: "PENDING",
        claimedById: null,
        claimedAt: null,
        convertedToPreciseById: operatorId,
        convertedToPreciseAt: new Date(),
        region: finalRegion,
        address: finalAddress,
        appointmentAt: finalAppointmentAt,
        longitude: longitude ?? current.longitude ?? null,
        latitude: latitude ?? current.latitude ?? null,
      },
    });

    if (updated.count > 0) {
      const parts = [
        "转精准，状态重置为未领取",
        finalRegion ? `区域：${finalRegion}` : "",
        finalAddress ? `地址：${finalAddress}` : "",
        finalAppointmentAt ? `约定时间：${new Date(finalAppointmentAt).toLocaleString("zh-CN")}` : "",
        remark ? `备注：${remark}` : "",
      ].filter(Boolean);
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "CONVERT_PRECISE",
          remark: parts.join("；"),
          operatorLongitude: snapshot.operatorLongitude,
          operatorLatitude: snapshot.operatorLatitude,
        },
      });
    }
    return updated.count;
  });

  revalidatePath("/mobile");
  if (result > 0) redirect(buildMobileQuery(formData, "doing", { op: "convert1" }));
  redirect(buildMobileQuery(formData, "doing", { op: "convert0" }));
}

export async function updateMobileProfilePassword(formData: FormData) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const source = String(formData.get("source") ?? "").trim();
  const tabRaw = String(formData.get("tab") ?? "new");
  const tab = tabRaw === "doing" || tabRaw === "done" ? tabRaw : "new";
  const oldPassword = String(formData.get("oldPassword") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

  const profileRedirect = (op: string) => `/mobile/profile?op=${encodeURIComponent(op)}&tab=${encodeURIComponent(tab)}`;
  const mobileRedirect = (op: string) => buildMobileQuery(formData, tab, { op });
  const targetRedirect = (op: string) => (source === "profile" ? profileRedirect(op) : mobileRedirect(op));

  if (!oldPassword || !newPassword || !confirmPassword) {
    redirect(targetRedirect("profile-pwd0"));
  }
  if (newPassword.length < 6) {
    redirect(targetRedirect("profile-pwd-short"));
  }
  if (newPassword !== confirmPassword) {
    redirect(targetRedirect("profile-pwd-mismatch"));
  }

  const userId = Number(session.user.id);
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isDeleted: true, isDisabled: true },
  });
  if (!me || me.isDeleted || me.isDisabled) {
    redirect("/login");
  }

  const oldOk = await bcrypt.compare(oldPassword, me.passwordHash);
  if (!oldOk) {
    redirect(targetRedirect("profile-pwd-old"));
  }

  const nextHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: nextHash },
  });

  revalidatePath("/mobile/profile");
  revalidatePath("/mobile");
  redirect(targetRedirect("profile-pwd1"));
}
