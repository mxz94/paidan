"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { ensureStoreTable, ensureUserManageColumns, ensureUserStoreColumn } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant } from "@/lib/tenant";
import { normalizeAccessMode } from "@/lib/user-access";
import { ensureUserPackageBindingTable, replaceUserAllowedPackages } from "@/lib/user-package-bindings";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(30),
  displayName: z.string().trim().min(2).max(30),
  password: z.string().min(6).max(50),
  accessMode: z.enum(["SUPERVISOR", "SERVICE", "SALE"]),
  roleId: z.coerce.number().int().positive(),
  storeId: z.coerce.number().int().positive(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  canClaimOrders: z.boolean().default(true),
  preciseClaimLimit: z.coerce.number().int().min(0).optional(),
  serviceClaimLimit: z.coerce.number().int().min(0).optional(),
});

const updateUserSchema = z.object({
  userId: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(2).max(30),
  accessMode: z.enum(["SUPERVISOR", "SERVICE", "SALE"]),
  roleId: z.coerce.number().int().positive(),
  password: z.string().optional(),
  canClaimOrders: z.boolean().default(true),
  preciseClaimLimit: z.coerce.number().int().min(0).optional(),
  serviceClaimLimit: z.coerce.number().int().min(0).optional(),
});

const idOnlySchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const importUserSchema = z.object({
  username: z.string().trim().min(3).max(30),
  displayName: z.string().trim().min(2).max(30),
  password: z.string().min(6).max(50),
  accessMode: z.enum(["SUPERVISOR", "SERVICE", "SALE"]),
  roleText: z.string().trim().min(1),
  storeText: z.string().trim().min(1),
});

const MAX_IMPORT_ROWS = 500;

function isProtectedSystemUser(user?: {
  username?: string | null;
  displayName?: string | null;
  roleCode?: string | null;
}) {
  const username = String(user?.username ?? "").toLowerCase();
  const displayName = String(user?.displayName ?? "");
  const roleCode = String(user?.roleCode ?? "");
  return (
    username === "admin" ||
    username === "root" ||
    displayName === "系统管理员" ||
    roleCode === "SUPER_ADMIN"
  );
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseAccessMode(value: unknown): "SUPERVISOR" | "SERVICE" | "SALE" | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;
  if (["SUPERVISOR", "主管"].includes(text)) return "SUPERVISOR";
  if (["SERVICE", "客服"].includes(text)) return "SERVICE";
  if (["SALE", "业务员"].includes(text)) return "SALE";
  return null;
}

async function ensureStoreSupervisorAvailable(params: {
  tenantId: number;
  storeId: number;
  excludeUserId?: number;
}) {
  const existingSupervisor = await prisma.user.findFirst({
    where: {
      tenantId: params.tenantId,
      storeId: params.storeId,
      accessMode: "SUPERVISOR",
      isDeleted: false,
      ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
    },
    select: { username: true, displayName: true, store: { select: { name: true } } },
  });
  if (!existingSupervisor) {
    return;
  }
  const managerName = encodeURIComponent(
    existingSupervisor.displayName || existingSupervisor.username,
  );
  const storeName = encodeURIComponent(existingSupervisor.store?.name || "当前门店");
  redirect(`/dashboard/users?err=store_supervisor&manager=${managerName}&storeName=${storeName}`);
}

async function ensureUserManagePermission() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/dashboard");
  }
  const me = await getSessionUserWithTenant();
  if (!Number(me.tenantId)) {
    redirect("/dashboard");
  }

  const hasPermission = await prisma.user.findFirst({
    where: {
      id: me.id,
      tenantId: Number(me.tenantId),
      role: {
        roleMenus: {
          some: {
            menu: { key: "user-manage" },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!hasPermission) {
    redirect("/dashboard");
  }

  return { session, me };
}

export async function createUser(formData: FormData) {
  await ensureStoreTable();
  await ensureUserManageColumns();
  await ensureUserStoreColumn();
  await ensureUserPackageBindingTable();
  const { me } = await ensureUserManagePermission();

  const longitudeInput = String(formData.get("longitude") ?? "").trim();
  const latitudeInput = String(formData.get("latitude") ?? "").trim();
  const preciseClaimLimitInput = String(formData.get("preciseClaimLimit") ?? "").trim();
  const serviceClaimLimitInput = String(formData.get("serviceClaimLimit") ?? "").trim();

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    accessMode: normalizeAccessMode(String(formData.get("userType") ?? "")),
    roleId: formData.get("roleId"),
    storeId: formData.get("storeId"),
    longitude: longitudeInput ? Number(longitudeInput) : undefined,
    latitude: latitudeInput ? Number(latitudeInput) : undefined,
    canClaimOrders: String(formData.get("canClaimOrders") ?? "1") !== "0",
    preciseClaimLimit: preciseClaimLimitInput ? Number(preciseClaimLimitInput) : undefined,
    serviceClaimLimit: serviceClaimLimitInput ? Number(serviceClaimLimitInput) : undefined,
  });

  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }
  const selectedPackageIds = Array.from(
    new Set(
      formData
        .getAll("allowedPackageIds")
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x > 0),
    ),
  );
  const scopedStoreId = Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? Number(me.storeId) : null;
  const effectiveStoreId = scopedStoreId ?? parsed.data.storeId;

  const role = await prisma.role.findFirst({
    where: { id: parsed.data.roleId, tenantId: Number(me.tenantId) },
  });
  if (!role) {
    redirect("/dashboard/users?err=role");
  }
  const store = await prisma.store.findFirst({
    where: { id: effectiveStoreId, tenantId: Number(me.tenantId), isDeleted: false },
    select: { id: true },
  });
  if (!store) {
    redirect("/dashboard/users?err=store");
  }

  if (parsed.data.accessMode === "SUPERVISOR") {
    await ensureStoreSupervisorAvailable({
      tenantId: Number(me.tenantId),
      storeId: effectiveStoreId,
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true },
  });

  if (existingUser) {
    redirect("/dashboard/users?err=exists");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const created = await prisma.user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash,
      accessMode: parsed.data.accessMode,
      isDeleted: false,
      isDisabled: false,
      roleId: parsed.data.roleId,
      storeId: effectiveStoreId,
      tenantId: Number(me.tenantId),
      longitude: parsed.data.longitude,
      latitude: parsed.data.latitude,
      canClaimOrders: parsed.data.canClaimOrders,
      preciseClaimLimit: parsed.data.preciseClaimLimit ?? null,
      serviceClaimLimit: parsed.data.serviceClaimLimit ?? null,
      locationAt:
        parsed.data.longitude !== undefined && parsed.data.latitude !== undefined ? new Date() : null,
    },
  });
  if (parsed.data.accessMode === "SALE") {
    const valid = await prisma.package.findMany({
      where: { tenantId: Number(me.tenantId), id: { in: selectedPackageIds } },
      select: { id: true },
    });
    await replaceUserAllowedPackages(Number(me.tenantId), created.id, valid.map((x) => x.id));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/users");
  redirect("/dashboard/users?created=1");
}

export async function importUsers(formData: FormData) {
  await ensureStoreTable();
  await ensureUserManageColumns();
  await ensureUserStoreColumn();
  const { me } = await ensureUserManagePermission();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    redirect("/dashboard/users?err=import_file");
  }

  let rows: unknown[][] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      redirect("/dashboard/users?err=import_invalid");
    }
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  } catch {
    redirect("/dashboard/users?err=import_invalid");
  }

  if (rows.length < 2) {
    redirect("/dashboard/users?err=import_invalid");
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key) headerIndex.set(key, index);
  });

  const usernameIdx = headerIndex.get("用户名") ?? headerIndex.get("username");
  const displayNameIdx = headerIndex.get("姓名") ?? headerIndex.get("displayname");
  const passwordIdx = headerIndex.get("密码") ?? headerIndex.get("password");
  const roleIdx = headerIndex.get("角色") ?? headerIndex.get("rolename") ?? headerIndex.get("role");
  const accessModeIdx =
    headerIndex.get("用户类型") ?? headerIndex.get("usertype");
  const storeIdx = headerIndex.get("门店") ?? headerIndex.get("store") ?? headerIndex.get("storename");

  if (usernameIdx == null || displayNameIdx == null || passwordIdx == null || roleIdx == null || accessModeIdx == null || storeIdx == null) {
    redirect("/dashboard/users?err=import_invalid");
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    redirect("/dashboard/users?err=import_invalid");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    redirect("/dashboard/users?err=import_limit");
  }

  const roles = await prisma.role.findMany({
    where: { tenantId: Number(me.tenantId) },
    select: { id: true, name: true },
  });
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));
  const stores = await prisma.store.findMany({
    where: {
      tenantId: Number(me.tenantId),
      isDeleted: false,
      ...(Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? { id: Number(me.storeId) } : {}),
    },
    select: { id: true, name: true },
  });
  const storeByName = new Map(stores.map((s) => [s.name, s.id]));

  const seenUsernames = new Set<string>();
  const parsedRows: Array<{
    username: string;
    displayName: string;
    passwordHash: string;
    roleId: number;
    storeId: number;
    accessMode: "SUPERVISOR" | "SERVICE" | "SALE";
  }> = [];

  for (const row of dataRows) {
    const username = String(row[usernameIdx] ?? "").trim();
    const displayName = String(row[displayNameIdx] ?? "").trim();
    const password = String(row[passwordIdx] ?? "").trim();
    const roleText = String(row[roleIdx] ?? "").trim();
    const accessMode = parseAccessMode(row[accessModeIdx]);
    const storeText = String(row[storeIdx] ?? "").trim();

    const parsed = importUserSchema.safeParse({
      username,
      displayName,
      password,
      accessMode: accessMode ?? "",
      roleText,
      storeText,
    });

    if (!parsed.success || seenUsernames.has(username.toLowerCase())) {
      redirect("/dashboard/users?err=import_invalid");
    }

    const roleId = roleByName.get(roleText);
    if (!roleId) {
      redirect("/dashboard/users?err=import_role");
    }
    const storeId = storeByName.get(storeText);
    if (!storeId) {
      redirect("/dashboard/users?err=store");
    }

    seenUsernames.add(username.toLowerCase());
    parsedRows.push({
      username,
      displayName,
      passwordHash: await bcrypt.hash(password, 10),
      roleId,
      storeId,
      accessMode: parsed.data.accessMode,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of parsedRows) {
      const existed = await tx.user.findUnique({
        where: { username: item.username },
        select: { id: true, tenantId: true, isDeleted: true },
      });
      if (existed && existed.tenantId !== Number(me.tenantId)) {
        redirect("/dashboard/users?err=exists");
      }
      if (existed) {
        await tx.user.update({
          where: { id: existed.id },
          data: {
            displayName: item.displayName,
            passwordHash: item.passwordHash,
            roleId: item.roleId,
            storeId: item.storeId,
            accessMode: item.accessMode,
            isDeleted: false,
            isDisabled: false,
          },
        });
      } else {
        await tx.user.create({
          data: {
            username: item.username,
            displayName: item.displayName,
            passwordHash: item.passwordHash,
            roleId: item.roleId,
            storeId: item.storeId,
            accessMode: item.accessMode,
            tenantId: Number(me.tenantId),
            isDeleted: false,
            isDisabled: false,
          },
        });
      }
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users?imported=${parsedRows.length}`);
}

export async function updateUser(formData: FormData) {
  await ensureStoreTable();
  await ensureUserManageColumns();
  await ensureUserStoreColumn();
  await ensureUserPackageBindingTable();
  const { session, me } = await ensureUserManagePermission();

  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    displayName: formData.get("displayName"),
    accessMode: normalizeAccessMode(String(formData.get("userType") ?? "")),
    roleId: formData.get("roleId"),
    password: String(formData.get("password") ?? "").trim() || undefined,
    canClaimOrders: String(formData.get("canClaimOrders") ?? "1") !== "0",
    preciseClaimLimit: String(formData.get("preciseClaimLimit") ?? "").trim()
      ? Number(formData.get("preciseClaimLimit"))
      : undefined,
    serviceClaimLimit: String(formData.get("serviceClaimLimit") ?? "").trim()
      ? Number(formData.get("serviceClaimLimit"))
      : undefined,
  });
  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }
  if (parsed.data.password && parsed.data.password.length < 6) {
    redirect("/dashboard/users?err=invalid");
  }
  const selectedPackageIds = Array.from(
    new Set(
      formData
        .getAll("allowedPackageIds")
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x > 0),
    ),
  );

  const target = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
      ...(Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? { storeId: Number(me.storeId) } : {}),
    },
    select: { id: true, storeId: true, username: true, displayName: true, role: { select: { code: true } } },
  });
  if (!target) {
    redirect("/dashboard/users?err=notfound");
  }
  if (
    isProtectedSystemUser({
      username: target.username,
      displayName: target.displayName,
      roleCode: target.role?.code,
    }) &&
    target.id !== Number(session.user.id)
  ) {
    redirect("/dashboard/users?err=protected");
  }
  if (!target.storeId) {
    redirect("/dashboard/users?err=store");
  }

  const role = await prisma.role.findFirst({
    where: { id: parsed.data.roleId, tenantId: Number(me.tenantId) },
    select: { id: true },
  });
  if (!role) {
    redirect("/dashboard/users?err=role");
  }
  if (parsed.data.accessMode === "SUPERVISOR") {
    await ensureStoreSupervisorAvailable({
      tenantId: Number(me.tenantId),
      storeId: target.storeId,
      excludeUserId: parsed.data.userId,
    });
  }

  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 10) : undefined;
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      displayName: parsed.data.displayName,
      accessMode: parsed.data.accessMode,
      roleId: parsed.data.roleId,
      canClaimOrders: parsed.data.canClaimOrders,
      preciseClaimLimit: parsed.data.preciseClaimLimit ?? null,
      serviceClaimLimit: parsed.data.serviceClaimLimit ?? null,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
  if (parsed.data.accessMode === "SALE") {
    const valid = await prisma.package.findMany({
      where: { tenantId: Number(me.tenantId), id: { in: selectedPackageIds } },
      select: { id: true },
    });
    await replaceUserAllowedPackages(Number(me.tenantId), parsed.data.userId, valid.map((x) => x.id));
  } else {
    await replaceUserAllowedPackages(Number(me.tenantId), parsed.data.userId, []);
  }

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users?updated=1");
}

export async function toggleUserClaimEnabled(formData: FormData) {
  await ensureUserManageColumns();
  const { session, me } = await ensureUserManagePermission();
  const parsed = idOnlySchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }
  if (parsed.data.userId === Number(session.user.id)) {
    redirect("/dashboard/users?err=self");
  }

  const target = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
      ...(Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? { storeId: Number(me.storeId) } : {}),
    },
    select: { id: true, accessMode: true, canClaimOrders: true },
  });
  if (!target) {
    redirect("/dashboard/users?err=notfound");
  }
  if (target.accessMode !== "SALE") {
    redirect("/dashboard/users?err=invalid");
  }

  const enabled = Boolean(target.canClaimOrders);
  await prisma.user.update({
    where: { id: target.id },
    data: { canClaimOrders: !enabled },
  });

  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users?claimToggled=${enabled ? "0" : "1"}`);
}

export async function toggleUserDisabled(formData: FormData) {
  await ensureUserManageColumns();
  const { session, me } = await ensureUserManagePermission();
  const parsed = idOnlySchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }
  if (parsed.data.userId === Number(session.user.id)) {
    redirect("/dashboard/users?err=self");
  }

  const target = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
      ...(Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? { storeId: Number(me.storeId) } : {}),
    },
    select: { id: true, isDisabled: true, username: true, displayName: true, role: { select: { code: true } } },
  });
  if (!target) {
    redirect("/dashboard/users?err=notfound");
  }
  if (isProtectedSystemUser({ username: target.username, displayName: target.displayName, roleCode: target.role?.code })) {
    redirect("/dashboard/users?err=protected");
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { isDisabled: !target.isDisabled },
  });

  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users?disabled=${target.isDisabled ? "0" : "1"}`);
}

export async function softDeleteUser(formData: FormData) {
  await ensureUserManageColumns();
  await ensureUserPackageBindingTable();
  const { session, me } = await ensureUserManagePermission();
  const parsed = idOnlySchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }
  if (parsed.data.userId === Number(session.user.id)) {
    redirect("/dashboard/users?err=self");
  }

  const target = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
      ...(Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? { storeId: Number(me.storeId) } : {}),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      accessMode: true,
      storeId: true,
      role: { select: { code: true } },
    },
  });
  if (!target) {
    redirect("/dashboard/users?err=notfound");
  }
  if (isProtectedSystemUser({ username: target.username, displayName: target.displayName, roleCode: target.role?.code })) {
    redirect("/dashboard/users?err=protected");
  }

  await prisma.$transaction(async (tx) => {
    if (target.accessMode === "SALE" && target.storeId) {
      const supervisor = await tx.user.findFirst({
        where: {
          tenantId: Number(me.tenantId),
          storeId: target.storeId,
          accessMode: "SUPERVISOR",
          isDeleted: false,
          isDisabled: false,
        },
        select: { id: true, username: true, displayName: true },
      });
      if (!supervisor) {
        redirect("/dashboard/users?err=delete_no_supervisor");
      }

      const doingOrders = await tx.dispatchOrder.findMany({
        where: {
          tenantId: Number(me.tenantId),
          isDeleted: false,
          status: "CLAIMED",
          claimedById: target.id,
        },
        select: { id: true },
      });

      if (doingOrders.length > 0) {
        const now = new Date();
        const orderIds = doingOrders.map((item) => item.id);

        await tx.dispatchOrder.updateMany({
          where: { id: { in: orderIds } },
          data: {
            claimedById: supervisor.id,
            claimedAt: now,
          },
        });

        await tx.dispatchOrderRecord.createMany({
          data: orderIds.map((orderId) => ({
            tenantId: Number(me.tenantId),
            orderId,
            operatorId: supervisor.id,
            actionType: "AUTO_TRANSFER",
            remark: `用户删除自动移交：原业务员 ${target.displayName || target.username} 已删除，转交门店主管 ${supervisor.displayName || supervisor.username}`,
          })),
        });
      }
    }

    await tx.user.update({
      where: { id: target.id },
      data: { isDeleted: true, isDisabled: true },
    });
    await tx.$executeRawUnsafe(
      `DELETE FROM "UserPackageBinding" WHERE "tenantId" = ? AND "userId" = ?`,
      Number(me.tenantId),
      target.id,
    );
  });

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/orders");
  redirect("/dashboard/users?deleted=1");
}


