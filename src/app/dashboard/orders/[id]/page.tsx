import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns, ensureDispatchRecordGpsColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, hasTenantDataScope } from "@/lib/tenant";
import { OrderAppendRecordModal } from "@/components/order-append-record-modal";
import { RecordTrackMapButton } from "@/components/record-track-map-button";
import { appendDispatchOrderRecordByBackend } from "../actions";

type Params = Promise<{ id: string }>;

type SearchParams = Promise<{ updated?: string; op?: string }>;

const statusLabel: Record<string, string> = {
  PENDING: "未领取",
  CLAIMED: "已领取",
  DONE: "已完结",
  ENDED: "结束",
};

const statusClass: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CLAIMED: "bg-blue-50 text-blue-700 ring-blue-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ENDED: "bg-slate-100 text-slate-700 ring-slate-200",
};

const actionLabel: Record<string, string> = {
  CLAIM: "领取",
  APPEND: "追加",
  FINISH: "完结",
  END: "结束",
  RESCHEDULE: "改约",
  RETURN: "退回",
  CONVERT_PRECISE: "转精准",
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await ensureDispatchOrderBusinessColumns();
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await getSessionUserWithTenant();
  if (!me.tenantId && me.role.code !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const routeParams = await params;
  const query = await searchParams;

  const orderId = Number(routeParams.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    notFound();
  }

  const where = {
    id: orderId,
    isDeleted: false,
    ...(me.tenantId ? { tenantId: me.tenantId } : {}),
    ...(hasTenantDataScope(me.role.code, me.role.dataScope) ? {} : { createdById: Number(session.user.id) }),
  };

  const order = await prisma.dispatchOrder.findFirst({
    where,
    include: {
      createdBy: { select: { username: true, displayName: true } },
      claimedBy: { select: { username: true, displayName: true } },
      package: { select: { id: true, name: true, code: true, price: true } },
      convertedToPreciseBy: { select: { username: true, displayName: true } },
      records: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          operator: { select: { username: true, displayName: true } },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }
  const canEdit =
    order.status === "PENDING" &&
    (hasTenantDataScope(me.role.code, me.role.dataScope) || order.createdById === Number(session.user.id));
  const opMessage: Record<string, { text: string; cls: string }> = {
    append1: { text: "追加记录成功", cls: "bg-emerald-50 text-emerald-700" },
    append0: { text: "追加记录失败：无权限或单据不存在", cls: "bg-rose-50 text-rose-700" },
    "append-empty": { text: "请填写备注或上传照片", cls: "bg-rose-50 text-rose-700" },
    file: { text: "上传失败：图片不能超过 10MB", cls: "bg-rose-50 text-rose-700" },
  };
  const opInfo = query.op ? opMessage[query.op] : null;

  const detailRows = [
    { label: "单据ID", value: String(order.id) },
    { label: "标题", value: order.title },
    { label: "套餐", value: order.package ? `${order.package.name} (${order.package.code})` : "-" },
    { label: "手机号", value: order.phone || "-" },
    { label: "客户办理号码", value: order.handledPhone || "-" },
    { label: "客户类型", value: order.customerType || "-" },
    { label: "约定时间", value: order.appointmentAt ? new Date(order.appointmentAt).toLocaleString("zh-CN") : "-" },
    {
      label: "转精准",
      value: order.convertedToPreciseAt
        ? `${order.convertedToPreciseBy?.displayName || order.convertedToPreciseBy?.username || "-"} · ${new Date(order.convertedToPreciseAt).toLocaleString("zh-CN")}`
        : "-",
    },
    { label: "区域", value: order.region || "-" },
    {
      label: "领取人",
      value: order.claimedBy ? `${order.claimedBy.displayName || order.claimedBy.username}` : "-",
    },
    { label: "领取时间", value: order.claimedAt ? new Date(order.claimedAt).toLocaleString("zh-CN") : "-" },
    {
      label: "创建人",
      value: `${order.createdBy.displayName || order.createdBy.username}`,
    },
    { label: "创建时间", value: new Date(order.createdAt).toLocaleString("zh-CN") },
    { label: "更新时间", value: new Date(order.updatedAt).toLocaleString("zh-CN") },
  ];

  const amapUrl =
    order.longitude != null && order.latitude != null
      ? `https://uri.amap.com/navigation?to=${order.longitude},${order.latitude},${encodeURIComponent(order.title)}&mode=car&policy=1&src=paidan&coordinate=gaode&callnative=1`
      : order.address
        ? `https://uri.amap.com/search?keyword=${encodeURIComponent(order.address)}&src=paidan&callnative=1`
        : "";

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">单据详情</h1>
            <p className="mt-2 text-sm text-slate-200">查看单据完整信息、附件和流转记录。</p>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass[order.status] ?? "bg-white/20 text-white ring-white/30"}`}
              >
                {statusLabel[order.status] ?? order.status}
              </span>
              <span className="text-sm text-slate-200">#{order.id}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/orders"
              className="rounded-xl border border-white/40 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              返回列表
            </Link>
            <OrderAppendRecordModal orderId={order.id} action={appendDispatchOrderRecordByBackend} />
            {canEdit ? (
              <Link
                href={`/dashboard/orders/${order.id}/edit`}
                className="rounded-xl border border-white/40 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                编辑单据
              </Link>
            ) : null}
          </div>
        </div>

        {query.updated === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">单据更新成功</p>
        ) : null}
        {opInfo ? <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${opInfo.cls}`}>{opInfo.text}</p> : null}
      </header>

      <article className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-base font-semibold text-slate-900">基础信息</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <p className="mt-1 break-all text-sm font-medium text-slate-900">{row.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-base font-semibold text-slate-900">地址与定位</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-800">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-slate-500">地址</p>
                <p className="mt-1">{order.address || "-"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs text-slate-500">经度</p>
                  <p className="mt-1">{order.longitude != null ? order.longitude.toFixed(6) : "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs text-slate-500">纬度</p>
                  <p className="mt-1">{order.latitude != null ? order.latitude.toFixed(6) : "-"}</p>
                </div>
              </div>
              {amapUrl ? (
                <a
                  href={amapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  在高德中查看
                </a>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-base font-semibold text-slate-900">备注信息</h2>
            <p className="mt-3 min-h-24 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
              {order.remark || "-"}
            </p>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-base font-semibold text-slate-900">照片/附件</h2>
            {order.photoUrl ? (
              <div className="mt-3">
                <a href={order.photoUrl} target="_blank" rel="noreferrer" className="inline-block">
                  <Image
                    src={order.photoUrl}
                    alt="单据附件"
                    width={320}
                    height={220}
                    className="rounded-xl border border-slate-200 object-cover"
                  />
                </a>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">暂无附件</p>
            )}
          </section>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-base font-semibold text-slate-900">流转记录</h2>
        {order.records.length > 0 ? (
          <div className="mt-4 space-y-3">
            {order.records.map((record) => (
              <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {(record.operator.displayName || record.operator.username) +
                      (record.operator.displayName ? `（${record.operator.username}）` : "")}{" "}
                    · {new Date(record.createdAt).toLocaleString("zh-CN")} · {actionLabel[record.actionType] ?? record.actionType}
                  </p>
                  <RecordTrackMapButton
                    orderTitle={order.title}
                    orderAddress={order.address || ""}
                    orderLongitude={order.longitude}
                    orderLatitude={order.latitude}
                    operatorName={record.operator.displayName || record.operator.username}
                    operatorLongitude={record.operatorLongitude ?? null}
                    operatorLatitude={record.operatorLatitude ?? null}
                  />
                </div>
                {record.remark ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">备注：{record.remark}</p> : null}
                {record.photoUrl ? (
                  <a href={record.photoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                    <Image
                      src={record.photoUrl}
                      alt="流转记录附件"
                      width={88}
                      height={88}
                      className="rounded-lg border border-slate-200 object-cover"
                    />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">暂无流转记录</p>
        )}
      </article>
    </section>
  );
}



