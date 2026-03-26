import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns, ensureDispatchRecordGpsColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { LUOYANG_REGIONS } from "@/lib/regions";
import { canAccessMobile } from "@/lib/user-access";
import { touchUserDailyActive } from "@/lib/user-activity";
import { MobileTopPanel } from "@/components/mobile-top-panel";
import { MobileOrdersPanel } from "@/components/mobile-orders-panel";
import { MobileAutoLocationRefresh } from "@/components/mobile-auto-location-refresh";
import { OnlineHeartbeat } from "@/components/online-heartbeat";

export const dynamic = "force-dynamic";

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
  finish1: { text: "单据已办理", cls: "bg-emerald-50 text-emerald-700" },
  finish0: { text: "已办理失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "finish-handle-phone": { text: "已办理失败：办理号码格式不正确（需11位手机号）", cls: "bg-rose-50 text-rose-700" },
  end1: { text: "单据已标记为不办理", cls: "bg-emerald-50 text-emerald-700" },
  end0: { text: "不办理失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "end-reason": { text: "不办理失败：请选择原因", cls: "bg-rose-50 text-rose-700" },
  "end-remark": { text: "不办理失败：请填写备注", cls: "bg-rose-50 text-rose-700" },
  reschedule1: { text: "改约成功", cls: "bg-emerald-50 text-emerald-700" },
  reschedule0: { text: "改约失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "reschedule-empty": { text: "请先选择改约时间", cls: "bg-rose-50 text-rose-700" },
  "reschedule-range": { text: "改约失败：仅支持选择当前时间至7天内", cls: "bg-rose-50 text-rose-700" },
  convert1: { text: "已转为精准单据并回到未领取", cls: "bg-emerald-50 text-emerald-700" },
  convert0: { text: "转精准失败：仅可操作本人进行中的单据", cls: "bg-rose-50 text-rose-700" },
  "convert-date": { text: "转精准失败：约定时间格式不正确", cls: "bg-rose-50 text-rose-700" },
  "claim-limit-precise": { text: "今日精准客资领取次数已达上限", cls: "bg-rose-50 text-rose-700" },
  "claim-limit-service": { text: "今日客服客资领取次数已达上限", cls: "bg-rose-50 text-rose-700" },
  "claim-disabled": { text: "该账号已被禁止抢单，请联系管理员", cls: "bg-rose-50 text-rose-700" },
  file: { text: "上传失败：图片不能超过 10MB", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd1": { text: "个人中心：密码修改成功", cls: "bg-emerald-50 text-emerald-700" },
  "profile-pwd0": { text: "个人中心：请填写完整密码信息", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-short": { text: "个人中心：新密码至少 6 位", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-mismatch": { text: "个人中心：两次输入的新密码不一致", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-old": { text: "个人中心：原密码错误", cls: "bg-rose-50 text-rose-700" },
};

export default async function MobilePage({ searchParams }: { searchParams: SearchParams }) {
  await ensureDispatchOrderBusinessColumns();
  await ensureDispatchRecordGpsColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, accessMode: true, longitude: true, latitude: true, displayName: true, tenantId: true, isDeleted: true, isDisabled: true, lastLoginAt: true },
  });

  if (!me || me.isDeleted || me.isDisabled) {
    redirect("/login");
  }

  if (!canAccessMobile(me.accessMode)) {
    redirect("/dashboard");
  }
  if (!me.tenantId) {
    redirect("/login");
  }

  await touchUserDailyActive(me.id, me.lastLoginAt);

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
      isImportant: true,
      phone: true,
      handledPhone: true,
      notHandledReason: true,
      status: true,
      longitude: true,
      latitude: true,
      appointmentAt: true,
      createdAt: true,
      updatedAt: true,
      claimedAt: true,
      convertedToPreciseAt: true,
      createdById: true,
      createdBy: {
        select: {
          displayName: true,
          username: true,
        },
      },
      convertedToPreciseBy: {
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
    if (selectedRegionRaw && selectedRegionRaw !== "AUTO") qs.set("region", selectedRegionRaw);
    return qs.toString();
  };

  const opInfo = params.op ? opMessage[params.op] : null;

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900">
      <section className="mx-auto max-w-md space-y-3">
        <MobileAutoLocationRefresh enabled />
        <OnlineHeartbeat />
        <MobileTopPanel
          displayName={me.displayName}
          latitude={me.latitude ?? null}
          longitude={me.longitude ?? null}
          claimed={params.claimed}
          opText={opInfo?.text}
          opClassName={opInfo?.cls}
          profileHref={`/mobile/profile?tab=${tab}`}
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
          accessMode={me.accessMode}
          regions={regions}
          initialSelectedRegion={selectedRegionRaw}
          orders={ordersWithDistance.map((item) => ({
            id: item.id,
            title: item.title,
            address: item.address,
            region: item.region,
            customerType: item.customerType || "",
            isImportant: Boolean(item.isImportant),
            phone: item.phone || "",
            handledPhone: item.handledPhone || "",
            notHandledReason: item.notHandledReason || "",
            status: item.status,
            longitude: item.longitude ?? null,
            latitude: item.latitude ?? null,
            appointmentAt: item.appointmentAt ? item.appointmentAt.toISOString() : null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            claimedAt: item.claimedAt ? item.claimedAt.toISOString() : null,
            convertedToPreciseAt: item.convertedToPreciseAt ? item.convertedToPreciseAt.toISOString() : null,
            convertedToPreciseByName: item.convertedToPreciseBy
              ? item.convertedToPreciseBy.displayName || item.convertedToPreciseBy.username
              : "",
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


