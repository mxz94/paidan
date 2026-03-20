"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(30),
  displayName: z.string().trim().min(2).max(30),
  password: z.string().min(6).max(50),
  accessMode: z.enum(["BACKEND", "MOBILE"]),
  roleId: z.coerce.number().int().positive(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
});

const importUserSchema = z.object({
  username: z.string().trim().min(3).max(30),
  displayName: z.string().trim().min(2).max(30),
  password: z.string().min(6).max(50),
  accessMode: z.enum(["BACKEND", "MOBILE"]),
  roleText: z.string().trim().min(1),
});

const MAX_IMPORT_ROWS = 500;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseAccessMode(value: unknown): "BACKEND" | "MOBILE" | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;
  if (["BACKEND", "后台", "后台端", "WEB"].includes(text)) return "BACKEND";
  if (["MOBILE", "移动", "移动端", "APP"].includes(text)) return "MOBILE";
  return null;
}

export async function createUser(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user || session.user.roleCode !== "ADMIN") {
    redirect("/dashboard");
  }

  const longitudeInput = String(formData.get("longitude") ?? "").trim();
  const latitudeInput = String(formData.get("latitude") ?? "").trim();

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    accessMode: formData.get("accessMode"),
    roleId: formData.get("roleId"),
    longitude: longitudeInput ? Number(longitudeInput) : undefined,
    latitude: latitudeInput ? Number(latitudeInput) : undefined,
  });

  if (!parsed.success) {
    redirect("/dashboard/users?err=invalid");
  }

  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) {
    redirect("/dashboard/users?err=role");
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true },
  });

  if (existingUser) {
    redirect("/dashboard/users?err=exists");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash,
      accessMode: parsed.data.accessMode,
      roleId: parsed.data.roleId,
      longitude: parsed.data.longitude,
      latitude: parsed.data.latitude,
      locationAt:
        parsed.data.longitude !== undefined && parsed.data.latitude !== undefined ? new Date() : null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/users");
  redirect("/dashboard/users?created=1");
}

export async function importUsers(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user || session.user.roleCode !== "ADMIN") {
    redirect("/dashboard");
  }

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
  const accessModeIdx = headerIndex.get("登录端") ?? headerIndex.get("accessmode");

  if (usernameIdx == null || displayNameIdx == null || passwordIdx == null || roleIdx == null || accessModeIdx == null) {
    redirect("/dashboard/users?err=import_invalid");
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    redirect("/dashboard/users?err=import_invalid");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    redirect("/dashboard/users?err=import_limit");
  }

  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));

  const seenUsernames = new Set<string>();
  const parsedRows: Array<{
    username: string;
    displayName: string;
    passwordHash: string;
    roleId: number;
    accessMode: "BACKEND" | "MOBILE";
  }> = [];

  for (const row of dataRows) {
    const username = String(row[usernameIdx] ?? "").trim();
    const displayName = String(row[displayNameIdx] ?? "").trim();
    const password = String(row[passwordIdx] ?? "").trim();
    const roleText = String(row[roleIdx] ?? "").trim();
    const accessMode = parseAccessMode(row[accessModeIdx]);

    const parsed = importUserSchema.safeParse({
      username,
      displayName,
      password,
      accessMode: accessMode ?? "",
      roleText,
    });

    if (!parsed.success || seenUsernames.has(username.toLowerCase())) {
      redirect("/dashboard/users?err=import_invalid");
    }

    const roleId = roleByName.get(roleText);
    if (!roleId) {
      redirect("/dashboard/users?err=import_role");
    }

    seenUsernames.add(username.toLowerCase());
    parsedRows.push({
      username,
      displayName,
      passwordHash: await bcrypt.hash(password, 10),
      roleId,
      accessMode: parsed.data.accessMode,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of parsedRows) {
      await tx.user.upsert({
        where: { username: item.username },
        update: {
          displayName: item.displayName,
          passwordHash: item.passwordHash,
          roleId: item.roleId,
          accessMode: item.accessMode,
        },
        create: {
          username: item.username,
          displayName: item.displayName,
          passwordHash: item.passwordHash,
          roleId: item.roleId,
          accessMode: item.accessMode,
        },
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/users");
  redirect(`/dashboard/users?imported=${parsedRows.length}`);
}
