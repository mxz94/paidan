export type UserAccessMode = "SUPERVISOR" | "SERVICE" | "SALE";
export type LoginTarget = "dashboard" | "mobile" | "auto";
export type DashboardMenuAccessItem = {
  key: string;
  path: string;
  sort?: number;
};

export function normalizeAccessMode(value: string | null | undefined): UserAccessMode {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "SUPERVISOR") return "SUPERVISOR";
  if (raw === "SERVICE") return "SERVICE";
  if (raw === "SALE") return "SALE";
  // Legacy compatibility
  if (raw === "BACKEND") return "SERVICE";
  if (raw === "MOBILE") return "SALE";
  return "SERVICE";
}

export function canAccessDashboard(mode: string | null | undefined) {
  const normalized = normalizeAccessMode(mode);
  return normalized === "SUPERVISOR" || normalized === "SERVICE";
}

export function canAccessMobile(mode: string | null | undefined) {
  const normalized = normalizeAccessMode(mode);
  return normalized === "SUPERVISOR" || normalized === "SALE";
}

export function normalizeLoginTarget(value: string | null | undefined): LoginTarget {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "dashboard") return "dashboard";
  if (raw === "mobile") return "mobile";
  return "auto";
}

export function resolveLandingPath(mode: string | null | undefined, target: string | null | undefined) {
  const normalizedMode = normalizeAccessMode(mode);
  const normalizedTarget = normalizeLoginTarget(target);

  if (normalizedTarget === "dashboard" && canAccessDashboard(normalizedMode)) {
    return "/dashboard";
  }
  if (normalizedTarget === "mobile" && canAccessMobile(normalizedMode)) {
    return "/mobile";
  }
  if (normalizedMode === "SUPERVISOR" || normalizedMode === "SERVICE") {
    return "/dashboard";
  }
  return "/mobile";
}

export function resolveDashboardLandingPathByMenus(menus: DashboardMenuAccessItem[]) {
  const safeMenus = Array.isArray(menus) ? menus : [];
  const visibleMenus = safeMenus
    .filter((menu) => {
      const key = String(menu.key ?? "");
      const path = String(menu.path ?? "");
      return Boolean(path) && path.startsWith("/dashboard") && !key.startsWith("perm-");
    })
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

  if (visibleMenus.length === 0) {
    return null;
  }

  const dashboardMenu = visibleMenus.find((menu) => menu.key === "dashboard" || menu.path === "/dashboard");
  return dashboardMenu?.path ?? visibleMenus[0].path;
}
