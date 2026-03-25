import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessMobile, resolveDashboardLandingPathByMenus, resolveLandingPath } from "@/lib/user-access";

export default async function Home() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      accessMode: true,
      isDeleted: true,
      isDisabled: true,
      role: {
        select: {
          roleMenus: {
            select: {
              menu: {
                select: {
                  key: true,
                  path: true,
                  sort: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.isDeleted || user.isDisabled) {
    redirect("/login");
  }

  const defaultLandingPath = resolveLandingPath(user.accessMode, session.user.loginTarget);
  if (defaultLandingPath !== "/dashboard") {
    redirect(defaultLandingPath);
  }

  const dashboardLandingPath = resolveDashboardLandingPathByMenus(
    user.role?.roleMenus.map((item) => item.menu) ?? [],
  );
  if (dashboardLandingPath) {
    redirect(dashboardLandingPath);
  }

  if (canAccessMobile(user.accessMode)) {
    redirect("/mobile");
  }
  redirect("/login");
}