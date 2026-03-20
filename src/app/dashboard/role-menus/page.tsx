import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";
import { saveRoleMenus } from "./actions";

type SearchParams = Promise<{ role?: string; saved?: string; created?: string; err?: string }>;

export default async function RoleMenusPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !me.tenantId) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold">无权限访问</h1>
        <p className="mt-2 text-sm text-slate-600">仅租户管理员可以配置角色权限。</p>
      </section>
    );
  }

  const params = await searchParams;
  const roles = await prisma.role.findMany({
    where: { tenantId: Number(me.tenantId) },
    orderBy: { id: "asc" },
  });

  const menus = await prisma.menu.findMany({
    include: { parent: { select: { id: true } } },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  });

  const rootMenus = menus.filter((item) => !item.parentId);
  const childMap = new Map<number, typeof menus>();
  menus
    .filter((item) => item.parentId)
    .forEach((item) => {
      const list = childMap.get(item.parentId!) ?? [];
      list.push(item);
      childMap.set(item.parentId!, list);
    });

  const menuGroups = rootMenus.map((root) => ({
    root,
    children: (childMap.get(root.id) ?? []).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id),
  }));

  const candidateRoleId = Number(params.role ?? roles[0]?.id ?? 0);
  const role = roles.find((item) => item.id === candidateRoleId) ?? roles[0];
  if (!role) {
    redirect("/dashboard");
  }

  const assigned = await prisma.roleMenu.findMany({ where: { roleId: role.id } });
  const assignedSet = new Set(assigned.map((item) => item.menuId));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">角色管理</h1>
            <p className="mt-2 text-sm text-slate-600">每个租户独立角色。系统内置角色不可编辑。</p>
          </div>
          <Link href="/dashboard/roles/new" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            新增角色
          </Link>
        </div>

        {params.created === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">角色创建成功</p> : null}
        {params.saved === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">保存成功</p> : null}
        {params.err === "forbidden" ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">系统内置角色不允许修改</p> : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
        <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">角色列表</h2>
          <ul className="flex gap-2 overflow-x-auto lg:block">
            {roles.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard/role-menus?role=${item.id}`}
                  className={`block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${item.id === role.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {item.name}{item.isBuiltin ? "（内置）" : ""}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <form action={saveRoleMenus} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <input type="hidden" name="roleId" value={role.id} />

          <div className="space-y-3">
            {menuGroups.map(({ root, children }) => (
              <div key={root.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="menuIds" value={root.id} defaultChecked={assignedSet.has(root.id)} className="h-4 w-4 rounded border-slate-300" disabled={role.isBuiltin} />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{root.name}</span>
                    <span className="block text-xs text-slate-500">{root.path}</span>
                  </span>
                </label>

                {children.length > 0 ? (
                  <div className="mt-3 border-l border-slate-200 pl-4">
                    <p className="mb-2 text-xs font-medium text-slate-500">按钮权限</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {children.map((child) => (
                        <label key={child.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                          <input type="checkbox" name="menuIds" value={child.id} defaultChecked={assignedSet.has(child.id)} className="h-4 w-4 rounded border-slate-300" disabled={role.isBuiltin} />
                          <span>
                            <span className="block text-sm text-slate-900">{child.name}</span>
                            <span className="block text-xs text-slate-500">{child.path}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <button type="submit" disabled={role.isBuiltin} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto">
            {role.isBuiltin ? "内置角色不可编辑" : "保存权限"}
          </button>
        </form>
      </div>
    </section>
  );
}
