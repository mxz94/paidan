"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";

export async function saveRoleMenus(formData: FormData) {
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !me.tenantId) {
    redirect("/dashboard");
  }

  const roleId = Number(formData.get("roleId"));
  const menuIds = formData
    .getAll("menuIds")
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!Number.isInteger(roleId) || roleId <= 0) {
    redirect("/dashboard/role-menus");
  }

  const targetRole = await prisma.role.findFirst({
    where: { id: roleId, tenantId: Number(me.tenantId) },
    select: { id: true, isBuiltin: true },
  });
  if (!targetRole || targetRole.isBuiltin) {
    redirect("/dashboard/role-menus?err=forbidden");
  }

  await prisma.$transaction(async (tx) => {
    await tx.roleMenu.deleteMany({ where: { roleId } });

    if (menuIds.length > 0) {
      await tx.roleMenu.createMany({
        data: menuIds.map((menuId) => ({ roleId, menuId })),
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/role-menus");
  redirect(`/dashboard/role-menus?role=${roleId}&saved=1`);
}
