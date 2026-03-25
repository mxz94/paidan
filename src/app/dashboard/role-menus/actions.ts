"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, hasMenuPermission } from "@/lib/tenant";

export async function saveRoleMenus(formData: FormData) {
  const me = await getSessionUserWithTenant();
  const hasPermission = await hasMenuPermission(me.id, "role-menu");
  if (!me.tenantId || !hasPermission) {
    redirect("/dashboard");
  }

  const roleId = Number(formData.get("roleId"));
  const dataScope = String(formData.get("dataScope") ?? "OWN");
  const menuIds = formData
    .getAll("menuIds")
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!Number.isInteger(roleId) || roleId <= 0) {
    redirect("/dashboard/role-menus");
  }

  const targetRole = await prisma.role.findFirst({
    where: { id: roleId, tenantId: Number(me.tenantId) },
    select: { id: true },
  });
  if (!targetRole) {
    redirect("/dashboard/role-menus?err=invalid_role");
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: roleId },
      data: { dataScope: dataScope === "TENANT" || dataScope === "STORE" ? dataScope : "OWN" },
    });
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
