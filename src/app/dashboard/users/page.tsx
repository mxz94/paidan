import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureStoreTable, ensureUserManageColumns, ensureUserStoreColumn } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant } from "@/lib/tenant";
import { UserCreateModal } from "@/components/user-create-modal";
import { UserEditModal } from "@/components/user-edit-modal";
import { UserImportModal } from "@/components/user-import-modal";
import { UserLocationMapButton } from "@/components/user-location-map-button";
import { UserLocationsMapModal } from "@/components/user-locations-map-modal";
import { ensureUserPackageBindingTable, getAllowedPackageIdsMapForUsers } from "@/lib/user-package-bindings";

type SearchParams = Promise<{
  created?: string;
  updated?: string;
  disabled?: string;
  deleted?: string;
  imported?: string;
  err?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  roleId?: string;
  accessMode?: string;
  manager?: string;
  storeName?: string;
  claimToggled?: string;
}>;

const errorText: Record<string, string> = {
  invalid: "请完整填写信息（用户名至少3位，密码至少6位）。",
  role: "角色不存在，请刷新后重试。",
  store: "请选择有效门店。",
  exists: "用户名已存在，请换一个用户名。",
  import_file: "请选择要导入的文件。",
  import_invalid: "导入失败：文件格式或数据内容不正确，请检查后重试。",
  import_limit: "导入失败：单次最多导入 500 条。",
  import_role: "导入失败：存在无法匹配的角色（支持角色代码/名称/ID）。",
  self: "不能禁用或删除当前登录用户。",
  notfound: "用户不存在或已删除。",
  store_supervisor: "该门店已有主管，请先调整门店主管后再试。",
  delete_no_supervisor: "该业务员所属门店没有可用主管，无法自动接收进行中单据，请先配置主管后再删除。",
  protected: "系统管理员默认不可编辑、禁用或删除。",
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await ensureStoreTable();
  await ensureUserManageColumns();
  await ensureUserStoreColumn();
  await ensureUserPackageBindingTable();

  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await getSessionUserWithTenant();
  const hasUserManageMenu = await prisma.user.findFirst({
    where: {
      id: me.id,
      tenantId: Number(me.tenantId),
      role: {
        roleMenus: {
          some: {
            menu: { key: "user-manage" },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!Number(me.tenantId) || !hasUserManageMenu) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold">无权限访问</h1>
        <p className="mt-2 text-sm text-slate-600">当前角色未绑定“用户管理”菜单权限。</p>
      </section>
    );
  }

  const params = await searchParams;
  const scopedStoreId = Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0 ? Number(me.storeId) : undefined;
  const [roles, stores, packages] = await Promise.all([
    prisma.role.findMany({ where: { tenantId: Number(me.tenantId) }, orderBy: { id: "asc" } }),
    prisma.store.findMany({
      where: { tenantId: Number(me.tenantId), isDeleted: false, ...(scopedStoreId ? { id: scopedStoreId } : {}) },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.package.findMany({
      where: { tenantId: Number(me.tenantId), isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const keyword = String(params.keyword ?? "").trim();
  const roleId = Number(params.roleId ?? 0);
  const accessMode = String(params.accessMode ?? "").trim();
  const pageSize = Math.min(Math.max(Number(params.pageSize ?? 10), 5), 50);
  const page = Math.max(Number(params.page ?? 1), 1);

  const where: {
    tenantId: number;
    isDeleted: boolean;
    storeId?: number;
    AND?: Array<Record<string, unknown>>;
  } = { tenantId: Number(me.tenantId), isDeleted: false };
  if (scopedStoreId) {
    where.storeId = scopedStoreId;
  }
  const andConditions: Array<Record<string, unknown>> = [];
  if (keyword) {
    andConditions.push({
      OR: [{ username: { contains: keyword } }, { displayName: { contains: keyword } }],
    });
  }
  if (Number.isInteger(roleId) && roleId > 0) {
    andConditions.push({ roleId });
  }
  if (["SUPERVISOR", "SERVICE", "SALE"].includes(accessMode)) {
    andConditions.push({ accessMode });
  }
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const queryWhere = where;
  const total = await prisma.user.count({ where: queryWhere });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const users = await prisma.user.findMany({
    where: queryWhere,
    include: { role: true, store: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const claimConfigs = users.length
    ? ((await prisma.$queryRawUnsafe(
        `SELECT "id", "canClaimOrders", "preciseClaimLimit", "serviceClaimLimit"
         FROM "User"
         WHERE "id" IN (${users.map((x) => Number(x.id)).join(",")})`,
      )) as Array<{
        id: number;
        canClaimOrders: boolean | number | null;
        preciseClaimLimit: number | null;
        serviceClaimLimit: number | null;
      }>)
    : [];
  const claimConfigMap = new Map(
    claimConfigs.map((item) => [
      item.id,
      {
        canClaimOrders: item.canClaimOrders === true || item.canClaimOrders === 1 || item.canClaimOrders == null,
        preciseClaimLimit: item.preciseClaimLimit,
        serviceClaimLimit: item.serviceClaimLimit,
      },
    ]),
  );
  const allowedPackageMap = await getAllowedPackageIdsMapForUsers(
    Number(me.tenantId),
    users.map((user) => user.id),
  );

  const mapUsers = await prisma.user.findMany({
    where: queryWhere,
    select: { id: true, username: true, displayName: true, longitude: true, latitude: true },
    orderBy: { createdAt: "desc" },
  });

  const commonQuery = {
    page: currentPage,
    pageSize,
    keyword,
    roleId: roleId > 0 ? roleId : undefined,
    accessMode,
  };

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">用户管理</h1>
            <p className="mt-2 text-sm text-slate-600">新增用户需绑定门店，支持删改查、禁用和假删除。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UserLocationsMapModal
              users={mapUsers.map((item) => ({
                id: item.id,
                username: item.username,
                displayName: item.displayName,
                longitude: item.longitude,
                latitude: item.latitude,
              }))}
            />
            <UserImportModal
              action={async (formData) => {
                "use server";
                const { importUsers } = await import("./actions");
                await importUsers(formData);
              }}
            />
            <UserCreateModal
              roles={roles.map((item) => ({ id: item.id, name: item.name }))}
              stores={stores.map((item) => ({ id: item.id, name: item.name }))}
              packages={packages.map((item) => ({ id: item.id, name: item.name, code: item.code }))}
              fixedStore={scopedStoreId ? { id: scopedStoreId, name: stores[0]?.name ?? "当前门店" } : undefined}
              action={async (formData) => {
                "use server";
                const { createUser } = await import("./actions");
                await createUser(formData);
              }}
            />
          </div>
        </div>

        {params.created === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户创建成功</p> : null}
        {params.updated === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户更新成功</p> : null}
        {params.disabled === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户已禁用</p> : null}
        {params.disabled === "0" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户已启用</p> : null}
        {params.deleted === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户已删除（假删除）</p> : null}
        {params.claimToggled === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已允许该业务员抢单</p> : null}
        {params.claimToggled === "0" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">已禁止该业务员抢单</p> : null}
        {Number(params.imported ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">用户导入成功，共 {Number(params.imported)} 条</p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {params.err === "store_supervisor"
              ? `${params.storeName ? decodeURIComponent(params.storeName) : "当前门店"}主管已存在：${
                  params.manager ? decodeURIComponent(params.manager) : "未知用户"
                }`
              : errorText[params.err] ?? "操作失败"}
          </p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-semibold">用户列表</h2>
        <form className="mt-3 mb-3 flex items-center gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2 whitespace-nowrap">
          <input type="hidden" name="pageSize" value={pageSize} />
          <input
            name="keyword"
            defaultValue={keyword}
            placeholder="关键字：用户名/姓名"
            className="h-8 w-52 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          />
          <select
            name="roleId"
            defaultValue={roleId > 0 ? String(roleId) : ""}
            className="h-8 w-36 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部角色</option>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select
            name="accessMode"
            defaultValue={accessMode}
            className="h-8 w-32 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部类型</option>
            <option value="SUPERVISOR">主管</option>
            <option value="SERVICE">客服</option>
            <option value="SALE">业务员</option>
            
          </select>
          <button type="submit" className="h-8 shrink-0 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800">筛选</button>
          <a href={`/dashboard/users?${buildQuery({ pageSize })}`} className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold leading-none text-slate-700 transition hover:bg-slate-50">重置</a>
        </form>

        <div className="mb-3 text-sm text-slate-600">共 {total} 条，当前第 {currentPage}/{totalPages} 页</div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">用户名</th>
                <th className="px-2 py-2 font-medium">姓名</th>
                <th className="px-2 py-2 font-medium">角色</th>
                <th className="px-2 py-2 font-medium">门店</th>
                <th className="px-2 py-2 font-medium">用户类型</th>
                <th className="px-2 py-2 font-medium">抢单权限</th>
                <th className="px-2 py-2 font-medium">精准上限</th>
                <th className="px-2 py-2 font-medium">客服上限</th>
                <th className="px-2 py-2 font-medium">状态</th>
                <th className="px-2 py-2 font-medium">经纬度</th>
                <th className="px-2 py-2 font-medium">定位更新时间</th>
                <th className="px-2 py-2 font-medium">在线时间</th>
                <th className="px-2 py-2 font-medium">创建时间</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                (() => {
                  const isProtectedUser =
                    user.username.toLowerCase() === "admin" ||
                    user.username.toLowerCase() === "root" ||
                    user.displayName === "系统管理员" ||
                    user.role.code === "SUPER_ADMIN";
                  const canEditProtectedSelf = isProtectedUser && user.id === Number(session.user.id);
                  return (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="px-2 py-3">{user.username}</td>
                  <td className="px-2 py-3">{user.displayName}</td>
                  <td className="px-2 py-3">{user.role.name}</td>
                  <td className="px-2 py-3">{user.store?.name || "-"}</td>
                  <td className="px-2 py-3">{user.accessMode === "SUPERVISOR" ? "主管" : user.accessMode === "SALE" ? "业务员" : "客服"}</td>
                  <td className="px-2 py-3">
                    {user.accessMode === "SALE"
                      ? claimConfigMap.get(user.id)?.canClaimOrders === false
                        ? "禁止"
                        : "允许"
                      : "-"}
                  </td>
                  <td className="px-2 py-3">{claimConfigMap.get(user.id)?.preciseClaimLimit ?? "默认"}</td>
                  <td className="px-2 py-3">{claimConfigMap.get(user.id)?.serviceClaimLimit ?? "默认"}</td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.isDisabled ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {user.isDisabled ? "禁用" : "启用"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-slate-500">
                    <UserLocationMapButton username={user.username} displayName={user.displayName} longitude={user.longitude} latitude={user.latitude} />
                  </td>
                  <td className="px-2 py-3 text-slate-500">{user.locationAt ? new Date(user.locationAt).toLocaleString("zh-CN") : "-"}</td>
                  <td className="px-2 py-3 text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "-"}</td>
                  <td className="px-2 py-3 text-slate-500">{new Date(user.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      {isProtectedUser && !canEditProtectedSelf ? (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          系统内置
                        </span>
                      ) : canEditProtectedSelf ? (
                        <UserEditModal
                          userId={user.id}
                          defaultDisplayName={user.displayName}
                          defaultAccessMode={(user.accessMode as "SUPERVISOR" | "SERVICE" | "SALE")}
                          defaultRoleId={user.roleId}
                          defaultStoreName={user.store?.name ?? "-"}
                          defaultCanClaimOrders={claimConfigMap.get(user.id)?.canClaimOrders ?? true}
                          defaultPreciseClaimLimit={claimConfigMap.get(user.id)?.preciseClaimLimit ?? null}
                          defaultServiceClaimLimit={claimConfigMap.get(user.id)?.serviceClaimLimit ?? null}
                          defaultAllowedPackageIds={allowedPackageMap.get(user.id) ?? []}
                          roles={roles.map((item) => ({ id: item.id, name: item.name }))}
                          packages={packages.map((item) => ({ id: item.id, name: item.name, code: item.code }))}
                          action={async (formData) => {
                            "use server";
                            const { updateUser } = await import("./actions");
                            await updateUser(formData);
                          }}
                        />
                      ) : (
                        <>
                          <UserEditModal
                            userId={user.id}
                            defaultDisplayName={user.displayName}
                            defaultAccessMode={(user.accessMode as "SUPERVISOR" | "SERVICE" | "SALE")}
                            defaultRoleId={user.roleId}
                            defaultStoreName={user.store?.name ?? "-"}
                            defaultCanClaimOrders={claimConfigMap.get(user.id)?.canClaimOrders ?? true}
                            defaultPreciseClaimLimit={claimConfigMap.get(user.id)?.preciseClaimLimit ?? null}
                            defaultServiceClaimLimit={claimConfigMap.get(user.id)?.serviceClaimLimit ?? null}
                            defaultAllowedPackageIds={allowedPackageMap.get(user.id) ?? []}
                            roles={roles.map((item) => ({ id: item.id, name: item.name }))}
                            packages={packages.map((item) => ({ id: item.id, name: item.name, code: item.code }))}
                            action={async (formData) => {
                              "use server";
                              const { updateUser } = await import("./actions");
                              await updateUser(formData);
                            }}
                          />
                          <form
                            action={async (formData) => {
                              "use server";
                              const { toggleUserClaimEnabled } = await import("./actions");
                              await toggleUserClaimEnabled(formData);
                            }}
                          >
                            <input type="hidden" name="userId" value={user.id} />
                            <button
                              type="submit"
                              disabled={user.accessMode !== "SALE"}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                                user.accessMode !== "SALE"
                                  ? "cursor-not-allowed border-slate-200 text-slate-300"
                                  : claimConfigMap.get(user.id)?.canClaimOrders === false
                                    ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    : "border-rose-200 text-rose-700 hover:bg-rose-50"
                              }`}
                            >
                              {user.accessMode !== "SALE"
                                ? "仅业务员"
                                : claimConfigMap.get(user.id)?.canClaimOrders === false
                                  ? "允许抢单"
                                  : "禁止抢单"}
                            </button>
                          </form>
                          <form
                            action={async (formData) => {
                              "use server";
                              const { toggleUserDisabled } = await import("./actions");
                              await toggleUserDisabled(formData);
                            }}
                          >
                            <input type="hidden" name="userId" value={user.id} />
                            <button type="submit" className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${user.isDisabled ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}>
                              {user.isDisabled ? "启用" : "禁用"}
                            </button>
                          </form>
                          <form
                            action={async (formData) => {
                              "use server";
                              const { softDeleteUser } = await import("./actions");
                              await softDeleteUser(formData);
                            }}
                          >
                            <input type="hidden" name="userId" value={user.id} />
                            <button type="submit" className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">删除</button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 space-y-3 md:hidden">
          {users.map((user) => (
            <li key={user.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{user.displayName}</p>
              <p className="mt-1 text-xs text-slate-500">账号：{user.username}</p>
              <p className="mt-1 text-xs text-slate-500">角色：{user.role.name}</p>
              <p className="mt-1 text-xs text-slate-500">门店：{user.store?.name || "-"}</p>
              <p className="mt-1 text-xs text-slate-500">用户类型：{user.accessMode === "SUPERVISOR" ? "主管" : user.accessMode === "SALE" ? "业务员" : "客服"}</p>
              <p className="mt-1 text-xs text-slate-500">抢单权限：{user.accessMode === "SALE" ? (claimConfigMap.get(user.id)?.canClaimOrders === false ? "禁止" : "允许") : "-"}</p>
              <p className="mt-1 text-xs text-slate-500">精准上限：{claimConfigMap.get(user.id)?.preciseClaimLimit ?? "默认"}</p>
              <p className="mt-1 text-xs text-slate-500">客服上限：{claimConfigMap.get(user.id)?.serviceClaimLimit ?? "默认"}</p>
              <p className="mt-1 text-xs text-slate-500">状态：{user.isDisabled ? "禁用" : "启用"}</p>
              <p className="mt-1 text-xs text-slate-500">
                经纬度：
                <span className="ml-1 inline-block align-middle">
                  <UserLocationMapButton username={user.username} displayName={user.displayName} longitude={user.longitude} latitude={user.latitude} />
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">在线时间：{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "-"}</p>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-slate-500">每页 {pageSize} 条</div>
          <div className="flex gap-2">
            <a
              href={`/dashboard/users?${buildQuery({ ...commonQuery, page: Math.max(1, currentPage - 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              上一页
            </a>
            <a
              href={`/dashboard/users?${buildQuery({ ...commonQuery, page: Math.min(totalPages, currentPage + 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage >= totalPages ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              下一页
            </a>
          </div>
        </div>
      </article>
    </section>
  );
}

