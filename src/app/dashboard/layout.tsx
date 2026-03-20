import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardFrame } from "@/components/dashboard-frame";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    include: {
      tenant: { select: { id: true, isActive: true } },
      role: {
        include: {
          roleMenus: {
            include: { menu: true },
            orderBy: { menu: { sort: "asc" } },
          },
        },
      },
    },
  });

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role.code !== "SUPER_ADMIN") {
    if (!currentUser.tenantId || !currentUser.tenant?.isActive) {
      redirect("/login");
    }
  }

  if (currentUser.accessMode === "MOBILE") {
    redirect("/mobile");
  }

  const menus = currentUser.role.roleMenus
    .map((item) => item.menu)
    .filter((menu) => !menu.key.startsWith("perm-"));

  return (
    <DashboardFrame
      displayName={currentUser.displayName}
      roleName={currentUser.role.name}
      menus={menus.map((item) => ({ id: item.id, name: item.name, path: item.path }))}
    >
      {children}
    </DashboardFrame>
  );
}
