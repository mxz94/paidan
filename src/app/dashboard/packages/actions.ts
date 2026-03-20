"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";

const createPackageSchema = z.object({
  name: z.string().trim().min(2).max(40),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_]+$/),
  price: z.coerce.number().positive(),
  description: z.string().trim().max(200).optional(),
  isActive: z.enum(["1", "0"]),
  isDefault: z.enum(["1", "0"]),
});

const MAX_IMPORT_ROWS = 500;

const importPackageRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(2).max(40),
  price: z.coerce.number().positive(),
  description: z.string().trim().max(200).optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseBoolean(value: unknown, fallback: boolean) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "y", "是", "启用"].includes(text)) return true;
  if (["0", "false", "no", "n", "否", "停用"].includes(text)) return false;
  return fallback;
}

export async function createPackage(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/dashboard");
  }
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !Number(me.tenantId)) {
    redirect("/dashboard");
  }

  const parsed = createPackageSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    price: formData.get("price"),
    description: formData.get("description") || undefined,
    isActive: formData.get("isActive"),
    isDefault: formData.get("isDefault"),
  });

  if (!parsed.success) {
    redirect("/dashboard/packages?err=invalid");
  }

  const exists = await prisma.package.findUnique({
    where: { code: parsed.data.code },
    select: { id: true },
  });

  if (exists) {
    redirect("/dashboard/packages?err=exists");
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault === "1") {
      await tx.package.updateMany({
        where: { isDefault: true, tenantId: Number(me.tenantId) },
        data: { isDefault: false },
      });
    }

    await tx.package.create({
      data: {
        tenantId: Number(me.tenantId),
        name: parsed.data.name,
        code: parsed.data.code,
        price: parsed.data.price,
        description: parsed.data.description,
        isActive: parsed.data.isActive === "1",
        isDefault: parsed.data.isDefault === "1",
      },
    });
  });

  revalidatePath("/dashboard/packages");
  redirect("/dashboard/packages?created=1");
}

export async function importPackages(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/dashboard");
  }
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !Number(me.tenantId)) {
    redirect("/dashboard");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    redirect("/dashboard/packages?err=import_file");
  }

  let rows: unknown[][] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      redirect("/dashboard/packages?err=import_invalid");
    }
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  } catch {
    redirect("/dashboard/packages?err=import_invalid");
  }

  if (rows.length < 2) {
    redirect("/dashboard/packages?err=import_invalid");
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (key) {
      headerIndex.set(key, index);
    }
  });

  const codeIdx = headerIndex.get("代码") ?? headerIndex.get("code");
  const nameIdx = headerIndex.get("名称") ?? headerIndex.get("套餐名称") ?? headerIndex.get("name");
  const priceIdx = headerIndex.get("价格") ?? headerIndex.get("price");
  const descIdx = headerIndex.get("说明") ?? headerIndex.get("描述") ?? headerIndex.get("description");
  const activeIdx = headerIndex.get("状态") ?? headerIndex.get("isactive");
  const defaultIdx = headerIndex.get("默认") ?? headerIndex.get("isdefault");

  if (codeIdx == null || nameIdx == null || priceIdx == null) {
    redirect("/dashboard/packages?err=import_invalid");
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    redirect("/dashboard/packages?err=import_invalid");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    redirect("/dashboard/packages?err=import_limit");
  }

  const parsedRows: Array<z.infer<typeof importPackageRowSchema>> = [];
  const seenCodes = new Set<string>();

  for (const row of dataRows) {
    const rawCode = String(row[codeIdx] ?? "").trim().toUpperCase();
    const parsed = importPackageRowSchema.safeParse({
      code: rawCode,
      name: String(row[nameIdx] ?? "").trim(),
      price: row[priceIdx],
      description: (descIdx != null ? String(row[descIdx] ?? "").trim() : "") || undefined,
      isActive: parseBoolean(activeIdx != null ? row[activeIdx] : "", true),
      isDefault: parseBoolean(defaultIdx != null ? row[defaultIdx] : "", false),
    });

    if (!parsed.success || seenCodes.has(rawCode)) {
      redirect("/dashboard/packages?err=import_invalid");
    }

    seenCodes.add(rawCode);
    parsedRows.push(parsed.data);
  }

  await prisma.$transaction(async (tx) => {
    const lastDefault = [...parsedRows].reverse().find((row) => row.isDefault);
    if (lastDefault) {
      await tx.package.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    for (const item of parsedRows) {
      const existed = await tx.package.findUnique({
        where: { code: item.code },
        select: { id: true, tenantId: true },
      });
      if (existed && existed.tenantId !== Number(me.tenantId)) {
        redirect("/dashboard/packages?err=exists");
      }
      if (existed) {
        await tx.package.update({
          where: { id: existed.id },
          data: {
            name: item.name,
            price: item.price,
            description: item.description,
            isActive: item.isActive,
            isDefault: lastDefault ? item.code === lastDefault.code : item.isDefault,
          },
        });
      } else {
        await tx.package.create({
          data: {
            tenantId: Number(me.tenantId),
            name: item.name,
            code: item.code,
            price: item.price,
            description: item.description,
            isActive: item.isActive,
            isDefault: lastDefault ? item.code === lastDefault.code : item.isDefault,
          },
        });
      }
    }
  });

  revalidatePath("/dashboard/packages");
  redirect(`/dashboard/packages?imported=${parsedRows.length}`);
}

