import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchRecordGpsColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { LUOYANG_REGIONS } from "@/lib/regions";
import { MobileTopPanel } from "@/components/mobile-top-panel";
import { MobileOrdersPanel } from "@/components/mobile-orders-panel";

type SearchParams = Promise<{
  tab?: string;
  region?: string;
  claimed?: string;
  op?: string;
}>;

function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const opMessage: Record<string, { text: string; cls: string }> = {
  append1: { text: "追加记录成功", cls: "bg-emerald-50 text-emerald-700" },
  append0: { text: "追加记录失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "append-empty": { text: "请填写备注或上传照片", cls: "bg-rose-50 text-rose-700" },
  finish1: { text: "单据已完结", cls: "bg-emerald-50 text-emerald-700" },
  finish0: { text: "完结失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "finish-distance": { text: "完结失败：精准客资需在客户位置 2km 内", cls: "bg-rose-50 text-rose-700" },
  end1: { text: "单据已结束", cls: "bg-emerald-50 text-emerald-700" },
  end0: { text: "结束失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "end-distance": { text: "结束失败：精准客资需在客户位置 2km 内", cls: "bg-rose-50 text-rose-700" },
  reschedule1: { text: "改约成功", cls: "bg-emerald-50 text-emerald-700" },
  reschedule0: { text: "改约失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "reschedule-empty": { text: "请先选择改约时间", cls: "bg-rose-50 text-rose-700" },
  return1: { text: "单据已退回待领取", cls: "bg-emerald-50 text-emerald-700" },
  return0: { text: "退单失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "claim-limit-precise": { text: "今日精准客资领取次数已达上限", cls: "bg-rose-50 text-rose-700" },
  "claim-limit-service": { text: "今日客服客资领取次数已达上限", cls: "bg-rose-50 text-rose-700" },
  file: { text: "上传失败：图片不能超过 10MB", cls: "bg-rose-50 text-rose-700" },
};

export default async function MobilePage({ searchParams }: { searchParams: SearchParams }) {
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, accessMode: true, longitude: true, latitude: true, displayName: true, tenantId: true },
  });

  if (!me) {
    redirect("/login");
  }

  if (me.accessMode !== "MOBILE") {
    redirect("/dashboard");
  }
  if (!me.tenantId) {
    redirect("/login");
  }

  const params = await searchParams;
  const tab = ["new", "doing", "done"].includes(String(params.tab)) ? String(params.tab) : "new";
  const selectedRegionRaw = String(params.region ?? "").trim() || "AUTO";

  const baseWhere: any = { isDeleted: false, tenantId: me.tenantId };

  if (tab === "new") {
    baseWhere.status = "PENDING";
  } else if (tab === "doing") {
    baseWhere.status = "CLAIMED";
    baseWhere.claimedById = me.id;
  } else {
    baseWhere.status = { in: ["DONE", "ENDED"] };
    baseWhere.claimedById = me.id;
  }

  const regions = [...LUOYANG_REGIONS];

  const orders = await prisma.dispatchOrder.findMany({
    where: baseWhere,
    select: {
      id: true,
      title: true,
      address: true,
      region: true,
      customerType: true,
      phone: true,
      status: true,
      longitude: true,
      latitude: true,
      createdAt: true,
      updatedAt: true,
      claimedAt: true,
      createdById: true,
      createdBy: {
        select: {
          displayName: true,
          username: true,
        },
      },
      records: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          actionType: true,
          remark: true,
          photoUrl: true,
          operatorLongitude: true,
          operatorLatitude: true,
          createdAt: true,
          operator: {
            select: {
              displayName: true,
              username: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const ordersWithDistance = orders
    .map((item) => {
      let distanceKm: number | null = null;
      if (me.latitude != null && me.longitude != null && item.latitude != null && item.longitude != null) {
        distanceKm = calcDistanceKm(me.latitude, me.longitude, item.latitude, item.longitude);
      }
      const terminalRecord = item.records.find((record) => record.actionType === "FINISH" || record.actionType === "END");
      const terminalAt = terminalRecord ? terminalRecord.createdAt : item.updatedAt;
      return { ...item, distanceKm, terminalAt };
    })
    .sort((a, b) => {
      if (tab === "doing") {
        const at = a.claimedAt ? new Date(a.claimedAt).getTime() : 0;
        const bt = b.claimedAt ? new Date(b.claimedAt).getTime() : 0;
        return bt - at;
      }
      if (tab === "done") {
        const at = a.terminalAt ? new Date(a.terminalAt).getTime() : 0;
        const bt = b.terminalAt ? new Date(b.terminalAt).getTime() : 0;
        return bt - at;
      }
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

  const queryOf = (nextTab: string) => {
    const qs = new URLSearchParams();
    qs.set("tab", nextTab);
    return qs.toString();
  };

  const opInfo = params.op ? opMessage[params.op] : null;

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900">
      <section className="mx-auto max-w-md space-y-3">
        <MobileTopPanel
          displayName={me.displayName}
          latitude={me.latitude ?? null}
          longitude={me.longitude ?? null}
          claimed={params.claimed}
          opText={opInfo?.text}
          opClassName={opInfo?.cls}
          orders={ordersWithDistance.map((item) => ({
            id: item.id,
            title: item.title,
            address: item.address,
            longitude: item.longitude ?? null,
            latitude: item.latitude ?? null,
          }))}
        />

        <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
          <div className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
            <Link
              href={`/mobile?${queryOf("new")}`}
              className={`rounded-lg px-2 py-2 ${tab === "new" ? "bg-slate-100 text-blue-600" : "text-slate-600"}`}
            >
              新任务
            </Link>
            <Link
              href={`/mobile?${queryOf("doing")}`}
              className={`rounded-lg px-2 py-2 ${tab === "doing" ? "bg-slate-100 text-blue-600" : "text-slate-600"}`}
            >
              进行中
            </Link>
            <Link
              href={`/mobile?${queryOf("done")}`}
              className={`rounded-lg px-2 py-2 ${tab === "done" ? "bg-slate-100 text-blue-600" : "text-slate-600"}`}
            >
              已结束
            </Link>
          </div>
        </div>

        <MobileOrdersPanel
          tab={tab}
          regions={regions}
          initialSelectedRegion={selectedRegionRaw}
          orders={ordersWithDistance.map((item) => ({
            id: item.id,
            title: item.title,
            address: item.address,
            region: item.region,
            customerType: item.customerType || "",
            phone: item.phone || "",
            status: item.status,
            longitude: item.longitude ?? null,
            latitude: item.latitude ?? null,
            createdAt: item.createdAt.toISOString(),
            claimedAt: item.claimedAt ? item.claimedAt.toISOString() : null,
            createdByName: item.createdBy.displayName || item.createdBy.username || `用户#${item.createdById}`,
            distanceKm: item.distanceKm,
            records: item.records.map((record) => ({
              id: record.id,
              actionType: record.actionType,
              remark: record.remark ?? null,
              photoUrl: record.photoUrl ?? null,
              operatorLongitude: record.operatorLongitude ?? null,
              operatorLatitude: record.operatorLatitude ?? null,
              createdAt: record.createdAt.toISOString(),
              operator: {
                displayName: record.operator.displayName ?? null,
                username: record.operator.username ?? "",
              },
            })),
          }))}
        />
      </section>
    </main>
  );
}


