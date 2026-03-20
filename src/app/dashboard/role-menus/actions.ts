"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function saveRoleMenus(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user || session.user.roleCode !== "ADMIN") {
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
