import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

export async function getSessionUserWithTenant() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      id: true,
      username: true,
      displayName: true,
      accessMode: true,
      tenantId: true,
      role: { select: { code: true, name: true, dataScope: true } },
      tenant: { select: { id: true, code: true, name: true, isActive: true } },
    },
  });
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function isSuperAdminRole(roleCode: string) {
  return roleCode === "SUPER_ADMIN";
}

export function isTenantAdminRole(roleCode: string) {
  return roleCode === "SUPER_ADMIN" || roleCode === "ADMIN" || roleCode.endsWith("_ADMIN");
}

export function hasTenantDataScope(roleCode: string, dataScope?: string | null) {
  if (isTenantAdminRole(roleCode)) {
    return true;
  }
  return (dataScope ?? "TENANT") !== "OWN";
}
