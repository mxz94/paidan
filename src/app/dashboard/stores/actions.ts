"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { ensureStoreTable } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(40),
  managerUserId: z.coerce.number().int().positive(),
});

const updateStoreSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(40),
  managerUserId: z.coerce.number().int().positive(),
});

const deleteStoreSchema = z.object({
  storeId: z.coerce.number().int().positive(),
});

async function ensureTenantAdmin() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !Number(me.tenantId)) {
    redirect("/dashboard");
  }
  return me;
}

export async function createStore(formData: FormData) {
  await ensureStoreTable();
  const me = await ensureTenantAdmin();

  const parsed = createStoreSchema.safeParse({
    name: formData.get("name"),
    managerUserId: formData.get("managerUserId"),
  });
  if (!parsed.success) {
    redirect("/dashboard/stores?err=invalid");
  }

  const manager = await prisma.user.findFirst({
    where: {
      id: parsed.data.managerUserId,
      tenantId: Number(me.tenantId),
      accessMode: "BACKEND",
    },
    select: { id: true },
  });
  if (!manager) {
    redirect("/dashboard/stores?err=manager");
  }

  const exists = await prisma.store.findFirst({
    where: {
      tenantId: Number(me.tenantId),
      name: parsed.data.name,
    },
    select: { id: true },
  });
  if (exists) {
    redirect("/dashboard/stores?err=exists");
  }

  await prisma.store.create({
    data: {
      tenantId: Number(me.tenantId),
      name: parsed.data.name,
      managerUserId: parsed.data.managerUserId,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/stores");
  redirect("/dashboard/stores?created=1");
}

export async function updateStore(formData: FormData) {
  await ensureStoreTable();
  const me = await ensureTenantAdmin();

  const parsed = updateStoreSchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    managerUserId: formData.get("managerUserId"),
  });
  if (!parsed.success) {
    redirect("/dashboard/stores?err=invalid");
  }

  const store = await prisma.store.findFirst({
    where: { id: parsed.data.storeId, tenantId: Number(me.tenantId) },
    select: { id: true },
  });
  if (!store) {
    redirect("/dashboard/stores?err=notfound");
  }

  const manager = await prisma.user.findFirst({
    where: {
      id: parsed.data.managerUserId,
      tenantId: Number(me.tenantId),
      accessMode: "BACKEND",
    },
    select: { id: true },
  });
  if (!manager) {
    redirect("/dashboard/stores?err=manager");
  }

  const exists = await prisma.store.findFirst({
    where: {
      tenantId: Number(me.tenantId),
      name: parsed.data.name,
      id: { not: parsed.data.storeId },
    },
    select: { id: true },
  });
  if (exists) {
    redirect("/dashboard/stores?err=exists");
  }

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: {
      name: parsed.data.name,
      managerUserId: parsed.data.managerUserId,
    },
  });

  revalidatePath("/dashboard/stores");
  redirect("/dashboard/stores?updated=1");
}

export async function deleteStore(formData: FormData) {
  await ensureStoreTable();
  const me = await ensureTenantAdmin();

  const parsed = deleteStoreSchema.safeParse({
    storeId: formData.get("storeId"),
  });
  if (!parsed.success) {
    redirect("/dashboard/stores?err=invalid");
  }

  const deleted = await prisma.store.deleteMany({
    where: {
      id: parsed.data.storeId,
      tenantId: Number(me.tenantId),
    },
  });
  if (deleted.count <= 0) {
    redirect("/dashboard/stores?err=notfound");
  }

  revalidatePath("/dashboard/stores");
  redirect("/dashboard/stores?deleted=1");
}
