import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTenantDataScope } from "@/lib/tenant";

type PeriodType = "day" | "week" | "month";

function getPeriodRange(type: PeriodType, now = new Date()) {
  if (type === "day") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (type === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function fmtDayLabel(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    include: { role: true },
  });
  if (!me) {
    redirect("/login");
  }
  if (me.role.code !== "SUPER_ADMIN" && !me.tenantId) {
    redirect("/login");
  }
  const canViewTenantAll = hasTenantDataScope(me.role.code, me.role.dataScope);
  const orderWhere =
    me.role.code === "SUPER_ADMIN"
      ? { isDeleted: false }
      : canViewTenantAll
        ? { isDeleted: false, tenantId: me.tenantId as number }
        : { isDeleted: false, tenantId: me.tenantId as number, createdById: me.id };
  const recordWhereBase =
    me.role.code === "SUPER_ADMIN"
      ? {}
      : canViewTenantAll
        ? { tenantId: me.tenantId as number }
        : { tenantId: me.tenantId as number, order: { createdById: me.id } };

  const now = new Date();
  const dayRange = getPeriodRange("day", now);
  const weekRange = getPeriodRange("week", now);
  const monthRange = getPeriodRange("month", now);

  const [totalOrders, statusGroups, periodStats, regionGroups, topClaimersRaw] = await Promise.all([
    prisma.dispatchOrder.count({ where: orderWhere }),
    prisma.dispatchOrder.groupBy({
      by: ["status"],
      where: orderWhere,
      _count: { _all: true },
    }),
    Promise.all(
      [
        { key: "day", label: "ÿ��", range: dayRange },
        { key: "week", label: "ÿ��", range: weekRange },
        { key: "month", label: "ÿ��", range: monthRange },
      ].map(async (item) => {
        const [created, claimed, closed] = await Promise.all([
          prisma.dispatchOrder.count({
            where: { ...orderWhere, createdAt: { gte: item.range.start, lte: item.range.end } },
          }),
          prisma.dispatchOrderRecord.count({
            where: { actionType: "CLAIM", ...recordWhereBase, createdAt: { gte: item.range.start, lte: item.range.end } },
          }),
          prisma.dispatchOrderRecord.count({
            where: { actionType: { in: ["FINISH", "END"] }, ...recordWhereBase, createdAt: { gte: item.range.start, lte: item.range.end } },
          }),
        ]);
        const rate = created > 0 ? Math.round((closed / created) * 100) : 0;
        return { ...item, created, claimed, closed, rate };
      }),
    ),
    prisma.dispatchOrder.groupBy({
      by: ["region"],
      where: { ...orderWhere, region: { not: "" } },
      _count: { _all: true },
    }),
    prisma.dispatchOrderRecord.groupBy({
      by: ["operatorId"],
      where: { actionType: "CLAIM", ...recordWhereBase },
      _count: { _all: true },
    }),
  ]);

  const statusCountMap = new Map<string, number>();
  for (const item of statusGroups) {
    statusCountMap.set(item.status, item._count._all);
  }
  const pendingCount = statusCountMap.get("PENDING") ?? 0;
  const claimedCount = statusCountMap.get("CLAIMED") ?? 0;
  const doneCount = statusCountMap.get("DONE") ?? 0;
  const endedCount = statusCountMap.get("ENDED") ?? 0;

  const trendDates = Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - idx));
    return date;
  });
  const trendRows = await Promise.all(
    trendDates.map(async (date) => {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      const [created, claimed] = await Promise.all([
        prisma.dispatchOrder.count({ where: { ...orderWhere, createdAt: { gte: start, lte: end } } }),
        prisma.dispatchOrderRecord.count({ where: { actionType: "CLAIM", ...recordWhereBase, createdAt: { gte: start, lte: end } } }),
      ]);
      return { label: fmtDayLabel(date), created, claimed };
    }),
  );
  const trendPeak = Math.max(1, ...trendRows.map((x) => Math.max(x.created, x.claimed)));

  const topClaimers = [...topClaimersRaw]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 8);
  const claimerUsers = topClaimers.length
    ? await prisma.user.findMany({
        where: { id: { in: topClaimers.map((x) => x.operatorId) } },
        select: { id: true, displayName: true, username: true },
      })
    : [];
  const claimerMap = new Map(claimerUsers.map((u) => [u.id, u]));
  const rankRows = topClaimers.map((x) => ({
    id: x.operatorId,
    name: claimerMap.get(x.operatorId)?.displayName || claimerMap.get(x.operatorId)?.username || `�û�#${x.operatorId}`,
    count: x._count._all,
  }));

  const topRegions = [...regionGroups].sort((a, b) => b._count._all - a._count._all).slice(0, 8);
  const regionPeak = Math.max(1, ...topRegions.map((x) => x._count._all));

  return (
    <section className="space-y-5">
      <header className="overflow-hidden rounded-3xl border border-cyan-400/30 bg-[radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.25),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.25),transparent_40%),linear-gradient(135deg,#020617,#0f172a_45%,#111827)] p-6 text-slate-100 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.28em] text-cyan-200/90">DISPATCH DATA SCREEN</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-wide md:text-4xl">�ɵ�����ϵͳ���ݴ���</h1>
            <p className="mt-2 text-sm text-slate-300">{new Date().toLocaleString("zh-CN", { hour12: false })} �� {me.displayName}��{me.role.name}��</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/orders" className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20">��������</Link>
            <Link href="/mobile" className="rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20">�ͷ���</Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "��������", value: totalOrders, tone: "text-cyan-300" },
            { label: "����ȡ", value: pendingCount, tone: "text-amber-300" },
            { label: "������", value: claimedCount, tone: "text-blue-300" },
            { label: "���+����", value: doneCount + endedCount, tone: "text-emerald-300" },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-slate-300">{item.label}</p>
              <p className={`mt-1 text-3xl font-black leading-none ${item.tone}`}>{item.value}</p>
            </article>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {periodStats.map((p) => (
          <article key={p.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">{p.label}ͳ��</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">����</p><p className="text-xl font-bold text-blue-700">{p.created}</p></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">��ȡ</p><p className="text-xl font-bold text-cyan-700">{p.claimed}</p></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">���/����</p><p className="text-xl font-bold text-emerald-700">{p.closed}</p></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">�����</p><p className="text-xl font-bold text-fuchsia-700">{p.rate}%</p></div>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">��7������/��ȡ����</h2>
          <div className="mt-4 space-y-3">
            {trendRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[52px_1fr] items-center gap-3">
                <span className="text-xs text-slate-500">{row.label}</span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-[11px] text-slate-500">����</span>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(6, Math.round((row.created / trendPeak) * 100))}%` }} /></div>
                    <span className="w-6 text-right text-xs text-slate-700">{row.created}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-[11px] text-slate-500">��ȡ</span>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(6, Math.round((row.claimed / trendPeak) * 100))}%` }} /></div>
                    <span className="w-6 text-right text-xs text-slate-700">{row.claimed}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">��ȡ���а�</h2>
          <div className="mt-4 space-y-2">
            {rankRows.length > 0 ? rankRows.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700">{i + 1}. {r.name}</span>
                <span className="font-bold text-blue-700">{r.count} ��</span>
              </div>
            )) : <p className="text-sm text-slate-500">������ȡ����</p>}
          </div>
        </article>
      </div>

      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">���������ȶ� Top8</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {topRegions.length > 0 ? topRegions.map((item) => {
            const pct = Math.round((item._count._all / regionPeak) * 100);
            return (
              <div key={item.region} className="rounded-xl border border-slate-200 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="max-w-[70%] truncate text-slate-700" title={item.region || "-"}>{item.region || "-"}</span>
                  <span className="font-semibold text-slate-900">{item._count._all}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(8, pct)}%` }} /></div>
              </div>
            );
          }) : <p className="text-sm text-slate-500">������������</p>}
        </div>
      </article>
    </section>
  );
}




