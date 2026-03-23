"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns, ensureDispatchRecordGpsColumns } from "@/lib/db-ensure";
import { saveCompressedImage } from "@/lib/image-upload";
import { prisma } from "@/lib/prisma";
import { hasTenantDataScope, isTenantAdminRole } from "@/lib/tenant";

const createDispatchSchema = z.object({
  title: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(50),
  address: z.string().trim().min(1).max(200),
  customerType: z.string().trim().min(1).max(20),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/),
});

const MAX_IMPORT_ROWS = 500;
const GEOCODE_MIN_INTERVAL_MS = 260;
const GEOCODE_MAX_RETRY = 2;

const importDispatchSchema = z.object({
  title: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/),
  region: z.string().trim().max(50).optional(),
  address: z.string().trim().max(200).optional(),
  customerType: z.string().trim().max(20).optional(),
  remark: z.string().trim().max(500).optional(),
});

const leadImportSchema = z.object({
  inviteDate: z.string().trim().max(50).optional(),
  inviter: z.string().trim().max(50).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/),
  address: z.string().trim().min(1).max(200),
  meetTime: z.string().trim().max(100).optional(),
  numberType: z.string().trim().min(1).max(100),
});

const LUOYANG_REGION_KEYWORDS = [
  "老城区",
  "西工区",
  "瀍河回族区",
  "涧西区",
  "洛龙区",
  "孟津区",
  "偃师区",
  "新安县",
  "栾川县",
  "嵩县",
  "汝阳县",
  "宜阳县",
  "洛宁县",
  "伊川县",
];

const REGION_ALIAS_TO_FULL: Array<[string, string]> = [
  ["老城", "老城区"],
  ["西工", "西工区"],
  ["瀍河", "瀍河回族区"],
  ["涧西", "涧西区"],
  ["洛龙", "洛龙区"],
  ["孟津", "孟津区"],
  ["偃师", "偃师区"],
  ["新安", "新安县"],
  ["栾川", "栾川县"],
  ["嵩县", "嵩县"],
  ["汝阳", "汝阳县"],
  ["宜阳", "宜阳县"],
  ["洛宁", "洛宁县"],
  ["伊川", "伊川县"],
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseNullableNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) {
    return undefined;
  }
  const num = Number(text);
  if (Number.isNaN(num)) {
    return Number.NaN;
  }
  return num;
}

function parseImportCellNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const num = Number(text);
  if (Number.isNaN(num)) return Number.NaN;
  return num;
}

function parseOptionalDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createGeocodeThrottle(minIntervalMs: number) {
  let lastAt = 0;
  return async () => {
    const now = Date.now();
    const wait = minIntervalMs - (now - lastAt);
    if (wait > 0) {
      await sleep(wait);
    }
    lastAt = Date.now();
  };
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

  for (const [alias, full] of REGION_ALIAS_TO_FULL) {
    if (compact.includes(alias) && !compact.includes(full)) {
      const replaced = compact.replace(alias, full);
      set.add(replaced);
      set.add(`洛阳市${replaced}`);
      set.add(`河南省洛阳市${replaced}`);
    }
  }

  if (compact.includes("城关") && !compact.includes("城关镇")) {
    const withTown = compact.replace("城关", "城关镇");
    set.add(withTown);
    set.add(`洛阳市${withTown}`);
    set.add(`河南省洛阳市${withTown}`);
  }

  return Array.from(set).filter(Boolean);
}

function parseInviteDate(text: string) {
  const raw = text.trim();
  if (!raw) {
    return new Date();
  }
  const matched = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (!matched) {
    return new Date();
  }
  const now = new Date();
  const month = Number(matched[1]);
  const day = Number(matched[2]);
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return new Date();
  }
  return new Date(now.getFullYear(), month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
}

function detectRegionByAddress(address: string) {
  const text = address.trim();
  if (!text) return "";
  const found = LUOYANG_REGION_KEYWORDS.find((item) => text.includes(item));
  return found ?? "";
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
  if (!key) {
    return { longitude: null as number | null, latitude: null as number | null };
  }
  try {
    if (throttle) {
      await throttle();
    }
    const search = new URLSearchParams({
      key,
      address,
      city: "洛阳",
    });
    if (sig) {
      search.set("sig", sig);
    }
    const resp = await fetch(`https://restapi.amap.com/v3/geocode/geo?${search.toString()}`, {
      cache: "no-store",
    });
    if (!resp.ok) {
      return { longitude: null as number | null, latitude: null as number | null };
    }
    const json = (await resp.json()) as {
      status?: string;
      info?: string;
      infocode?: string;
      geocodes?: Array<{ location?: string }>;
    };
    if (json.status !== "1") {
      return { longitude: null as number | null, latitude: null as number | null };
    }
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

async function inputTipsAddress(address: string, throttle?: () => Promise<void>) {
  const key = resolveAmapWebKey();
  const sig = process.env.AMAP_WEB_SERVICE_SIG || process.env.AMAP_WEB_SIG || "";
  if (!key) {
    return { longitude: null as number | null, latitude: null as number | null };
  }
  try {
    if (throttle) {
      await throttle();
    }
    const search = new URLSearchParams({
      key,
      keywords: address,
      city: "洛阳",
      citylimit: "true",
      datatype: "all",
    });
    if (sig) {
      search.set("sig", sig);
    }
    const resp = await fetch(`https://restapi.amap.com/v3/assistant/inputtips?${search.toString()}`, {
      cache: "no-store",
    });
    if (!resp.ok) {
      return { longitude: null as number | null, latitude: null as number | null };
    }
    const json = (await resp.json()) as {
      status?: string;
      tips?: Array<{ location?: string }>;
    };
    if (json.status !== "1") {
      return { longitude: null as number | null, latitude: null as number | null };
    }
    const location = json.tips?.find((tip) => Boolean(tip.location))?.location ?? "";
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
      if (result.longitude != null && result.latitude != null) {
        return result;
      }
      if (i < GEOCODE_MAX_RETRY) {
        await sleep(220 * (i + 1));
      }
    }
  }

  for (const candidate of candidates) {
    const tipResult = await inputTipsAddress(candidate, throttle);
    if (tipResult.longitude != null && tipResult.latitude != null) {
      return tipResult;
    }
  }

  return { longitude: null as number | null, latitude: null as number | null };
}

async function findOrCreateInviterUserInTx(
  tx: Prisma.TransactionClient,
  inviterName: string,
  fallbackUserId: number,
  tenantId: number,
  defaultRoleId: number | null,
  cached = new Map<string, number>(),
) {
  const name = inviterName.trim();
  if (!name) {
    return fallbackUserId;
  }
  if (cached.has(name)) {
    return cached.get(name)!;
  }

  const existed = await tx.user.findFirst({
    where: {
      tenantId,
      OR: [{ username: name }, { displayName: name }],
    },
    select: { id: true },
  });
  if (existed) {
    cached.set(name, existed.id);
    return existed.id;
  }

  if (!defaultRoleId) {
    return fallbackUserId;
  }

  const base = `kf_${name.replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5]/g, "").slice(0, 20) || "user"}`;
  let username = base;
  let seq = 2;
  while (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${base}_${seq}`;
    seq += 1;
  }

  const passwordHash = await bcrypt.hash("123456", 10);
  const created = await tx.user.create({
    data: {
      username,
      displayName: name,
      passwordHash,
      roleId: defaultRoleId,
      accessMode: "BACKEND",
      tenantId,
    },
    select: { id: true },
  });
  cached.set(name, created.id);
  return created.id;
}

export async function createDispatchOrder(formData: FormData) {
  await ensureDispatchOrderBusinessColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { tenantId: true, role: { select: { code: true, dataScope: true } } },
  });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=invalid");
  }
  const canAll = hasTenantDataScope(me.role.code, me.role.dataScope);

  const longitude = parseNullableNumber(formData.get("longitude"));
  const latitude = parseNullableNumber(formData.get("latitude"));

  const parsed = createDispatchSchema.safeParse({
    title: formData.get("title"),
    region: formData.get("region"),
    address: formData.get("address"),
    customerType: formData.get("customerType"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    redirect("/dashboard/orders?err=invalid");
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size <= 0) {
    redirect("/dashboard/orders?err=invalid");
  }
  const photoUrl = await saveCompressedImage(photo, "orders");

  if (photoUrl === "__TOO_LARGE__") {
    redirect("/dashboard/orders?err=file");
  }

  const region = parsed.data.region;
  const address = parsed.data.address;
  const customerType = parsed.data.customerType;
  const remark = String(formData.get("remark") ?? "").trim();
  const appointmentAt = parseOptionalDateTime(formData.get("appointmentAt"));
  const enteredTitle = parsed.data.title.trim();
  const matchedPackage = await prisma.package.findFirst({
    where: {
      tenantId: Number(me.tenantId),
      isActive: true,
      name: enteredTitle,
    },
    select: { id: true },
  });

  await prisma.dispatchOrder.create({
    data: {
      title: enteredTitle,
      packageId: matchedPackage?.id ?? null,
      region,
      address,
      longitude,
      latitude,
      phone: parsed.data.phone,
      customerType,
      remark: remark || null,
      appointmentAt,
      photoUrl,
      tenantId: Number(me.tenantId),
      createdById: Number(session.user.id),
      status: "PENDING",
    },
  });

  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders?created=1");
}

export async function importDispatchOrders(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { tenantId: true },
  });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    redirect("/dashboard/orders?err=import_file");
  }

  let rows: unknown[][] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      redirect("/dashboard/orders?err=import_invalid");
    }
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  } catch {
    redirect("/dashboard/orders?err=import_invalid");
  }

  if (rows.length < 2) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key) {
      headerIndex.set(key, index);
    }
  });

  const titleIdx = headerIndex.get("标题") ?? headerIndex.get("title");
  const phoneIdx = headerIndex.get("手机号") ?? headerIndex.get("phone");
  const regionIdx = headerIndex.get("区域") ?? headerIndex.get("region");
  const addressIdx = headerIndex.get("地址") ?? headerIndex.get("address");
  const longitudeIdx = headerIndex.get("经度") ?? headerIndex.get("longitude") ?? headerIndex.get("lng");
  const latitudeIdx = headerIndex.get("纬度") ?? headerIndex.get("latitude") ?? headerIndex.get("lat");
  const customerTypeIdx = headerIndex.get("客户类型") ?? headerIndex.get("customertype");
  const remarkIdx = headerIndex.get("备注") ?? headerIndex.get("remark");

  if (titleIdx == null || phoneIdx == null) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    redirect("/dashboard/orders?err=import_invalid");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    redirect("/dashboard/orders?err=import_limit");
  }

  const geocodeThrottle = createGeocodeThrottle(GEOCODE_MIN_INTERVAL_MS);
  const geocodeCache = new Map<string, { longitude: number | null; latitude: number | null }>();

  const normalizedRows: Array<
    z.infer<typeof importDispatchSchema> & {
      packageId: number | null;
      longitude: number | null;
      latitude: number | null;
    }
  > = [];
  for (const row of dataRows) {
    const title = String(row[titleIdx] ?? "").trim();
    const phone = String(row[phoneIdx] ?? "").trim();

    const parsed = importDispatchSchema.safeParse({
      title,
      phone,
      region: regionIdx != null ? String(row[regionIdx] ?? "").trim() || undefined : undefined,
      address: addressIdx != null ? String(row[addressIdx] ?? "").trim() || undefined : undefined,
      customerType: customerTypeIdx != null ? String(row[customerTypeIdx] ?? "").trim() || undefined : undefined,
      remark: remarkIdx != null ? String(row[remarkIdx] ?? "").trim() || undefined : undefined,
    });

    if (!parsed.success) {
      redirect("/dashboard/orders?err=import_invalid");
    }

    const matchedPackage = await prisma.package.findFirst({
      where: { tenantId: Number(me.tenantId), isActive: true, name: parsed.data.title },
      select: { id: true },
    });

    const longitudeCell = longitudeIdx != null ? parseImportCellNumber(row[longitudeIdx]) : undefined;
    const latitudeCell = latitudeIdx != null ? parseImportCellNumber(row[latitudeIdx]) : undefined;
    if (Number.isNaN(longitudeCell) || Number.isNaN(latitudeCell)) {
      redirect("/dashboard/orders?err=import_invalid");
    }

    let longitude = longitudeCell ?? null;
    let latitude = latitudeCell ?? null;
    if ((longitude == null || latitude == null) && parsed.data.address) {
      const addressKey = parsed.data.address.trim();
      let geocode = geocodeCache.get(addressKey);
      if (!geocode) {
        geocode = await geocodeAddressWithRetry(parsed.data.address, geocodeThrottle);
        geocodeCache.set(addressKey, geocode);
      }
      longitude = longitude ?? geocode.longitude;
      latitude = latitude ?? geocode.latitude;
    }

    normalizedRows.push({
      ...parsed.data,
      packageId: matchedPackage?.id ?? null,
      longitude,
      latitude,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of normalizedRows) {
      const normalizedCustomerType = (item.customerType || "").includes("精准") ? "精准" : "客服";
      await tx.dispatchOrder.create({
        data: {
          title: item.title,
          packageId: item.packageId,
          region: item.region || "",
          address: item.address || "",
          longitude: item.longitude,
          latitude: item.latitude,
          phone: item.phone,
          customerType: normalizedCustomerType,
          remark: item.remark || null,
          status: "PENDING",
          tenantId: Number(me.tenantId),
          createdById: Number(session.user.id),
          claimedById: null,
          claimedAt: null,
        },
      });
    }
  });

  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders?imported=${normalizedRows.length}`);
}

export async function importLeadDispatchOrders(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { tenantId: true },
  });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    redirect("/dashboard/orders?err=import_file");
  }

  let rows: unknown[][] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      redirect("/dashboard/orders?err=import_invalid");
    }
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  } catch {
    redirect("/dashboard/orders?err=import_invalid");
  }

  if (rows.length < 2) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key) {
      headerIndex.set(key, index);
    }
  });

  const inviteDateIdx = headerIndex.get("邀约日期") ?? headerIndex.get("inviteDate");
  const inviterIdx = headerIndex.get("邀约客服") ?? headerIndex.get("inviter");
  const phoneIdx = headerIndex.get("客户电话") ?? headerIndex.get("电话") ?? headerIndex.get("phone");
  const addressIdx = headerIndex.get("客户地址") ?? headerIndex.get("地址") ?? headerIndex.get("address");
  const meetTimeIdx = headerIndex.get("邀约见面时间") ?? headerIndex.get("meetTime");
  const numberTypeIdx = headerIndex.get("号码类型") ?? headerIndex.get("title") ?? headerIndex.get("标题");

  if (phoneIdx == null || addressIdx == null || numberTypeIdx == null) {
    redirect("/dashboard/orders?err=import_invalid");
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    redirect("/dashboard/orders?err=import_invalid");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    redirect("/dashboard/orders?err=import_limit");
  }

  const geocodeThrottle = createGeocodeThrottle(GEOCODE_MIN_INTERVAL_MS);
  const geocodeCache = new Map<string, { longitude: number | null; latitude: number | null }>();

  const defaultRole =
    (await prisma.role.findFirst({
      where: { code: "USER" },
      select: { id: true },
    })) ??
    (await prisma.role.findFirst({
      orderBy: { id: "asc" },
      select: { id: true },
    }));
  const defaultRoleId = defaultRole?.id ?? null;

  const createPayloads: Array<{
    title: string;
    packageId: number | null;
    region: string;
    address: string;
    longitude: number | null;
    latitude: number | null;
    phone: string;
    customerType: string;
    remark: string | null;
    inviterName: string;
    createdAt: Date;
  }> = [];

  for (const row of dataRows) {
    const parsed = leadImportSchema.safeParse({
      inviteDate: inviteDateIdx != null ? String(row[inviteDateIdx] ?? "").trim() || undefined : undefined,
      inviter: inviterIdx != null ? String(row[inviterIdx] ?? "").trim() || undefined : undefined,
      phone: String(row[phoneIdx] ?? "").trim(),
      address: String(row[addressIdx] ?? "").trim(),
      meetTime: meetTimeIdx != null ? String(row[meetTimeIdx] ?? "").trim() || undefined : undefined,
      numberType: String(row[numberTypeIdx] ?? "").trim(),
    });

    if (!parsed.success) {
      redirect("/dashboard/orders?err=import_invalid");
    }

    const matchedPackage = await prisma.package.findFirst({
      where: { tenantId: Number(me.tenantId), isActive: true, name: parsed.data.numberType },
      select: { id: true },
    });
    const addressKey = parsed.data.address.trim();
    let geocode = geocodeCache.get(addressKey);
    if (!geocode) {
      geocode = await geocodeAddressWithRetry(parsed.data.address, geocodeThrottle);
      geocodeCache.set(addressKey, geocode);
    }
    const meetRemark = parsed.data.meetTime ? `邀约见面时间：${parsed.data.meetTime}` : "";

    createPayloads.push({
      title: parsed.data.numberType,
      packageId: matchedPackage?.id ?? null,
      region: detectRegionByAddress(parsed.data.address),
      address: parsed.data.address,
      longitude: geocode.longitude,
      latitude: geocode.latitude,
      phone: parsed.data.phone,
      customerType: "客服",
      remark: meetRemark || null,
      inviterName: parsed.data.inviter ?? "",
      createdAt: parseInviteDate(parsed.data.inviteDate ?? ""),
    });
  }

  await prisma.$transaction(async (tx) => {
    const createdByCache = new Map<string, number>();
    for (const payload of createPayloads) {
      const creatorId = await findOrCreateInviterUserInTx(
        tx,
        payload.inviterName,
        Number(session.user.id),
        Number(me.tenantId),
        defaultRoleId,
        createdByCache,
      );
      await tx.dispatchOrder.create({
        data: {
          title: payload.title,
          packageId: payload.packageId,
          region: payload.region,
          address: payload.address,
          longitude: payload.longitude,
          latitude: payload.latitude,
          phone: payload.phone,
          customerType: payload.customerType,
          remark: payload.remark,
          status: "PENDING",
          tenantId: Number(me.tenantId),
          createdById: creatorId,
          claimedById: null,
          claimedAt: null,
          createdAt: payload.createdAt,
        },
      });
    }
  });

  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders?imported=${createPayloads.length}`);
}

const updateDispatchSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  packageId: z.coerce.number().int().positive(),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/),
  status: z.string().trim().min(1).max(20),
});

async function canAccessOrder(orderId: number, userId: number, roleCode: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, role: { select: { code: true, dataScope: true } } },
  });
  if (!me?.tenantId) return null;
  const canAll = hasTenantDataScope(me.role.code, me.role.dataScope);
  const where = canAll
    ? { id: orderId, isDeleted: false, tenantId: Number(me.tenantId) }
    : { id: orderId, isDeleted: false, tenantId: Number(me.tenantId), createdById: userId };
  return prisma.dispatchOrder.findFirst({ where, select: { id: true } });
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

async function hasMenuPermission(userId: number, menuKey: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: {
        select: {
          code: true,
          roleMenus: {
            select: { menu: { select: { key: true } } },
          },
        },
      },
    },
  });

  if (!user) return false;
  if (isTenantAdminRole(user.role.code)) return true;
  return user.role.roleMenus.some((item) => item.menu.key === menuKey);
}

export async function updateDispatchOrder(formData: FormData) {
  await ensureDispatchOrderBusinessColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { tenantId: true, role: { select: { code: true, dataScope: true } } },
  });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=invalid");
  }
  const canAll = hasTenantDataScope(me.role.code, me.role.dataScope);

  const longitude = parseNullableNumber(formData.get("longitude"));
  const latitude = parseNullableNumber(formData.get("latitude"));

  const parsed = updateDispatchSchema.safeParse({
    orderId: formData.get("orderId"),
    packageId: formData.get("packageId"),
    phone: formData.get("phone"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect("/dashboard/orders?err=invalid");
  }

  const order = await prisma.dispatchOrder.findFirst({
    where:
      canAll
        ? { id: parsed.data.orderId, tenantId: Number(me.tenantId), isDeleted: false, status: "PENDING" }
        : { id: parsed.data.orderId, tenantId: Number(me.tenantId), createdById: Number(session.user.id), isDeleted: false, status: "PENDING" },
    select: { id: true },
  });
  if (!order) {
    redirect("/dashboard/orders?err=edit_state");
  }

  const selectedPackage = await prisma.package.findFirst({
    where: { id: parsed.data.packageId, tenantId: Number(me.tenantId) },
    select: { id: true, name: true, code: true },
  });
  if (!selectedPackage) {
    redirect("/dashboard/orders?err=invalid");
  }

  const region = String(formData.get("region") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const customerType = String(formData.get("customerType") ?? "").trim();
  const remark = String(formData.get("remark") ?? "").trim();
  const claimedByIdText = String(formData.get("claimedById") ?? "").trim();
  const claimedAtText = String(formData.get("claimedAt") ?? "").trim();

  const claimedById = claimedByIdText ? Number(claimedByIdText) : null;
  const claimedAt = claimedAtText ? new Date(claimedAtText) : null;

  await prisma.dispatchOrder.update({
    where: { id: parsed.data.orderId },
    data: {
      title: `${selectedPackage.name} (${selectedPackage.code})`,
      packageId: selectedPackage.id,
      region,
      address,
      longitude,
      latitude,
      phone: parsed.data.phone,
      customerType,
      remark: remark || null,
      status: parsed.data.status,
      claimedById: Number.isInteger(claimedById) ? claimedById : null,
      claimedAt,
    },
  });

  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${parsed.data.orderId}?updated=1`);
}

export async function appendDispatchOrderRecordByBackend(formData: FormData) {
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  if (!me?.tenantId) {
    redirect(`/dashboard/orders/${Number(formData.get("orderId")) || ""}?op=append0`);
  }
  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    redirect(`/dashboard/orders/${orderId || ""}?op=append0`);
  }

  const order = await canAccessOrder(orderId, operatorId, session.user.roleCode);
  if (!order) {
    redirect(`/dashboard/orders/${orderId}?op=append0`);
  }

  const remark = String(formData.get("remark") ?? "").trim();
  const photo = formData.get("photo");
  const photoUrl = photo instanceof File ? await saveCompressedImage(photo, "orders") : undefined;
  if (photoUrl === "__TOO_LARGE__") {
    redirect(`/dashboard/orders/${orderId}?op=file`);
  }
  if (!remark && !photoUrl) {
    redirect(`/dashboard/orders/${orderId}?op=append-empty`);
  }

  const snapshot = await getOperatorLocationSnapshot(operatorId);
  await prisma.dispatchOrderRecord.create({
    data: {
      orderId,
      operatorId,
      actionType: "APPEND",
      tenantId: Number(me.tenantId),
      remark: remark || null,
      photoUrl,
      operatorLongitude: snapshot.operatorLongitude,
      operatorLatitude: snapshot.operatorLatitude,
    },
  });

  revalidatePath(`/dashboard/orders/${orderId}`);
  redirect(`/dashboard/orders/${orderId}?op=append1`);
}

export async function assignDispatchOrder(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=assign_invalid");
  }
  const hasPerm = await hasMenuPermission(operatorId, "perm-order-dispatch-assign");
  if (!hasPerm) {
    redirect("/dashboard/orders?err=assign_perm");
  }

  const orderId = Number(formData.get("orderId"));
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(userId) || userId <= 0) {
    redirect("/dashboard/orders?err=assign_invalid");
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, tenantId: Number(me.tenantId), accessMode: "MOBILE" },
    select: { id: true, displayName: true },
  });
  if (!targetUser) {
    redirect("/dashboard/orders?err=assign_user");
  }

  const order = await canAccessOrder(orderId, operatorId, session.user.roleCode);
  if (!order) {
    redirect("/dashboard/orders?err=assign_invalid");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dispatchOrder.updateMany({
      where: {
        id: orderId,
        tenantId: Number(me.tenantId),
        isDeleted: false,
        status: "PENDING",
        claimedById: null,
      },
      data: {
        status: "CLAIMED",
        claimedById: targetUser.id,
        claimedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      await tx.dispatchOrderRecord.create({
        data: {
          orderId,
          operatorId,
          tenantId: Number(me.tenantId),
          actionType: "CLAIM",
          remark: `后台派单给：${targetUser.displayName}`,
        },
      });
    }

    return updated.count;
  });

  revalidatePath("/dashboard/orders");
  if (result > 0) {
    redirect("/dashboard/orders?assigned=1");
  }
  redirect("/dashboard/orders?err=assign_state");
}

export async function deleteDispatchOrder(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const orderId = Number(formData.get("orderId"));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    redirect("/dashboard/orders");
  }

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  if (!me?.tenantId) {
    redirect("/dashboard/orders?err=delete_state");
  }
  const meRole = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { role: { select: { code: true, dataScope: true } } },
  });
  const canAll = meRole ? hasTenantDataScope(meRole.role.code, meRole.role.dataScope) : false;
  const hasPerm = await hasMenuPermission(operatorId, "perm-order-delete-btn");
  if (!hasPerm) {
    redirect("/dashboard/orders?err=delete_perm");
  }

  const where =
      canAll
      ? { id: orderId, tenantId: Number(me.tenantId), isDeleted: false, status: "PENDING" }
      : { id: orderId, tenantId: Number(me.tenantId), createdById: operatorId, isDeleted: false, status: "PENDING" };
  const order = await prisma.dispatchOrder.findFirst({ where, select: { id: true } });
  if (!order) {
    redirect("/dashboard/orders?err=delete_state");
  }

  await prisma.dispatchOrder.update({
    where: { id: orderId },
    data: { isDeleted: true },
  });
  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders?deleted=1");
}

export async function deleteDispatchOrdersBatch(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const keyword = String(formData.get("keyword") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const pageSize = String(formData.get("pageSize") ?? "").trim();
  const qs = new URLSearchParams();
  if (keyword) qs.set("keyword", keyword);
  if (status) qs.set("status", status);
  if (pageSize) qs.set("pageSize", pageSize);
  qs.set("page", "1");
  const redirectBase = `/dashboard/orders${qs.toString() ? `?${qs.toString()}` : ""}`;

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  if (!me?.tenantId) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_state`);
  }
  const hasPerm = await hasMenuPermission(operatorId, "perm-order-delete-btn");
  if (!hasPerm) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_perm`);
  }

  const orderIds = formData
    .getAll("orderIds")
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (orderIds.length === 0) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_state`);
  }

  const meRole = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { role: { select: { code: true, dataScope: true } } },
  });
  const canAll = meRole ? hasTenantDataScope(meRole.role.code, meRole.role.dataScope) : false;
  const uniqueIds = Array.from(new Set(orderIds));
  const where =
    canAll
      ? { id: { in: uniqueIds }, tenantId: Number(me.tenantId), isDeleted: false, status: "PENDING" as const }
      : { id: { in: uniqueIds }, tenantId: Number(me.tenantId), createdById: operatorId, isDeleted: false, status: "PENDING" as const };

  const result = await prisma.dispatchOrder.updateMany({
    where,
    data: { isDeleted: true },
  });

  revalidatePath("/dashboard/orders");
  if (result.count <= 0) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_state`);
  }
  redirect(`${redirectBase}${qs.toString() ? "&" : "?"}deleted=1&deletedBatch=${result.count}`);
}

export async function batchOperateDispatchOrders(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const keyword = String(formData.get("keyword") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const pageSize = String(formData.get("pageSize") ?? "").trim();
  const qs = new URLSearchParams();
  if (keyword) qs.set("keyword", keyword);
  if (status) qs.set("status", status);
  if (pageSize) qs.set("pageSize", pageSize);
  qs.set("page", "1");
  const redirectBase = `/dashboard/orders${qs.toString() ? `?${qs.toString()}` : ""}`;

  const orderIds = formData
    .getAll("orderIds")
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  const uniqueIds = Array.from(new Set(orderIds));
  if (uniqueIds.length === 0) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_invalid`);
  }

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({ where: { id: operatorId }, select: { tenantId: true } });
  if (!me?.tenantId) {
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_invalid`);
  }
  const meRole = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { role: { select: { code: true, dataScope: true } } },
  });
  const canAll = meRole ? hasTenantDataScope(meRole.role.code, meRole.role.dataScope) : false;
  const intent = String(formData.get("intent") ?? "").trim();

  if (intent === "assign") {
    const hasPerm = await hasMenuPermission(operatorId, "perm-order-dispatch-assign");
    if (!hasPerm) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_perm`);
    }

    const userId = Number(formData.get("userId"));
    if (!Number.isInteger(userId) || userId <= 0) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_user`);
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, tenantId: Number(me.tenantId), accessMode: "MOBILE" },
      select: { id: true, displayName: true },
    });
    if (!targetUser) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_user`);
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const candidateOrders = await tx.dispatchOrder.findMany({
        where: {
          id: { in: uniqueIds },
          tenantId: Number(me.tenantId),
          ...(canAll ? {} : { createdById: operatorId }),
          isDeleted: false,
          status: "PENDING",
          claimedById: null,
        },
        select: { id: true },
      });
      const ids = candidateOrders.map((item) => item.id);
      if (ids.length === 0) {
        return 0;
      }
      if (ids.length !== uniqueIds.length) {
        return -1;
      }

      await tx.dispatchOrder.updateMany({
        where: { id: { in: ids }, tenantId: Number(me.tenantId) },
        data: {
          status: "CLAIMED",
          claimedById: targetUser.id,
          claimedAt: now,
        },
      });

      await tx.dispatchOrderRecord.createMany({
        data: ids.map((id) => ({
          orderId: id,
          operatorId,
          tenantId: Number(me.tenantId),
          actionType: "CLAIM",
          remark: `后台批量派单给：${targetUser.displayName}`,
        })),
      });

      return ids.length;
    });

    revalidatePath("/dashboard/orders");
    if (result <= 0) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_state`);
    }
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}assigned=1&assignedBatch=${result}`);
  }

  if (intent === "delete") {
    const hasPerm = await hasMenuPermission(operatorId, "perm-order-delete-btn");
    if (!hasPerm) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_perm`);
    }

    const where =
      canAll
        ? { id: { in: uniqueIds }, tenantId: Number(me.tenantId), isDeleted: false, status: "PENDING" as const }
        : { id: { in: uniqueIds }, tenantId: Number(me.tenantId), createdById: operatorId, isDeleted: false, status: "PENDING" as const };

    const candidates = await prisma.dispatchOrder.findMany({
      where,
      select: { id: true },
    });
    if (candidates.length !== uniqueIds.length) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_state`);
    }

    const result = await prisma.dispatchOrder.updateMany({
      where: { id: { in: uniqueIds }, tenantId: Number(me.tenantId), isDeleted: false, status: "PENDING" },
      data: { isDeleted: true },
    });
    revalidatePath("/dashboard/orders");
    if (result.count <= 0) {
      redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=delete_state`);
    }
    redirect(`${redirectBase}${qs.toString() ? "&" : "?"}deleted=1&deletedBatch=${result.count}`);
  }

  redirect(`${redirectBase}${qs.toString() ? "&" : "?"}err=assign_invalid`);
}



