import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, hasMenuPermission } from "@/lib/tenant";
import { PackageCreateModal } from "@/components/package-create-modal";
import { PackageEditModal } from "@/components/package-edit-modal";
import { PackageImportModal } from "@/components/package-import-modal";

type SearchParams = Promise<{
  created?: string;
  imported?: string;
  updated?: string;
  disabled?: string;
  deleted?: string;
  err?: string;
}>;

const errorText: Record<string, string> = {
  invalid: "请检查输入：代码仅支持大写字母/数字/下划线，价格必须大于0。",
  exists: "套餐代码或名称已存在，请更换。",
  import_file: "请选择要导入的文件。",
  import_invalid: "导入失败：文件格式或数据内容不正确，请检查后重试。",
  import_limit: "导入失败：单次最多导入 500 条数据。",
  has_orders: "无法删除：套餐已被单据引用。",
  not_found: "找不到指定的套餐。",
};

export default async function PackagesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await getSessionUserWithTenant();
  const hasPermission = await hasMenuPermission(me.id, "package-manage");
  if (!Number(me.tenantId) || !hasPermission) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold">无权限访问</h1>
        <p className="mt-2 text-sm text-slate-600">当前角色未绑定“套餐管理”菜单权限。</p>
      </section>
    );
  }

  const params = await searchParams;
  const packages = await prisma.package.findMany({
    where: { tenantId: Number(me.tenantId) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">套餐管理</h1>
            <p className="mt-2 text-sm text-slate-600">创建并维护系统套餐。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PackageImportModal
              action={async (formData) => {
                "use server";
                const { importPackages } = await import("./actions");
                await importPackages(formData);
              }}
            />
            <PackageCreateModal
              action={async (formData) => {
                "use server";
                const { createPackage } = await import("./actions");
                await createPackage(formData);
              }}
            />
          </div>
        </div>

        {params.created === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐创建成功</p> : null}
        {params.updated === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐更新成功</p> : null}
        {params.disabled === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐已停用</p> : null}
        {params.disabled === "0" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐已启用</p> : null}
        {Number(params.imported ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐导入成功，共 {Number(params.imported)} 条</p>
        ) : null}
        {params.deleted === "1" ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">套餐删除成功</p> : null}
        {params.err ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "操作失败"}</p> : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-semibold">套餐列表</h2>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">代码</th>
                <th className="px-2 py-2 font-medium">名称</th>
                <th className="px-2 py-2 font-medium">价格</th>
                <th className="px-2 py-2 font-medium">状态</th>
                <th className="px-2 py-2 font-medium">默认</th>
                <th className="px-2 py-2 font-medium">创建时间</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-3 font-medium">{item.code}</td>
                  <td className="px-2 py-3">{item.name}</td>
                  <td className="px-2 py-3">￥{item.price.toFixed(2)}</td>
                  <td className="px-2 py-3">{item.isActive ? "启用" : "停用"}</td>
                  <td className="px-2 py-3">{item.isDefault ? "是" : "否"}</td>
                  <td className="px-2 py-3 text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <PackageEditModal
                        packageId={item.id}
                        defaultName={item.name}
                        defaultCode={item.code}
                        defaultPrice={item.price}
                        defaultDescription={item.description}
                        defaultIsActive={item.isActive}
                        defaultIsDefault={item.isDefault}
                        action={async (formData) => {
                          "use server";
                          const { updatePackage } = await import("./actions");
                          await updatePackage(formData);
                        }}
                      />
                      <form
                        action={async (formData) => {
                          "use server";
                          const { togglePackageActive } = await import("./actions");
                          await togglePackageActive(formData);
                        }}
                      >
                        <input type="hidden" name="packageId" value={item.id} />
                        <button
                          type="submit"
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                            item.isActive
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {item.isActive ? "停用" : "启用"}
                        </button>
                      </form>
                      <form
                        action={async (formData) => {
                          "use server";
                          const { deletePackage } = await import("./actions");
                          await deletePackage(formData);
                        }}
                      >
                        <input type="hidden" name="packageId" value={item.id} />
                        <button type="submit" className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">删除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 space-y-3 md:hidden">
          {packages.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">代码：{item.code}</p>
                  <p className="mt-1 text-xs text-slate-500">价格：￥{item.price.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-500">状态：{item.isActive ? "启用" : "停用"}</p>
                  <p className="mt-1 text-xs text-slate-500">默认：{item.isDefault ? "是" : "否"}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <PackageEditModal
                      packageId={item.id}
                      defaultName={item.name}
                      defaultCode={item.code}
                      defaultPrice={item.price}
                      defaultDescription={item.description}
                      defaultIsActive={item.isActive}
                      defaultIsDefault={item.isDefault}
                      action={async (formData) => {
                        "use server";
                        const { updatePackage } = await import("./actions");
                        await updatePackage(formData);
                      }}
                    />
                    <form
                      action={async (formData) => {
                        "use server";
                        const { togglePackageActive } = await import("./actions");
                        await togglePackageActive(formData);
                      }}
                    >
                      <input type="hidden" name="packageId" value={item.id} />
                      <button
                        type="submit"
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                          item.isActive
                            ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {item.isActive ? "停用" : "启用"}
                      </button>
                    </form>
                    <form
                      action={async (formData) => {
                        "use server";
                        const { deletePackage } = await import("./actions");
                        await deletePackage(formData);
                      }}
                    >
                      <input type="hidden" name="packageId" value={item.id} />
                      <button type="submit" className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">删除</button>
                    </form>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
