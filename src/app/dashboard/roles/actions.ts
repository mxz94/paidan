"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(30),
});

export async function createRole(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user || session.user.roleCode !== "ADMIN") {
    redirect("/dashboard");
  }

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirect("/dashboard/roles/new?err=invalid");
  }

  const existsByName = await prisma.role.findUnique({
    where: { name: parsed.data.name },
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
  const baseCode = raw || "ROLE";

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
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/role-menus");
  redirect(`/dashboard/role-menus?role=${role.id}&created=1`);
}

export async function deleteRole(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user || session.user.roleCode !== "ADMIN") {
    redirect("/dashboard");
  }

  const roleId = Number(formData.get("roleId"));
  if (!Number.isInteger(roleId) || roleId <= 0) {
    redirect("/dashboard/role-menus?err=invalid_role");
  }

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true, code: true, users: { select: { id: true }, take: 1 } },
  });

  if (!role) {
    redirect("/dashboard/role-menus?err=role_not_found");
  }

  if (role.code === "ADMIN") {
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
