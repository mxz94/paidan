import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { DashboardStoreFilter } from "@/components/dashboard-store-filter";
import { canAccessMobile, resolveDashboardLandingPathByMenus } from "@/lib/user-access";

type PeriodType = "day" | "week" | "month";

type SearchParams = Promise<{
  storeId?: string;
  period?: string;
}>;

function getPeriodRange(type: PeriodType, anchor = new Date()) {
  if (type === "day") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 0, 0, 0);
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (type === "week") {
    const day = anchor.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - diffToMonday);
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return qs.toString();
}


export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureDispatchOrderBusinessColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    include: {
      role: {
        include: {
          roleMenus: {
            include: { menu: true },
          },
        },
      },
    },
  });
  if (!me) redirect("/login");
  if (me.role.code !== "SUPER_ADMIN" && !me.tenantId) redirect("/login");

  const menuLandingPath = resolveDashboardLandingPathByMenus(
    me.role.roleMenus.map((item) => item.menu),
  );
  if (menuLandingPath && menuLandingPath !== "/dashboard") {
    redirect(menuLandingPath);
  }
  if (!menuLandingPath) {
    if (canAccessMobile(me.accessMode)) {
      redirect("/mobile");
    }
    redirect("/login");
  }

  const params = await searchParams;
  const tenantWhere = me.role.code === "SUPER_ADMIN" ? {} : { tenantId: me.tenantId as number };
  const scopedStoreId =
    me.role.code !== "SUPER_ADMIN" && Number.isInteger(Number(me.storeId)) && Number(me.storeId) > 0
      ? Number(me.storeId)
      : undefined;
  const canFilterStore = me.role.code !== "SUPER_ADMIN" && Boolean(me.tenantId);

  const stores = canFilterStore
    ? await prisma.store.findMany({
        where: {
          tenantId: Number(me.tenantId),
          isDeleted: false,
          ...(scopedStoreId ? { id: scopedStoreId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const selectedStoreIdRaw = String(params.storeId ?? "").trim();
  const selectedStoreId = Number(selectedStoreIdRaw);
  const defaultStoreId = scopedStoreId && stores.some((s) => s.id === scopedStoreId) ? scopedStoreId : undefined;
  const activeStoreId =
    canFilterStore && Number.isInteger(selectedStoreId) && stores.some((s) => s.id === selectedStoreId)
      ? selectedStoreId
      : defaultStoreId;

  const periodRaw = String(params.period ?? "day") as PeriodType;
  const period: PeriodType = periodRaw === "week" || periodRaw === "month" ? periodRaw : "day";
  const anchor = new Date();
  const range = getPeriodRange(period, anchor);

  const orderStoreWhere = activeStoreId ? { createdBy: { storeId: activeStoreId } } : {};
  const timeoutRecordStoreWhere = activeStoreId ? { operator: { storeId: activeStoreId } } : {};

  const [
    totalOrders,
    statusGroups,
    serviceEntryRaw,
    serviceInvalidRaw,
    saleClaimRaw,
    inProgressRaw,
    periodStoreOrders,
    timeoutTransferRecords,
    saleFinishEndRecords,
  ] = await Promise.all([
    prisma.dispatchOrder.count({ where: { isDeleted: false, ...tenantWhere, ...orderStoreWhere } }),
    prisma.dispatchOrder.groupBy({
      by: ["status"],
      where: { isDeleted: false, ...tenantWhere, ...orderStoreWhere },
      _count: { _all: true },
    }),
    prisma.dispatchOrder.groupBy({
      by: ["createdById"],
      where: {
        isDeleted: false,
        ...tenantWhere,
        createdAt: { gte: range.start, lte: range.end },
        createdBy: {
          accessMode: { in: ["SERVICE", "SUPERVISOR"] },
          isDeleted: false,
          ...(activeStoreId ? { storeId: activeStoreId } : {}),
        },
      },
      _count: { _all: true },
    }),
    prisma.dispatchOrder.groupBy({
      by: ["createdById"],
      where: {
        isDeleted: false,
        ...tenantWhere,
        status: "ENDED",
        notHandledReason: { contains: "无效客资" },
        updatedAt: { gte: range.start, lte: range.end },
        createdBy: {
          accessMode: { in: ["SERVICE", "SUPERVISOR"] },
          isDeleted: false,
          ...(activeStoreId ? { storeId: activeStoreId } : {}),
        },
      },
      _count: { _all: true },
    }),
    prisma.dispatchOrderRecord.groupBy({
      by: ["operatorId"],
      where: {
        actionType: "CLAIM",
        ...tenantWhere,
        createdAt: { gte: range.start, lte: range.end },
        operator: {
          accessMode: { in: ["SALE", "SUPERVISOR"] },
          isDeleted: false,
          ...(activeStoreId ? { storeId: activeStoreId } : {}),
        },
      },
      _count: { _all: true },
    }),
    prisma.dispatchOrder.groupBy({
      by: ["claimedById"],
      where: {
        isDeleted: false,
        ...tenantWhere,
        status: "CLAIMED",
        claimedById: { not: null },
        claimedBy: {
          is: {
            isDeleted: false,
            ...(activeStoreId ? { storeId: activeStoreId } : {}),
          },
        },
      },
      _count: { _all: true },
    }),
    prisma.dispatchOrder.findMany({
      where: {
        isDeleted: false,
        ...tenantWhere,
        ...orderStoreWhere,
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        status: true,
        createdBy: { select: { storeId: true } },
      },
      take: 5000,
    }),
    prisma.dispatchOrderRecord.findMany({
      where: {
        actionType: "AUTO_TRANSFER",
        ...tenantWhere,
        ...timeoutRecordStoreWhere,
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        remark: true,
        operator: { select: { storeId: true } },
      },
      take: 5000,
    }),
    prisma.dispatchOrderRecord.findMany({
      where: {
        actionType: { in: ["FINISH", "END"] },
        ...tenantWhere,
        createdAt: { gte: range.start, lte: range.end },
        operator: { accessMode: "SALE", isDeleted: false, ...(activeStoreId ? { storeId: activeStoreId } : {}) },
      },
      select: {
        operatorId: true,
        createdAt: true,
        operator: { select: { displayName: true, username: true } },
        order: { select: { claimedAt: true } },
      },
      take: 8000,
    }),
  ]);

  const statusCountMap = new Map<string, number>();
  for (const item of statusGroups) statusCountMap.set(item.status, item._count._all);
  const pendingCount = statusCountMap.get("PENDING") ?? 0;
  const claimedCount = statusCountMap.get("CLAIMED") ?? 0;
  const doneCount = statusCountMap.get("DONE") ?? 0;
  const endedCount = statusCountMap.get("ENDED") ?? 0;

  const userIds = Array.from(
    new Set([
      ...serviceEntryRaw.map((x) => x.createdById),
      ...serviceInvalidRaw.map((x) => x.createdById),
      ...saleClaimRaw.map((x) => x.operatorId),
      ...inProgressRaw.map((x) => x.claimedById).filter((x): x is number => typeof x === "number"),
    ]),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const serviceEntryRows = [...serviceEntryRaw]
    .sort((a, b) => b._count._all - a._count._all)
    .map((x) => ({
      id: x.createdById,
      name: userMap.get(x.createdById)?.displayName || userMap.get(x.createdById)?.username || `用户#${x.createdById}`,
      count: x._count._all,
    }));

  const serviceInvalidRows = [...serviceInvalidRaw]
    .sort((a, b) => b._count._all - a._count._all)
    .map((x) => ({
      id: x.createdById,
      name: userMap.get(x.createdById)?.displayName || userMap.get(x.createdById)?.username || `用户#${x.createdById}`,
      count: x._count._all,
    }));

  const saleClaimRows = [...saleClaimRaw]
    .sort((a, b) => b._count._all - a._count._all)
    .map((x) => ({
      id: x.operatorId,
      name: userMap.get(x.operatorId)?.displayName || userMap.get(x.operatorId)?.username || `用户#${x.operatorId}`,
      count: x._count._all,
    }));

  const serviceEntryTotal = serviceEntryRows.reduce((sum, item) => sum + item.count, 0);
  const serviceInvalidTotal = serviceInvalidRows.reduce((sum, item) => sum + item.count, 0);
  const saleClaimTotal = saleClaimRows.reduce((sum, item) => sum + item.count, 0);
  const inProgressRows = [...inProgressRaw]
    .filter((x): x is typeof x & { claimedById: number } => typeof x.claimedById === "number")
    .sort((a, b) => b._count._all - a._count._all)
    .map((x) => ({
      id: x.claimedById,
      name: userMap.get(x.claimedById)?.displayName || userMap.get(x.claimedById)?.username || `用户#${x.claimedById}`,
      count: x._count._all,
    }));
  const inProgressTotal = inProgressRows.reduce((sum, item) => sum + item.count, 0);

  const storeIds = Array.from(
    new Set(
      [
        ...periodStoreOrders.map((x) => x.createdBy.storeId),
        ...timeoutTransferRecords.map((x) => x.operator.storeId ?? null),
      ].filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0),
    ),
  );

  const extraStores = storeIds.length
    ? await prisma.store.findMany({
        where: { id: { in: storeIds }, isDeleted: false, ...(me.role.code === "SUPER_ADMIN" ? {} : { tenantId: Number(me.tenantId) }) },
        select: { id: true, name: true },
      })
    : [];
  const storeNameMap = new Map(extraStores.map((s) => [s.id, s.name]));

  const convertMap = new Map<number, { total: number; closed: number }>();
  for (const row of periodStoreOrders) {
    const storeId = row.createdBy.storeId ?? 0;
    if (!storeId) continue;
    const current = convertMap.get(storeId) ?? { total: 0, closed: 0 };
    current.total += 1;
    if (row.status === "DONE" || row.status === "ENDED") current.closed += 1;
    convertMap.set(storeId, current);
  }
  const storeConvertRows = Array.from(convertMap.entries())
    .map(([storeId, x]) => ({
      storeId,
      name: storeNameMap.get(storeId) || `门店#${storeId}`,
      total: x.total,
      closed: x.closed,
      rate: x.total > 0 ? Math.round((x.closed / x.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.closed - a.closed || b.total - a.total)
    .slice(0, 10);

  const timeoutMap = new Map<number, { pending24: number; claim72: number }>();
  for (const row of timeoutTransferRecords) {
    const storeId = row.operator.storeId ?? 0;
    if (!storeId) continue;
    const current = timeoutMap.get(storeId) ?? { pending24: 0, claim72: 0 };
    const remark = String(row.remark ?? "");
    if (remark.includes("系统自动转单A")) {
      current.pending24 += 1;
    } else if (remark.includes("系统自动转单B") || remark.includes("系统自动转单C")) {
      current.claim72 += 1;
    } else {
      continue;
    }
    timeoutMap.set(storeId, current);
  }
  const timeoutRows = Array.from(timeoutMap.entries())
    .map(([storeId, x]) => ({
      storeId,
      name: storeNameMap.get(storeId) || `门店#${storeId}`,
      pending24: x.pending24,
      claim72: x.claim72,
      total: x.pending24 + x.claim72,
    }))
    .sort((a, b) => b.total - a.total || b.claim72 - a.claim72 || b.pending24 - a.pending24)
    .slice(0, 10);

  const serviceEntryCountMap = new Map(serviceEntryRaw.map((x) => [x.createdById, x._count._all]));
  const serviceInvalidCountMap = new Map(serviceInvalidRaw.map((x) => [x.createdById, x._count._all]));
  const serviceEfficiencyRows = Array.from(serviceEntryCountMap.entries())
    .map(([userId, entry]) => {
      const invalid = serviceInvalidCountMap.get(userId) ?? 0;
      const rate = entry > 0 ? Math.round((invalid / entry) * 100) : 0;
      return {
        userId,
        name: userMap.get(userId)?.displayName || userMap.get(userId)?.username || `用户#${userId}`,
        entry,
        invalid,
        rate,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.invalid - a.invalid || b.entry - a.entry)
    .slice(0, 10);

  const saleEfficiencyMap = new Map<number, { sumHours: number; count: number; name: string }>();
  for (const row of saleFinishEndRecords) {
    const claimedAt = row.order.claimedAt;
    if (!claimedAt) continue;
    const diffMs = row.createdAt.getTime() - claimedAt.getTime();
    if (diffMs < 0) continue;
    const diffHours = diffMs / (1000 * 60 * 60);
    const current = saleEfficiencyMap.get(row.operatorId) ?? {
      sumHours: 0,
      count: 0,
      name: row.operator.displayName || row.operator.username || `用户#${row.operatorId}`,
    };
    current.sumHours += diffHours;
    current.count += 1;
    saleEfficiencyMap.set(row.operatorId, current);
  }
  const saleEfficiencyRows = Array.from(saleEfficiencyMap.entries())
    .map(([userId, x]) => ({
      userId,
      name: x.name,
      avgHours: x.count > 0 ? x.sumHours / x.count : 0,
      count: x.count,
    }))
    .sort((a, b) => a.avgHours - b.avgHours || b.count - a.count)
    .slice(0, 10);

  const baseQuery = {
    storeId: activeStoreId,
    period,
  };

  const periodLabel = period === "day" ? "本日" : period === "week" ? "本周" : "本月";

  return (
    <section className="space-y-5">
      <header className="overflow-hidden rounded-3xl border border-cyan-400/30 bg-[radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.25),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.25),transparent_40%),linear-gradient(135deg,#020617,#0f172a_45%,#111827)] p-6 text-slate-100 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.28em] text-cyan-200/90">DISPATCH DASHBOARD</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-wide md:text-4xl">派单管理系统数据面板</h1>
            <p className="mt-2 text-sm text-slate-300">
              {new Date().toLocaleString("zh-CN", { hour12: false })} · {me.displayName}（{me.role.name}）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canFilterStore ? (
              <DashboardStoreFilter
                stores={stores}
                activeStoreId={activeStoreId}
                period={period}
                disabled={Boolean(scopedStoreId)}
              />
            ) : null}

            <div className="inline-flex rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-1 text-xs font-semibold">
              {([
                { key: "day", label: "本日" },
                { key: "week", label: "本周" },
                { key: "month", label: "本月" },
              ] as const).map((x) => (
                <Link
                  key={x.key}
                  href={`/dashboard?${buildQuery({ ...baseQuery, period: x.key })}`}
                  className={`rounded-lg px-2.5 py-1 ${period === x.key ? "bg-white text-slate-900" : "text-cyan-100"}`}
                >
                  {x.label}
                </Link>
              ))}
            </div>

            <Link href="/dashboard" className="rounded-xl border border-slate-300/40 bg-slate-400/10 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-400/20">
              重置
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "单据总量", value: totalOrders, tone: "text-cyan-300" },
            { label: "未领取", value: pendingCount, tone: "text-amber-300" },
            { label: "进行中", value: claimedCount, tone: "text-blue-300" },
            { label: "已结束(已办理+不办理)", value: doneCount + endedCount, tone: "text-emerald-300" },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">{item.label}</p>
              <p className={`mt-1 text-3xl font-black leading-none ${item.tone}`}>{item.value}</p>
            </article>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">客服录入排行</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {serviceEntryRows.length > 0 ? (
              serviceEntryRows.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-blue-700">{r.count} 条</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
            合计：<span className="text-blue-700">{serviceEntryTotal}</span> 条
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">客服无效客资排行</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {serviceInvalidRows.length > 0 ? (
              serviceInvalidRows.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-rose-700">{r.count} 条</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
            合计：<span className="text-rose-700">{serviceInvalidTotal}</span> 条
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">业务员领取排行</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {saleClaimRows.length > 0 ? (
              saleClaimRows.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-emerald-700">{r.count} 次</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
            合计：<span className="text-emerald-700">{saleClaimTotal}</span> 次
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">进行中单据排行</h2>
            <span className="text-xs text-slate-500">实时</span>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {inProgressRows.length > 0 ? (
              inProgressRows.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-violet-700">{r.count} 单</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
            合计：<span className="text-violet-700">{inProgressTotal}</span> 单
          </div>
        </article>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">门店转化率排行</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 space-y-2">
            {storeConvertRows.length > 0 ? (
              storeConvertRows.map((r, i) => (
                <div key={r.storeId} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="max-w-[60%] truncate text-slate-700" title={r.name}>
                    {i + 1}. {r.name}
                  </span>
                  <span className="font-bold text-indigo-700">{r.rate}%（{r.closed}/{r.total}）</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">超时单据统计（按门店）</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 space-y-2">
            {timeoutRows.length > 0 ? (
              timeoutRows.map((r, i) => (
                <div key={r.storeId} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="max-w-[60%] truncate text-slate-700" title={r.name}>
                      {i + 1}. {r.name}
                    </span>
                    <span className="font-bold text-rose-700">{r.total}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">未领取超24h：{r.pending24} · 进行中超72h：{r.claim72}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">客服无效率排行</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 space-y-2">
            {serviceEfficiencyRows.length > 0 ? (
              serviceEfficiencyRows.map((r, i) => (
                <div key={r.userId} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-rose-700">{r.rate}%（{r.invalid}/{r.entry}）</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">业务员处理效率</h2>
            <span className="text-xs text-slate-500">{periodLabel}</span>
          </div>
          <div className="mt-3 space-y-2">
            {saleEfficiencyRows.length > 0 ? (
              saleEfficiencyRows.map((r, i) => (
                <div key={r.userId} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {r.name}</span>
                  <span className="font-bold text-emerald-700">{r.avgHours.toFixed(1)} 小时（{r.count}单）</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">暂无数据</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}



