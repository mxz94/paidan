"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchRecordGpsColumns } from "@/lib/db-ensure";
import { saveCompressedImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import { getSystemConfigValues, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";

const DEFAULT_PRECISE_DAILY_LIMIT = 3;
const DEFAULT_SERVICE_DAILY_LIMIT = 20;
const PRECISE_FINISH_RADIUS_KM = 2;

async function getOperatorTenantId(operatorId: number) {
  const user = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  return user?.tenantId ?? null;
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

function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildMobileQuery(formData: FormData, nextTab: "new" | "doing" | "done", extra?: Record<string, string>) {
  const search = new URLSearchParams();
  search.set("tab", nextTab);
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

export async function claimDispatchOrder(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
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

  const isPreciseOrder = (targetOrder.customerType || "").includes("精准");
  if (!claimLimitDisabled) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayClaimedCount = await prisma.dispatchOrderRecord.count({
      where: {
        operatorId,
        tenantId,
        actionType: "CLAIM",
        createdAt: { gte: dayStart, lte: dayEnd },
        order: isPreciseOrder
          ? { customerType: { contains: "精准" } }
          : { NOT: { customerType: { contains: "精准" } } },
      },
    });

    const maxLimit = isPreciseOrder ? preciseLimit : serviceLimit;
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
  if (result > 0) redirect(buildMobileQuery(formData, "new", { claimed: "1" }));
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
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true, customerType: true, longitude: true, latitude: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "finish0" }));

  const isPrecise = (order.customerType || "").includes("精准");
  if (isPrecise) {
    if (snapshot.operatorLatitude == null || snapshot.operatorLongitude == null || order.latitude == null || order.longitude == null) {
      redirect(buildMobileQuery(formData, "doing", { op: "finish-distance" }));
    }
    const distance = calcDistanceKm(snapshot.operatorLatitude, snapshot.operatorLongitude, order.latitude, order.longitude);
    if (distance > PRECISE_FINISH_RADIUS_KM) redirect(buildMobileQuery(formData, "doing", { op: "finish-distance" }));
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: { status: "DONE" },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "FINISH",
          remark: "单据完结",
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
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true, customerType: true, longitude: true, latitude: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "end0" }));

  const isPrecise = (order.customerType || "").includes("精准");
  if (isPrecise) {
    if (snapshot.operatorLatitude == null || snapshot.operatorLongitude == null || order.latitude == null || order.longitude == null) {
      redirect(buildMobileQuery(formData, "doing", { op: "end-distance" }));
    }
    const distance = calcDistanceKm(snapshot.operatorLatitude, snapshot.operatorLongitude, order.latitude, order.longitude);
    if (distance > PRECISE_FINISH_RADIUS_KM) redirect(buildMobileQuery(formData, "doing", { op: "end-distance" }));
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: { status: "ENDED" },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "END",
          remark: "单据结束",
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

  const remark = String(formData.get("remark") ?? "").trim();
  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
    select: { id: true },
  });
  if (!order) redirect(buildMobileQuery(formData, "doing", { op: "reschedule0" }));

  await prisma.dispatchOrderRecord.create({
    data: {
      orderId,
      operatorId,
      tenantId,
      actionType: "RESCHEDULE",
      remark: `改约时间：${new Date(scheduleAt).toLocaleString("zh-CN")}${remark ? `；备注：${remark}` : ""}`,
      operatorLongitude: snapshot.operatorLongitude,
      operatorLatitude: snapshot.operatorLatitude,
    },
  });

  revalidatePath("/mobile");
  redirect(buildMobileQuery(formData, "doing", { op: "reschedule1" }));
}

export async function returnDispatchOrder(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect(buildMobileQuery(formData, "doing", { op: "return0" }));

  const operatorId = Number(session.user.id);
  const tenantId = await getOperatorTenantId(operatorId);
  if (!tenantId) redirect(buildMobileQuery(formData, "doing", { op: "return0" }));

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  const remark = String(formData.get("remark") ?? "").trim();

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: { id: orderId, tenantId, isDeleted: false, status: "CLAIMED", claimedById: operatorId },
      data: {
        status: "PENDING",
        claimedById: null,
        claimedAt: null,
      },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId,
          actionType: "RETURN",
          remark: remark || "退单回待领取",
          operatorLongitude: snapshot.operatorLongitude,
          operatorLatitude: snapshot.operatorLatitude,
        },
      });
    }
    return updated.count;
  });

  revalidatePath("/mobile");
  if (result > 0) redirect(buildMobileQuery(formData, "doing", { op: "return1" }));
  redirect(buildMobileQuery(formData, "doing", { op: "return0" }));
}
