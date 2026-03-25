import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isSuperAdminRole } from "@/lib/tenant";
import { createTenant, toggleTenantActive } from "./actions";

type SearchParams = Promise<{ created?: string; name?: string; username?: string; toggled?: string; err?: string }>;

const errorText: Record<string, string> = {
  invalid: "参数无效，请检查输入后重试。",
};

export default async function TenantsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await getSessionUserWithTenant();
  if (!isSuperAdminRole(me.role.code)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const tenants = await prisma.tenant.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { users: true, orders: true, packages: true } } },
  });

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-2xl font-bold">租户管理</h1>
        <p className="mt-2 text-sm text-slate-600">仅平台超管可维护租户。新增租户自动创建默认角色：管理员（租户）、主管（门店）、客服（个人，仅单据菜单）、业务员（无后台菜单）和管理员账号（默认密码 123456）。</p>
        {params.created === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            租户创建成功：{params.name || "-"}，管理员账号：{params.username || "-"}
          </p>
        ) : null}
        {params.toggled === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">租户状态已更新</p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "操作失败"}</p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-base font-semibold text-slate-900">新增租户</h2>
        <form action={createTenant} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            name="name"
            required
            placeholder="租户名称"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            创建租户
          </button>
        </form>
      </article>

      <article className="overflow-x-auto rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="mb-3 text-base font-semibold text-slate-900">租户列表</h2>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th className="px-3 py-2 font-semibold">名称</th>
              <th className="px-3 py-2 font-semibold">状态</th>
              <th className="px-3 py-2 font-semibold">用户数</th>
              <th className="px-3 py-2 font-semibold">单据数</th>
              <th className="px-3 py-2 font-semibold">套餐数</th>
              <th className="px-3 py-2 font-semibold">创建时间</th>
              <th className="px-3 py-2 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-3 py-2">{item.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-1 text-xs ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                    {item.isActive ? "启用" : "停用"}
                  </span>
                </td>
                <td className="px-3 py-2">{item._count.users}</td>
                <td className="px-3 py-2">{item._count.orders}</td>
                <td className="px-3 py-2">{item._count.packages}</td>
                <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td className="px-3 py-2">
                  <form action={toggleTenantActive}>
                    <input type="hidden" name="tenantId" value={item.id} />
                    <button type="submit" className="text-blue-600 hover:underline">
                      {item.isActive ? "停用" : "启用"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
