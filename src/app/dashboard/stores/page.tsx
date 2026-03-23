import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureStoreTable } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";
import { StoreCreateModal } from "@/components/store-create-modal";
import { StoreEditModal } from "@/components/store-edit-modal";

type SearchParams = Promise<{ created?: string; updated?: string; deleted?: string; err?: string }>;

const errorText: Record<string, string> = {
  invalid: "请检查输入：门店名称不能为空且不超过 40 字。",
  exists: "当前租户下门店名称已存在。",
  manager: "绑定门店主管失败：请选择有效的后台用户。",
  notfound: "门店不存在或已被删除。",
};

export default async function StoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await ensureStoreTable();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await getSessionUserWithTenant();
  if (!isTenantAdminRole(me.role.code) || !Number(me.tenantId)) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-xl font-bold">无权限访问</h1>
        <p className="mt-2 text-sm text-slate-600">仅管理员可以维护门店信息。</p>
      </section>
    );
  }

  const params = await searchParams;

  const [stores, managers] = await Promise.all([
    prisma.store.findMany({
      where: { tenantId: Number(me.tenantId) },
      include: {
        manager: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { tenantId: Number(me.tenantId), accessMode: "BACKEND" },
      select: { id: true, username: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
  ]);

  const managerOptions = managers.map((item) => ({
    id: item.id,
    label: `${item.displayName || item.username}（${item.username}）`,
  }));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">门店管理</h1>
            <p className="mt-2 text-sm text-slate-600">支持门店增删改查，并绑定门店主管用户。</p>
          </div>
          <StoreCreateModal
            managers={managerOptions}
            action={async (formData) => {
              "use server";
              const { createStore } = await import("./actions");
              await createStore(formData);
            }}
          />
        </div>
        {params.created === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">门店创建成功</p>
        ) : null}
        {params.updated === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">门店更新成功</p>
        ) : null}
        {params.deleted === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">门店删除成功</p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "操作失败"}</p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-semibold">门店列表</h2>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">门店名称</th>
                <th className="px-2 py-2 font-medium">门店主管</th>
                <th className="px-2 py-2 font-medium">创建时间</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-2 py-3">{item.name}</td>
                  <td className="px-2 py-3">
                    {item.manager.displayName || item.manager.username}
                    <span className="ml-1 text-slate-400">({item.manager.username})</span>
                  </td>
                  <td className="px-2 py-3 text-slate-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <StoreEditModal
                        storeId={item.id}
                        defaultName={item.name}
                        defaultManagerUserId={item.managerUserId}
                        managers={managerOptions}
                        action={async (formData) => {
                          "use server";
                          const { updateStore } = await import("./actions");
                          await updateStore(formData);
                        }}
                      />
                      <form
                        action={async (formData) => {
                          "use server";
                          const { deleteStore } = await import("./actions");
                          await deleteStore(formData);
                        }}
                      >
                        <input type="hidden" name="storeId" value={item.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 space-y-3 md:hidden">
          {stores.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                门店主管：{item.manager.displayName || item.manager.username}（{item.manager.username}）
              </p>
              <p className="mt-1 text-xs text-slate-500">创建时间：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
              <div className="mt-2 flex items-center gap-2">
                <StoreEditModal
                  storeId={item.id}
                  defaultName={item.name}
                  defaultManagerUserId={item.managerUserId}
                  managers={managerOptions}
                  action={async (formData) => {
                    "use server";
                    const { updateStore } = await import("./actions");
                    await updateStore(formData);
                  }}
                />
                <form
                  action={async (formData) => {
                    "use server";
                    const { deleteStore } = await import("./actions");
                    await deleteStore(formData);
                  }}
                >
                  <input type="hidden" name="storeId" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    删除
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
