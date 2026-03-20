import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveRoleMenus } from "./actions";

type SearchParams = Promise<{ role?: string; saved?: string; created?: string }>;

export default async function RoleMenusPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.roleCode !== "ADMIN") {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold">无权限访问</h1>
        <p className="mt-2 text-sm text-slate-600">仅管理员可以配置角色权限。</p>
      </section>
    );
  }

  const params = await searchParams;
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  const dispatchOrderMenu = await prisma.menu.findUnique({
    where: { key: "dispatch-order" },
    select: { id: true },
  });

  await prisma.menu.upsert({
    where: { key: "perm-order-dispatch-assign" },
    create: {
      key: "perm-order-dispatch-assign",
      name: "单据管理-派单按钮",
      path: "#",
      icon: "key",
      sort: 201,
      parentId: dispatchOrderMenu?.id ?? null,
    },
    update: {
      name: "单据管理-派单按钮",
      path: "#",
      icon: "key",
      sort: 201,
      parentId: dispatchOrderMenu?.id ?? null,
    },
  });
  await prisma.menu.upsert({
    where: { key: "perm-order-delete-btn" },
    create: {
      key: "perm-order-delete-btn",
      name: "单据管理-删除按钮",
      path: "#",
      icon: "key",
      sort: 202,
      parentId: dispatchOrderMenu?.id ?? null,
    },
    update: {
      name: "单据管理-删除按钮",
      path: "#",
      icon: "key",
      sort: 202,
      parentId: dispatchOrderMenu?.id ?? null,
    },
  });
  await prisma.menu.upsert({
    where: { key: "system-config" },
    create: { key: "system-config", name: "参数配置", path: "/dashboard/settings", icon: "settings", sort: 6 },
    update: { name: "参数配置", path: "/dashboard/settings", icon: "settings", sort: 6 },
  });
  const menus = await prisma.menu.findMany({
    include: { parent: { select: { id: true, name: true, key: true } } },
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
  const orphanChildren = menus.filter((item) => item.parentId && !rootMenus.some((root) => root.id === item.parentId));

  const candidateRoleId = Number(params.role ?? roles[0]?.id ?? 0);
  const roleId = roles.some((item) => item.id === candidateRoleId) ? candidateRoleId : (roles[0]?.id ?? 0);

  const assigned = await prisma.roleMenu.findMany({ where: { roleId } });
  const assignedSet = new Set(assigned.map((item) => item.menuId));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">角色管理</h1>
            <p className="mt-2 text-sm text-slate-600">选择角色后勾选菜单并保存，桌面和移动端均可使用。</p>
          </div>
          <Link
            href="/dashboard/roles/new"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            新增角色
          </Link>
        </div>

        {params.created === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">角色创建成功</p>
        ) : null}
        {params.saved === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">保存成功</p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
        <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">角色列表</h2>
          <ul className="flex gap-2 overflow-x-auto lg:block">
            {roles.map((role) => (
              <li key={role.id}>
                <Link
                  href={`/dashboard/role-menus?role=${role.id}`}
                  className={`block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                    role.id === roleId
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {role.name}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <form action={saveRoleMenus} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <input type="hidden" name="roleId" value={roleId} />

          <div className="space-y-3">
            {menuGroups.map(({ root, children }) => (
              <div key={root.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="menuIds"
                    value={root.id}
                    defaultChecked={assignedSet.has(root.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
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
                          <input
                            type="checkbox"
                            name="menuIds"
                            value={child.id}
                            defaultChecked={assignedSet.has(child.id)}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
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
            {orphanChildren.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                检测到 {orphanChildren.length} 个未归属按钮，请检查菜单父子配置。
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
          >
            保存权限
          </button>
        </form>
      </div>
    </section>
  );
}
