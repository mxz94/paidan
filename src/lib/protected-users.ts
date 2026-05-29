type ProtectedUserInput = {
  username?: string | null;
  displayName?: string | null;
  roleCode?: string | null;
};

export function isBuiltinTenantAdminRole(roleCode: string) {
  return /^TENANT_\d+_ADMIN$/.test(roleCode);
}

export function isProtectedSystemUser(user?: ProtectedUserInput) {
  const username = String(user?.username ?? "").toLowerCase();
  const displayName = String(user?.displayName ?? "");
  const roleCode = String(user?.roleCode ?? "");
  return (
    username === "admin" ||
    username === "root" ||
    displayName === "系统管理员" ||
    roleCode === "SUPER_ADMIN"
  );
}

export function isProtectedFromRemoteManagement(user?: ProtectedUserInput) {
  const roleCode = String(user?.roleCode ?? "");
  return isProtectedSystemUser(user) || isBuiltinTenantAdminRole(roleCode);
}

export function isRoleLockedUser(user?: ProtectedUserInput) {
  return isProtectedFromRemoteManagement(user);
}

export function shouldSkipSupervisorEntryPicker(roleCode: string) {
  return (
    roleCode === "SUPER_ADMIN" ||
    roleCode === "ADMIN" ||
    roleCode.endsWith("_ADMIN")
  );
}
