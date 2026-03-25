import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserWithTenant, hasMenuPermission } from "@/lib/tenant";
import { createRole } from "../actions";

type SearchParams = Promise<{ err?: string }>;

const errorText: Record<string, string> = {
  invalid: "请检查输入：角色名称长度需为 2-30 个字符。",
  name: "角色名称已存在，请更换。",
};

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getSessionUserWithTenant();
  const hasPermission = await hasMenuPermission(me.id, "role-menu");
  if (!me.tenantId || !hasPermission) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5">
      <header className="rounded-3xl bg-[radial-gradient(circle_at_top_left,#0f172a,#1e293b,#334155)] p-6 text-white shadow-lg">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Role Center</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">新增角色</h1>
        <p className="mt-2 text-sm text-slate-200">创建后将跳转到角色管理页面，可继续分配菜单权限。</p>
      </header>

      <form action={createRole} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <div className="grid gap-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">角色名称</span>
            <input
              name="name"
              required
              placeholder="例如：销售管理员"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <p className="mt-1 text-xs text-slate-500">系统会自动生成角色编码，无需手动填写。</p>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">数据权限</span>
            <select
              name="dataScope"
              defaultValue="TENANT"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="TENANT">租户</option>
              <option value="STORE">门店</option>
              <option value="OWN">个人</option>
            </select>
          </label>

          {params.err ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "创建失败，请重试。"}</p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              创建角色
            </button>
            <Link
              href="/dashboard/role-menus"
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              返回角色管理
            </Link>
          </div>
        </div>
      </form>
    </section>
  );
}
