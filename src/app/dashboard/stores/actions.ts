"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { ensureStoreTable } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, hasMenuPermission } from "@/lib/tenant";

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

const updateStoreSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(40),
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
  const hasPermission = await hasMenuPermission(me.id, "store-manage");
  if (!Number(me.tenantId) || !hasPermission) {
    redirect("/dashboard");
  }
  return me;
}

export async function createStore(formData: FormData) {
  await ensureStoreTable();
  const me = await ensureTenantAdmin();

  const parsed = createStoreSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    redirect("/dashboard/stores?err=invalid");
  }

  const exists = await prisma.store.findFirst({
    where: {
      tenantId: Number(me.tenantId),
      name: parsed.data.name,
      isDeleted: false,
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
      managerUserId: Number(me.id),
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
  });
  if (!parsed.success) {
    redirect("/dashboard/stores?err=invalid");
  }

  const store = await prisma.store.findFirst({
    where: { id: parsed.data.storeId, tenantId: Number(me.tenantId), isDeleted: false },
    select: { id: true },
  });
  if (!store) {
    redirect("/dashboard/stores?err=notfound");
  }

  const exists = await prisma.store.findFirst({
    where: {
      tenantId: Number(me.tenantId),
      name: parsed.data.name,
      id: { not: parsed.data.storeId },
      isDeleted: false,
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

  const memberCount = await prisma.user.count({
    where: {
      tenantId: Number(me.tenantId),
      storeId: parsed.data.storeId,
      isDeleted: false,
    },
  });
  if (memberCount > 0) {
    redirect("/dashboard/stores?err=has_users");
  }

  const relatedOrderCount = await prisma.dispatchOrder.count({
    where: {
      tenantId: Number(me.tenantId),
      isDeleted: false,
      OR: [
        { createdBy: { storeId: parsed.data.storeId } },
        { claimedBy: { is: { storeId: parsed.data.storeId } } },
      ],
    },
  });
  if (relatedOrderCount > 0) {
    redirect("/dashboard/stores?err=has_orders");
  }

  const deleted = await prisma.store.updateMany({
    where: {
      id: parsed.data.storeId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
    },
    data: { isDeleted: true },
  });
  if (deleted.count <= 0) {
    redirect("/dashboard/stores?err=notfound");
  }

  revalidatePath("/dashboard/stores");
  redirect("/dashboard/stores?deleted=1");
}

