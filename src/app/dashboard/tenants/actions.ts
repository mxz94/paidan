"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isSuperAdminRole } from "@/lib/tenant";

const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(40),
});

async function ensureTenantBuiltinRoles(tenantId: number) {
  const allMenus = await prisma.menu.findMany({ orderBy: { sort: "asc" } });
  const adminRole = await prisma.role.upsert({
    where: { code: `TENANT_${tenantId}_ADMIN` },
    create: { code: `TENANT_${tenantId}_ADMIN`, name: "管理员", tenantId, isBuiltin: true, dataScope: "TENANT" },
    update: { name: "管理员", tenantId, isBuiltin: true, dataScope: "TENANT" },
  });
  const supervisorRole = await prisma.role.upsert({
    where: { code: `TENANT_${tenantId}_SUPERVISOR` },
    create: { code: `TENANT_${tenantId}_SUPERVISOR`, name: "主管", tenantId, isBuiltin: true, dataScope: "STORE" },
    update: { name: "主管", tenantId, isBuiltin: true, dataScope: "STORE" },
  });
  const serviceRole = await prisma.role.upsert({
    where: { code: `TENANT_${tenantId}_SERVICE` },
    create: { code: `TENANT_${tenantId}_SERVICE`, name: "客服", tenantId, isBuiltin: true, dataScope: "OWN" },
    update: { name: "客服", tenantId, isBuiltin: true, dataScope: "OWN" },
  });
  const saleRole = await prisma.role.upsert({
    where: { code: `TENANT_${tenantId}_SALE` },
    create: { code: `TENANT_${tenantId}_SALE`, name: "业务员", tenantId, isBuiltin: true, dataScope: "OWN" },
    update: { name: "业务员", tenantId, isBuiltin: true, dataScope: "OWN" },
  });

  const adminKeys = ["dashboard", "dispatch-order", "user-manage", "package-manage", "store-manage", "role-menu", "system-config", "perm-order-delete-btn"];
  const supervisorKeys = ["dashboard", "dispatch-order", "user-manage", "package-manage", "store-manage", "perm-order-delete-btn"];
  const serviceKeys = ["dispatch-order"];
  const adminMenus = allMenus.filter((m) => adminKeys.includes(m.key));
  const supervisorMenus = allMenus.filter((m) => supervisorKeys.includes(m.key));
  const serviceMenus = allMenus.filter((m) => serviceKeys.includes(m.key));

  await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } });
  if (adminMenus.length > 0) {
    await prisma.roleMenu.createMany({
      data: adminMenus.map((menu) => ({ roleId: adminRole.id, menuId: menu.id })),
    });
  }
  await prisma.roleMenu.deleteMany({ where: { roleId: supervisorRole.id } });
  if (supervisorMenus.length > 0) {
    await prisma.roleMenu.createMany({
      data: supervisorMenus.map((menu) => ({ roleId: supervisorRole.id, menuId: menu.id })),
    });
  }
  await prisma.roleMenu.deleteMany({ where: { roleId: serviceRole.id } });
  if (serviceMenus.length > 0) {
    await prisma.roleMenu.createMany({
      data: serviceMenus.map((menu) => ({ roleId: serviceRole.id, menuId: menu.id })),
    });
  }
  await prisma.roleMenu.deleteMany({ where: { roleId: saleRole.id } });

  return adminRole;
}

export async function createTenant(formData: FormData) {
  const me = await getSessionUserWithTenant();
  if (!isSuperAdminRole(me.role.code)) {
    redirect("/dashboard");
  }

  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    redirect("/dashboard/tenants?err=invalid");
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: parsed.data.name,
      code: `TENANT_${Date.now()}`,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  const adminRole = await ensureTenantBuiltinRoles(tenant.id);

  const slug = parsed.data.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5]/g, "")
    .slice(0, 20) || `tenant${tenant.id}`;
  let username = `${slug}_admin`;
  let seq = 2;
  while (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${slug}_admin_${seq}`;
    seq += 1;
  }

  const passwordHash = await bcrypt.hash("123456", 10);
  await prisma.user.create({
    data: {
      username,
      displayName: `${tenant.name}管理员`,
      passwordHash,
      accessMode: "SUPERVISOR",
      roleId: adminRole.id,
      tenantId: tenant.id,
    },
  });

  revalidatePath("/dashboard/tenants");
  redirect(`/dashboard/tenants?created=1&name=${encodeURIComponent(tenant.name)}&username=${encodeURIComponent(username)}`);
}

export async function toggleTenantActive(formData: FormData) {
  const me = await getSessionUserWithTenant();
  if (!isSuperAdminRole(me.role.code)) {
    redirect("/dashboard");
  }

  const tenantId = Number(formData.get("tenantId"));
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    redirect("/dashboard/tenants?err=invalid");
  }

  const target = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isActive: true },
  });
  if (!target) {
    redirect("/dashboard/tenants?err=invalid");
  }

  await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: !target.isActive } });
  revalidatePath("/dashboard/tenants");
  redirect("/dashboard/tenants?toggled=1");
}

