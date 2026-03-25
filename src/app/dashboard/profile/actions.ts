"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function updateDashboardProfile(formData: FormData) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = Number(session.user.id);
  const displayName = String(formData.get("displayName") ?? "").trim();
  const oldPassword = String(formData.get("oldPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!displayName) {
    redirect("/dashboard/profile?op=name-empty");
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isDeleted: true, isDisabled: true, passwordHash: true },
  });
  if (!me || me.isDeleted || me.isDisabled) {
    redirect("/login");
  }

  const hasPasswordInput = Boolean(oldPassword || newPassword || confirmPassword);
  if (hasPasswordInput) {
    if (!oldPassword || !newPassword || !confirmPassword) {
      redirect("/dashboard/profile?op=pwd-empty");
    }
    if (newPassword.length < 6) {
      redirect("/dashboard/profile?op=pwd-short");
    }
    if (newPassword !== confirmPassword) {
      redirect("/dashboard/profile?op=pwd-mismatch");
    }
    const oldOk = await bcrypt.compare(oldPassword, me.passwordHash);
    if (!oldOk) {
      redirect("/dashboard/profile?op=pwd-old");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName,
      ...(hasPasswordInput ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  redirect("/dashboard/profile?op=ok");
}

