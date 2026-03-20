import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, isTenantAdminRole } from "@/lib/tenant";
import { LUOYANG_REGIONS } from "@/lib/regions";
import { assignDispatchOrder, batchOperateDispatchOrders, deleteDispatchOrder } from "./actions";
import { OrderCreateModal } from "@/components/order-create-modal";
import { OrderImportModal } from "@/components/order-import-modal";
import { OrderAssignModal } from "@/components/order-assign-modal";
import { OrderListMapModal } from "@/components/order-list-map-modal";
import { OrderLocationMapButton } from "@/components/order-location-map-button";
import { OrderPhotoLightbox } from "@/components/order-photo-lightbox";
import { BatchSelectAllCheckbox } from "@/components/batch-select-all-checkbox";
import { BatchAssignButton } from "@/components/batch-assign-button";

type SearchParams = Promise<{
  created?: string;
  imported?: string;
  assigned?: string;
  assignedBatch?: string;
  deleted?: string;
  deletedBatch?: string;
  err?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
}>;

const customerTypes = ["精准", "客服"];
const regions = [...LUOYANG_REGIONS];

const errorText: Record<string, string> = {
  invalid: "提交失败：请检查标题和手机号格式（无需先创建套餐）。",
  file: "上传失败：单据照片不能超过 10MB。",
  edit_state: "仅未领取单据可编辑。",
  import_file: "请选择要导入的文件。",
  import_invalid: "导入失败：文件格式或数据内容不正确，请检查后重试。",
  import_limit: "导入失败：单次最多导入 500 条。",
  assign_perm: "无派单权限，请在角色管理中勾选“单据管理-派单按钮”。",
  assign_invalid: "派单失败：参数无效。",
  assign_user: "派单失败：请选择有效的移动端用户。",
  assign_state: "派单失败：仅未领取单据可派单。",
  delete_perm: "无删除权限，请在角色管理中勾选“单据管理-删除按钮”。",
  delete_state: "仅未领取单据可删除。",
};
const statusLabel: Record<string, string> = {
  PENDING: "未领取",
  CLAIMED: "已领取",
  DONE: "已完结",
  ENDED: "结束",
};

function customerTypeBadge(customerType: string) {
  const text = (customerType || "").trim();
  if (!text) {
    return <span className="text-slate-400">-</span>;
  }
  if (text.includes("精准")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>精准</span>
      </span>
    );
  }
  if (text.includes("客服") || text.includes("客户")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        <span>客户</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      {text}
    </span>
  );
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

function buildPageItems(currentPage: number, totalPages: number) {
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i >= 1 && i <= totalPages) {
      pages.add(i);
    }
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i];
    if (i > 0 && value - sorted[i - 1] > 1) {
      items.push("ellipsis");
    }
    items.push(value);
  }
  return items;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const me = await getSessionUserWithTenant();
  if (!me.tenantId) {
    redirect("/dashboard");
  }
  const isAdmin = isTenantAdminRole(me.role.code);
  const keyword = String(params.keyword ?? "").trim();
  const status = String(params.status ?? "").trim();

  const pageSize = Math.min(Math.max(Number(params.pageSize ?? 10), 10), 100);
  const page = Math.max(Number(params.page ?? 1), 1);

  const where: {
    tenantId: number;
    isDeleted: boolean;
    AND?: Array<Record<string, unknown>>;
  } = { tenantId: me.tenantId, isDeleted: false };
  const andConditions: Array<Record<string, unknown>> = [];

  if (keyword) {
    andConditions.push({
      OR: [
        { title: { contains: keyword } },
        { address: { contains: keyword } },
        { phone: { contains: keyword } },
      ],
    });
  }
  if (status) {
    andConditions.push({ status });
  }
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const queryWhere = Object.keys(where).length > 0 ? where : undefined;
  const total = await prisma.dispatchOrder.count({ where: queryWhere });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const packages = await prisma.package.findMany({
    where: { tenantId: me.tenantId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const orders = await prisma.dispatchOrder.findMany({
    where: queryWhere,
    include: {
      createdBy: { select: { displayName: true, username: true } },
      claimedBy: { select: { displayName: true, username: true } },
      package: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const mapOrders = await prisma.dispatchOrder.findMany({
    where: queryWhere,
    select: {
      id: true,
      title: true,
      address: true,
      longitude: true,
      latitude: true,
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const currentUser = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      role: {
        select: {
          code: true,
          roleMenus: {
            select: { menu: { select: { key: true } } },
          },
        },
      },
    },
  });
  const canAssign =
    (currentUser?.role.code ? isTenantAdminRole(currentUser.role.code) : false) ||
    currentUser?.role.roleMenus.some((item) => item.menu.key === "perm-order-dispatch-assign") ||
    false;
  const canDelete =
    (currentUser?.role.code ? isTenantAdminRole(currentUser.role.code) : false) ||
    currentUser?.role.roleMenus.some((item) => item.menu.key === "perm-order-delete-btn") ||
    false;
  const mobileUsers = canAssign
    ? await prisma.user.findMany({
        where: { tenantId: me.tenantId, accessMode: "MOBILE" },
        select: { id: true, displayName: true, username: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const commonQuery = {
    page: currentPage,
    pageSize,
    keyword,
    status,
  };
  const pageItems = buildPageItems(currentPage, totalPages);
  const photoItems = orders
    .filter((item) => Boolean(item.photoUrl))
    .map((item) => ({ url: item.photoUrl as string, title: item.title || `单据#${item.id}` }));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div>
          <h1 className="text-2xl font-bold">单据管理</h1>
        </div>

        {params.created === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">单据创建成功</p>
        ) : null}
        {Number(params.imported ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            单据导入成功，共 {Number(params.imported)} 条
          </p>
        ) : null}
        {params.assigned === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            派单成功{Number(params.assignedBatch ?? 0) > 0 ? `，本次派单 ${Number(params.assignedBatch)} 条` : ""}
          </p>
        ) : null}
        {params.deleted === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            单据删除成功{Number(params.deletedBatch ?? 0) > 0 ? `，本次删除 ${Number(params.deletedBatch)} 条` : ""}
          </p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "操作失败"}</p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <form className="mb-2 flex items-center gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2 whitespace-nowrap">
          <input type="hidden" name="pageSize" value={pageSize} />
          <input
            name="keyword"
            defaultValue={keyword}
            placeholder="关键字：标题/地址/手机号"
            className="h-8 w-56 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部状态</option>
            <option value="PENDING">未领取</option>
            <option value="CLAIMED">已领取</option>
            <option value="DONE">已完结</option>
            <option value="ENDED">结束</option>
          </select>
          <input type="hidden" name="page" value="1" />
          <button
            type="submit"
            className="h-8 shrink-0 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
          >
            筛选
          </button>
          <Link
            href={`/dashboard/orders?${buildQuery({ pageSize })}`}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold leading-none text-slate-700 transition hover:bg-slate-50"
          >
            重置
          </Link>
        </form>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <OrderImportModal
              action={async (formData) => {
                "use server";
                const { importDispatchOrders } = await import("./actions");
                await importDispatchOrders(formData);
              }}
            />
            <OrderImportModal
              buttonText="客资导入"
              modalTitle="客资导入"
              description="支持 xlsx/csv。表头：邀约日期、邀约客服、客户电话、客户地址、邀约见面时间、号码类型。默认客户类型=客服，单次最多 500 条。"
              templateHref="/dashboard/orders/leads-template"
              templateText="下载客资模板（xlsx）"
              action={async (formData) => {
                "use server";
                const { importLeadDispatchOrders } = await import("./actions");
                await importLeadDispatchOrders(formData);
              }}
            />
            <Link
              href={`/dashboard/orders/export?${buildQuery({
                keyword,
                status,
                format: "xlsx",
              })}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              导出 XLSX
            </Link>
            <OrderListMapModal
              orders={mapOrders.map((item) => ({
                id: item.id,
                title: item.title,
                address: item.address || "",
                longitude: item.longitude,
                latitude: item.latitude,
              }))}
            />
          </div>
          <div className="ml-auto">
            <OrderCreateModal
              packages={packages}
              customerTypes={customerTypes}
              regions={regions}
              action={async (formData) => {
                "use server";
                const { createDispatchOrder } = await import("./actions");
                await createDispatchOrder(formData);
              }}
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            共 {total} 条，当前第 {currentPage}/{totalPages} 页
          </div>
          <div className="text-xs text-slate-500">附件固定为缩略图展示（点击可查看原图）</div>
        </div>

        <form
          id="batch-operate-form"
          action={batchOperateDispatchOrders}
          className="mb-2 flex flex-wrap items-center gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="keyword" value={keyword} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="pageSize" value={pageSize} />
            {canAssign ? (
              <BatchAssignButton users={mobileUsers} formId="batch-operate-form" checkboxSelector=".batch-order-checkbox" />
            ) : null}
            {canDelete ? (
              <button
                type="submit"
                name="intent"
                value="delete"
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                批量删除
              </button>
            ) : null}
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="w-[64px] px-3 py-2 font-semibold">
                  <div className="flex items-center justify-center">
                    <BatchSelectAllCheckbox targetSelector=".batch-order-checkbox" />
                  </div>
                </th>
                <th className="w-[180px] px-3 py-2 font-semibold">标题</th>
                <th className="w-[120px] px-3 py-2 font-semibold">地址</th>
                <th className="w-[88px] px-3 py-2 font-semibold">客户类型</th>
                <th className="w-[84px] px-3 py-2 font-semibold">位置</th>
                <th className="w-[96px] px-3 py-2 font-semibold">单据状态</th>
                <th className="w-[92px] px-3 py-2 font-semibold">照片/附件</th>
                <th className="w-[100px] px-3 py-2 font-semibold">创建人</th>
                <th className="w-[165px] px-3 py-2 font-semibold">创建时间</th>
                <th className="w-[100px] px-3 py-2 font-semibold">领取人</th>
                <th className="w-[165px] px-3 py-2 font-semibold">领取时间</th>
                <th className="w-[160px] px-3 py-2 font-semibold">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 text-center">
                    {(canDelete || canAssign) && item.status === "PENDING" ? (
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={item.id}
                        form="batch-operate-form"
                        className="batch-order-checkbox h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                      />
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.title}>
                      {item.title}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.address || "-"}>
                      {item.address || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{customerTypeBadge(item.customerType || "")}</td>
                  <td className="px-3 py-3">
                    <OrderLocationMapButton
                      title={item.title}
                      address={item.address || ""}
                      longitude={item.longitude}
                      latitude={item.latitude}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {statusLabel[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.photoUrl ? (
                      <OrderPhotoLightbox
                        currentUrl={item.photoUrl}
                        currentTitle={item.title || `单据#${item.id}`}
                        photos={photoItems}
                      />
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.createdBy.displayName || item.createdBy.username}>
                      {item.createdBy.displayName || item.createdBy.username}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate" title={new Date(item.createdAt).toLocaleString("zh-CN")}>
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.claimedBy ? item.claimedBy.displayName : ""}>
                      {item.claimedBy ? item.claimedBy.displayName : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate" title={item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : ""}>
                      {item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2 text-blue-600">
                      {canAssign && item.status === "PENDING" ? (
                        <OrderAssignModal
                          orderId={item.id}
                          users={mobileUsers}
                          action={async (formData) => {
                            "use server";
                            await assignDispatchOrder(formData);
                          }}
                        />
                      ) : null}
                      <Link href={`/dashboard/orders/${item.id}`}>详情</Link>
                      {item.status === "PENDING" && (isAdmin || item.createdById === Number(session.user.id)) ? (
                        <Link href={`/dashboard/orders/${item.id}/edit`}>编辑</Link>
                      ) : null}
                      {canDelete && item.status === "PENDING" ? (
                        <form action={deleteDispatchOrder}>
                          <input type="hidden" name="orderId" value={item.id} />
                          <button type="submit" className="text-rose-600">
                            删除
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                    暂无单据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <span>每页</span>
            <form className="inline-flex items-center gap-2">
              <input type="hidden" name="keyword" value={keyword} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="page" value="1" />
              <select
                name="pageSize"
                defaultValue={String(pageSize)}
                className="h-8 w-24 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              >
                <option value="10">10 条</option>
                <option value="20">20 条</option>
                <option value="30">30 条</option>
                <option value="50">50 条</option>
                <option value="100">100 条</option>
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                应用
              </button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: Math.max(1, currentPage - 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              上一页
            </Link>
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                  ...
                </span>
              ) : (
                <Link
                  key={`page-${item}`}
                  href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: item })}`}
                  className={`rounded-lg border px-3 py-1.5 ${
                    item === currentPage
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item}
                </Link>
              ),
            )}
            <Link
              href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: Math.min(totalPages, currentPage + 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage >= totalPages ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              下一页
            </Link>
          </div>
        </div>
      </article>
    </section>
  );
}
