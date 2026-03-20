"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(30),
});

export async function createRole(formData: FormData) {
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !me.tenantId) {
    redirect("/dashboard");
  }

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirect("/dashboard/roles/new?err=invalid");
  }

  const existsByName = await prisma.role.findFirst({
    where: { tenantId: Number(me.tenantId), name: parsed.data.name },
    select: { id: true },
  });

  if (existsByName) {
    redirect("/dashboard/roles/new?err=name");
  }

  const raw = parsed.data.name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const baseCode = `TENANT_${Number(me.tenantId)}_${raw || "ROLE"}`;

  let generatedCode = baseCode;
  let seq = 2;
  while (await prisma.role.findUnique({ where: { code: generatedCode }, select: { id: true } })) {
    generatedCode = `${baseCode}_${seq}`;
    seq += 1;
  }

  const role = await prisma.role.create({
    data: {
      code: generatedCode,
      name: parsed.data.name,
      tenantId: Number(me.tenantId),
      isBuiltin: false,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/role-menus");
  redirect(`/dashboard/role-menus?role=${role.id}&created=1`);
}

export async function deleteRole(formData: FormData) {
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !me.tenantId) {
    redirect("/dashboard");
  }

  const roleId = Number(formData.get("roleId"));
  if (!Number.isInteger(roleId) || roleId <= 0) {
    redirect("/dashboard/role-menus?err=invalid_role");
  }

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, code: true, tenantId: true, isBuiltin: true, users: { select: { id: true }, take: 1 } },
  });

  if (!role) {
    redirect("/dashboard/role-menus?err=role_not_found");
  }

  if (role.tenantId !== Number(me.tenantId) || role.isBuiltin) {
    redirect("/dashboard/role-menus?err=role_protected");
  }

  if (role.users.length > 0) {
    redirect("/dashboard/role-menus?err=role_bound_users");
  }

  await prisma.role.delete({ where: { id: roleId } });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/role-menus");
  revalidatePath("/dashboard/users");
  redirect("/dashboard/role-menus?deleted=1");
}
