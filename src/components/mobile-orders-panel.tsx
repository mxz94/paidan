"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  claimDispatchOrder,
  convertDispatchOrderToPrecise,
  endDispatchOrder,
  finishDispatchOrder,
  rescheduleDispatchOrder,
} from "@/app/mobile/actions";
import { AmapPickerModal } from "@/components/amap-picker-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RecordTrackMapButton } from "@/components/record-track-map-button";

type RecordItem = {
  id: number;
  actionType: string;
  remark: string | null;
  photoUrl: string | null;
  operatorLongitude: number | null;
  operatorLatitude: number | null;
  createdAt: string;
  operator: {
    displayName: string | null;
    username: string;
  };
};

type OrderItem = {
  id: number;
  title: string;
  remark?: string;
  address: string;
  region: string;
  customerType: string;
  isImportant: boolean;
  phone: string;
  handledPhone: string;
  status: string;
  longitude: number | null;
  latitude: number | null;
  appointmentAt: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  convertedToPreciseAt: string | null;
  convertedToPreciseByName: string;
  createdByName: string;
  distanceKm: number | null;
  records: RecordItem[];
};

type Props = {
  tab: string;
  accessMode: string;
  regions: string[];
  initialSelectedRegion: string;
  orders: OrderItem[];
};

type DoingSortMode = "appointment" | "distance" | "claim";
type NewSortMode = "distance" | "appointment" | "created";
type DoneSortMode = "updated" | "created" | "appointment" | "claim" | "distance";
const INITIAL_VISIBLE_COUNT = 200;
const LOAD_MORE_STEP = 100;

function actionText(actionType: string) {
  if (actionType === "CLAIM") return "领取";
  if (actionType === "APPEND") return "追加";
  if (actionType === "FINISH") return "完结";
  if (actionType === "END") return "结束";
  if (actionType === "RESCHEDULE") return "改约";
  if (actionType === "RETURN") return "退回";
  if (actionType === "CONVERT_PRECISE") return "转精准";
  return actionType;
}

function cleanRecordRemark(remark: string | null | undefined) {
  return String(remark ?? "").replace(/\s*\[CLAIM_TYPE:(?:PRECISE|SERVICE)\]\s*/g, "").trim();
}

function buildAmapNavUrl(item: OrderItem) {
  const name = item.title || `单据#${item.id}`;
  if (item.longitude != null && item.latitude != null) {
    return `https://uri.amap.com/navigation?to=${item.longitude},${item.latitude},${encodeURIComponent(name)}&mode=car&policy=1&src=paidan&coordinate=gaode&callnative=1`;
  }
  const keyword = item.address || name;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&src=paidan&callnative=1`;
}

function customerTypeBadge(
  customerType: string,
  options?: {
    highlighted?: boolean;
    clickable?: boolean;
    onClick?: () => void;
  },
) {
  const text = (customerType || "").trim();
  if (!text) return null;
  const highlighted = Boolean(options?.highlighted);
  const clickable = Boolean(options?.clickable);
  const onClick = options?.onClick;
  if (text.includes("精准")) {
    const className = highlighted
      ? "inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-rose-500"
      : "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200";
    if (clickable) {
      return (
        <button type="button" onClick={onClick} className={`${className} transition active:scale-[0.98]`}>
          <span className={`h-1.5 w-1.5 rounded-full ${highlighted ? "bg-white" : "bg-emerald-500"}`} />
          <span>精准</span>
        </button>
      );
    }
    return (
      <span className={className}>
        <span className={`h-1.5 w-1.5 rounded-full ${highlighted ? "bg-white" : "bg-emerald-500"}`} />
        <span>精准</span>
      </span>
    );
  }
  if (text.includes("客服")) {
    const className = highlighted
      ? "inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-rose-500"
      : "inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200";
    if (clickable) {
      return (
        <button type="button" onClick={onClick} className={`${className} transition active:scale-[0.98]`}>
          <span className={`h-1.5 w-1.5 rounded-full ${highlighted ? "bg-white" : "bg-blue-500"}`} />
          <span>客服</span>
        </button>
      );
    }
    return (
      <span className={className}>
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        <span>客服</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      {text}
    </span>
  );
}

export function MobileOrdersPanel({
  tab,
  accessMode,
  regions,
  initialSelectedRegion,
  orders,
}: Props) {
  const router = useRouter();
  const isSupervisor = accessMode === "SUPERVISOR";
  const [selectedRegion, setSelectedRegion] = useState(initialSelectedRegion === "AUTO" ? "" : (initialSelectedRegion || ""));
  const [newCustomerType, setNewCustomerType] = useState<"" | "精准" | "客服">("");
  const [newTitleKeyword, setNewTitleKeyword] = useState("");
  const [newSortMode, setNewSortMode] = useState<NewSortMode>("distance");
  const [doingSortMode, setDoingSortMode] = useState<DoingSortMode>("appointment");
  const [doingKeyword, setDoingKeyword] = useState("");
  const [doneSortMode, setDoneSortMode] = useState<DoneSortMode>("updated");
  const [doneKeyword, setDoneKeyword] = useState("");
  const [finishOrderId, setFinishOrderId] = useState<number | null>(null);
  const [finishHandledPhoneMap, setFinishHandledPhoneMap] = useState<Record<number, string>>({});
  const [endOrderId, setEndOrderId] = useState<number | null>(null);
  const [endReasonMap, setEndReasonMap] = useState<Record<number, string>>({});
  const [rescheduleOrderId, setRescheduleOrderId] = useState<number | null>(null);
  const [rescheduleAtMap, setRescheduleAtMap] = useState<Record<number, string>>({});
  const [rescheduleAddressMap, setRescheduleAddressMap] = useState<Record<number, string>>({});
  const [convertOrderId, setConvertOrderId] = useState<number | null>(null);
  const [convertRemarkMap, setConvertRemarkMap] = useState<Record<number, string>>({});
  const [convertRegionMap, setConvertRegionMap] = useState<Record<number, string>>({});
  const [convertAddressMap, setConvertAddressMap] = useState<Record<number, string>>({});
  const [convertAtMap, setConvertAtMap] = useState<Record<number, string>>({});
  const [importantPendingMap, setImportantPendingMap] = useState<Record<number, boolean>>({});
  const [recordOpenOrderId, setRecordOpenOrderId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const nowLocal = new Date();
  const toLocalInput = (value: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  const minScheduleAt = toLocalInput(nowLocal);
  const maxRescheduleAt = toLocalInput(new Date(nowLocal.getTime() + 7 * 24 * 60 * 60 * 1000));
  const maxConvertAt = toLocalInput(new Date(nowLocal.getTime() + 15 * 24 * 60 * 60 * 1000));

  useEffect(() => {
    if (tab === "new") setNewSortMode("distance");
    if (tab === "doing") setDoingSortMode("appointment");
    if (tab === "done") setDoneSortMode("updated");
  }, [tab]);

  const visibleOrders = useMemo(() => {
    const toTs = (value: string | null) => {
      if (!value) return null;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? null : ts;
    };

    const regionKeyword = selectedRegion.trim().toLowerCase();
    const filtered = !regionKeyword
      ? [...orders]
      : orders.filter((item) => {
      const region = (item.region || "").toLowerCase();
      const address = (item.address || "").toLowerCase();
      return region.includes(regionKeyword) || address.includes(regionKeyword);
    });

    if (tab === "new") {
      const typed =
        newCustomerType === ""
          ? filtered
          : filtered.filter((item) => {
              const text = String(item.customerType || "");
              return newCustomerType === "精准" ? text.includes("精准") : text.includes("客服");
            });
      const titleKeyword = newTitleKeyword.trim().toLowerCase();
      const typedAndNamed = !titleKeyword
        ? typed
        : typed.filter((item) => {
            const title = String(item.title || "").toLowerCase();
            const region = String(item.region || "").toLowerCase();
            const address = String(item.address || "").toLowerCase();
            return title.includes(titleKeyword) || region.includes(titleKeyword) || address.includes(titleKeyword);
          });

      return typedAndNamed.sort((a, b) => {
        if (newSortMode === "distance") {
          if (a.distanceKm == null && b.distanceKm == null) return 0;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        }
        if (newSortMode === "appointment") {
          const at = toTs(a.appointmentAt);
          const bt = toTs(b.appointmentAt);
          if (at != null && bt != null) return at - bt;
          if (at != null && bt == null) return -1;
          if (at == null && bt != null) return 1;
          return (toTs(b.createdAt) ?? 0) - (toTs(a.createdAt) ?? 0);
        }
        return (toTs(b.createdAt) ?? 0) - (toTs(a.createdAt) ?? 0);
      });
    }

    if (tab === "doing") {
      const keyword = doingKeyword.trim().toLowerCase();
      const doingFiltered = !keyword
        ? filtered
        : filtered.filter((item) => {
            const phone = String(item.phone || "").toLowerCase();
            const remark = String(item.remark || "").toLowerCase();
            return phone.includes(keyword) || remark.includes(keyword);
          });

      return doingFiltered.sort((a, b) => {
        if (doingSortMode === "distance") {
          if (a.distanceKm == null && b.distanceKm == null) return 0;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        }
        if (doingSortMode === "claim") {
          return (toTs(b.claimedAt) ?? 0) - (toTs(a.claimedAt) ?? 0);
        }
        const aAppointment = toTs(a.appointmentAt);
        const bAppointment = toTs(b.appointmentAt);
        if (aAppointment != null && bAppointment != null) return aAppointment - bAppointment;
        if (aAppointment != null && bAppointment == null) return -1;
        if (aAppointment == null && bAppointment != null) return 1;
        return (toTs(b.claimedAt) ?? 0) - (toTs(a.claimedAt) ?? 0);
      });
    }

    const doneSearchKeyword = doneKeyword.trim().toLowerCase();
    const doneFiltered = !doneSearchKeyword
      ? filtered
      : filtered.filter((item) => {
          const phone = String(item.phone || "").toLowerCase();
          const remark = String(item.remark || "").toLowerCase();
          return phone.includes(doneSearchKeyword) || remark.includes(doneSearchKeyword);
        });

    return doneFiltered.sort((a, b) => {
      if (doneSortMode === "updated") {
        return (toTs(b.updatedAt) ?? 0) - (toTs(a.updatedAt) ?? 0);
      }
      if (doneSortMode === "distance") {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      if (doneSortMode === "appointment") {
        const at = toTs(a.appointmentAt);
        const bt = toTs(b.appointmentAt);
        if (at != null && bt != null) return at - bt;
        if (at != null && bt == null) return -1;
        if (at == null && bt != null) return 1;
      }
      if (doneSortMode === "claim") {
        return (toTs(b.claimedAt) ?? 0) - (toTs(a.claimedAt) ?? 0);
      }
      return (toTs(b.createdAt) ?? 0) - (toTs(a.createdAt) ?? 0);
    });
  }, [doingKeyword, doingSortMode, doneKeyword, doneSortMode, newCustomerType, newSortMode, newTitleKeyword, orders, selectedRegion, tab]);
  const pagedOrders = useMemo(
    () => visibleOrders.slice(0, Math.min(visibleOrders.length, visibleCount)),
    [visibleCount, visibleOrders],
  );
  const hasMoreOrders = pagedOrders.length < visibleOrders.length;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [tab, selectedRegion, newCustomerType, newTitleKeyword, newSortMode, doingSortMode, doingKeyword, doneSortMode, doneKeyword]);

  useEffect(() => {
    if (!hasMoreOrders || !loadMoreRef.current) return;
    const target = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + LOAD_MORE_STEP, visibleOrders.length));
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreOrders, visibleOrders.length]);

  return (
    <>
      <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-2">
          <select
            name="region"
            value={selectedRegion}
            onChange={(event) => {
              setSelectedRegion(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          >
            <option value="">全部区域</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedRegion("")}
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
          >
            清除
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={tab === "new" ? newSortMode : tab === "doing" ? doingSortMode : doneSortMode}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (tab === "new") setNewSortMode(value as NewSortMode);
              if (tab === "doing") setDoingSortMode(value as DoingSortMode);
              if (tab === "done") setDoneSortMode(value as DoneSortMode);
            }}
            className={tab === "new" ? "w-[56%] rounded-lg border border-slate-300 px-2 py-1.5 text-xs" : "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"}
          >
            {tab === "new" ? (
              <>
                <option value="distance">按距离</option>
                <option value="appointment">按约定时间</option>
                <option value="created">按创建时间</option>
              </>
            ) : null}
            {tab === "doing" ? (
              <>
                <option value="appointment">按约定时间（无约定按领取）</option>
                <option value="distance">按距离</option>
                <option value="claim">按领取时间</option>
              </>
            ) : null}
            {tab === "done" ? (
              <>
                <option value="updated">按更新时间</option>
                <option value="created">按创建时间</option>
                <option value="appointment">按约定时间</option>
                <option value="claim">按领取时间</option>
                <option value="distance">按距离</option>
              </>
            ) : null}
          </select>
          {tab === "new" ? (
            <select
              value={newCustomerType}
              onChange={(event) => setNewCustomerType(event.currentTarget.value as "" | "精准" | "客服")}
              className="w-[44%] rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">全部</option>
              <option value="精准">精准</option>
              <option value="客服">客服</option>
            </select>
          ) : null}
        </div>
        {tab === "new" ? (
          <div className="mt-2">
            <input
              value={newTitleKeyword}
              onChange={(event) => setNewTitleKeyword(event.currentTarget.value)}
              placeholder="套餐名/区域/地址搜索"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        ) : null}
        {tab === "doing" ? (
          <div className="mt-2">
            <input
              value={doingKeyword}
              onChange={(event) => setDoingKeyword(event.currentTarget.value)}
              placeholder="手机号/备注搜索"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        ) : null}
        {tab === "done" ? (
          <div className="mt-2">
            <input
              value={doneKeyword}
              onChange={(event) => setDoneKeyword(event.currentTarget.value)}
              placeholder="手机号/备注搜索"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {pagedOrders.map((item) => {
          const showFinishForm = tab === "doing" && finishOrderId === item.id;
          const showEndForm = tab === "doing" && endOrderId === item.id;
          const showRescheduleForm = tab === "doing" && rescheduleOrderId === item.id;
          const showConvertForm = tab === "doing" && isSupervisor && convertOrderId === item.id;
          const rescheduleAt = rescheduleAtMap[item.id] ?? "";
          const rescheduleAddress = rescheduleAddressMap[item.id] ?? item.address ?? "";
          const convertRemark = convertRemarkMap[item.id] ?? "";
          const convertRegion = convertRegionMap[item.id] ?? item.region ?? "";
          const convertAddress = convertAddressMap[item.id] ?? item.address ?? "";
          const convertAt = convertAtMap[item.id] ?? (item.appointmentAt ? item.appointmentAt.slice(0, 16) : "");
          const finishHandledPhone = finishHandledPhoneMap[item.id] ?? "";
          const endReason = endReasonMap[item.id] ?? "";
          return (
            <article key={item.id} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xl font-bold text-slate-900">{item.title || `单据#${item.id}`}</p>
                  {customerTypeBadge(item.customerType, {
                    highlighted: tab === "doing" && Boolean(item.isImportant),
                    clickable:
                      tab === "doing" &&
                      (String(item.customerType || "").includes("客服") ||
                        String(item.customerType || "").includes("精准")) &&
                      !importantPendingMap[item.id],
                    onClick:
                      tab === "doing" &&
                      (String(item.customerType || "").includes("客服") ||
                        String(item.customerType || "").includes("精准"))
                        ? async () => {
                            if (importantPendingMap[item.id]) return;
                            setImportantPendingMap((prev) => ({ ...prev, [item.id]: true }));
                            try {
                              await fetch("/api/orders/important", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  orderId: item.id,
                                  isImportant: !item.isImportant,
                                }),
                              });
                              router.refresh();
                            } finally {
                              setImportantPendingMap((prev) => ({ ...prev, [item.id]: false }));
                            }
                          }
                        : undefined,
                  })}
                </div>
                <p className="text-lg font-bold text-blue-600">{item.distanceKm != null ? `${item.distanceKm.toFixed(2)} km` : "-"}</p>
              </div>
              <a
                href={buildAmapNavUrl(item)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-blue-700 underline decoration-blue-300 underline-offset-2"
              >
                {item.address || "未填写地址"}
              </a>
              {tab === "doing" && item.remark ? (
                <p
                  className="mt-1 text-sm text-slate-600"
                  title={item.remark}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  备注：{item.remark}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-slate-500">创建人：{item.createdByName}</p>
              {tab === "new" ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">创建时间：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  <form action={claimDispatchOrder}>
                    <input type="hidden" name="orderId" value={item.id} />
                    <input type="hidden" name="region" value={selectedRegion} />
                    <FormSubmitButton
                      pendingText="领取中..."
                      className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      领取
                    </FormSubmitButton>
                  </form>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">创建时间：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                约定时间：{item.appointmentAt ? new Date(item.appointmentAt).toLocaleString("zh-CN") : "-"}
              </p>
              {tab !== "new" ? (
                <p className="mt-1 text-sm text-slate-500">
                  手机号：
                  {item.phone ? (
                    <a href={`tel:${item.phone}`} className="ml-1 text-blue-700 underline decoration-blue-300 underline-offset-2">
                      {item.phone}
                    </a>
                  ) : (
                    <span className="ml-1">-</span>
                  )}
                </p>
              ) : null}
              {tab !== "new" ? (
                <p className="mt-1 text-sm text-slate-500">
                  领取时间：{item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : "-"}
                </p>
              ) : null}
              {tab === "done" ? (
                <>
                  <p className="mt-1 text-sm text-slate-500">客户办理号码：{item.handledPhone || "-"}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    转精准：{item.convertedToPreciseAt ? `${item.convertedToPreciseByName || "-"} ${new Date(item.convertedToPreciseAt).toLocaleString("zh-CN")}` : "-"}
                  </p>
                </>
              ) : null}

              {tab === "doing" ? (
                <div className="mt-3 space-y-2">
                  <div className={`grid gap-2 ${isSupervisor ? "grid-cols-4" : "grid-cols-3"}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setFinishOrderId(showFinishForm ? null : item.id);
                        setEndOrderId(null);
                        setRescheduleOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showFinishForm ? "收起" : "已办理"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEndOrderId(showEndForm ? null : item.id);
                        setFinishOrderId(null);
                        setRescheduleOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showEndForm ? "收起" : "不办理"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const opening = !showRescheduleForm;
                        if (opening) {
                          setRescheduleAddressMap((prev) => {
                            if (prev[item.id] !== undefined) return prev;
                            return {
                              ...prev,
                              [item.id]: item.address ?? "",
                            };
                          });
                          setRescheduleAtMap((prev) => {
                            if (prev[item.id] !== undefined) return prev;
                            return {
                              ...prev,
                              [item.id]: item.appointmentAt ? item.appointmentAt.slice(0, 16) : "",
                            };
                          });
                        }
                        setRescheduleOrderId(opening ? item.id : null);
                        setFinishOrderId(null);
                        setEndOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showRescheduleForm ? "收起" : "改约"}
                    </button>

                    {isSupervisor ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConvertOrderId(showConvertForm ? null : item.id);
                          setEndOrderId(null);
                          setRescheduleOrderId(null);
                          setFinishOrderId(null);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {showConvertForm ? "收起" : "转精准"}
                      </button>
                    ) : null}
                  </div>

                  {showFinishForm ? (
                    <form
                      action={finishDispatchOrder}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                    >
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <input
                        name="handledPhone"
                        value={finishHandledPhone}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setFinishHandledPhoneMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        placeholder="客户办理号码（可选，11位手机号）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <textarea
                        name="remark"
                        placeholder="已办理备注（可选）"
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <FormSubmitButton
                        pendingText="提交中..."
                        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认已办理
                      </FormSubmitButton>
                    </form>
                  ) : null}

                  {showEndForm ? (
                    <form
                      action={endDispatchOrder}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                    >
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <select
                        name="notHandledReason"
                        required
                        value={endReason}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setEndReasonMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">请选择不办理原因</option>
                        <option value="无效客资">无效客资</option>
                        <option value="未见面">未见面</option>
                        <option value="已见面">已见面</option>
                      </select>
                      <textarea
                        name="remark"
                        required
                        placeholder="不办理备注（必填）"
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <FormSubmitButton
                        pendingText="提交中..."
                        className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认不办理
                      </FormSubmitButton>
                    </form>
                  ) : null}

                  {showRescheduleForm ? (
                    <form
                      action={rescheduleDispatchOrder}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                    >
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <input
                        name="scheduleAt"
                        type="datetime-local"
                        required
                        value={rescheduleAt}
                        min={minScheduleAt}
                        max={maxRescheduleAt}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setRescheduleAtMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="address"
                        value={rescheduleAddress}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setRescheduleAddressMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        placeholder="改约地址（可修改）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end">
                        <AmapPickerModal
                          iconOnly
                          initialAddress={rescheduleAddress}
                          initialLongitude={item.longitude ?? undefined}
                          initialLatitude={item.latitude ?? undefined}
                          onConfirm={(picked) =>
                            setRescheduleAddressMap((prev) => ({
                              ...prev,
                              [item.id]: picked.address,
                            }))
                          }
                        />
                      </div>
                      <textarea
                        name="remark"
                        placeholder="改约备注（可选）"
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <FormSubmitButton
                        pendingText="提交中..."
                        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        提交改约
                      </FormSubmitButton>
                    </form>
                  ) : null}

                  {showConvertForm ? (
                    <form action={convertDispatchOrderToPrecise} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <input
                        name="regionText"
                        value={convertRegion}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setConvertRegionMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        placeholder="区域（可修改）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="address"
                        value={convertAddress}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setConvertAddressMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        placeholder="地址（可修改）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end">
                        <AmapPickerModal
                          iconOnly
                          initialAddress={convertAddress}
                          initialLongitude={item.longitude ?? undefined}
                          initialLatitude={item.latitude ?? undefined}
                          onConfirm={(picked) =>
                            setConvertAddressMap((prev) => ({
                              ...prev,
                              [item.id]: picked.address,
                            }))
                          }
                        />
                      </div>
                      <input
                        name="appointmentAt"
                        type="datetime-local"
                        value={convertAt}
                        min={minScheduleAt}
                        max={maxConvertAt}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setConvertAtMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <textarea
                        name="remark"
                        value={convertRemark}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setConvertRemarkMap((prev) => ({
                            ...prev,
                            [item.id]: value,
                          }));
                        }}
                        placeholder="转精准备注（可选）"
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <FormSubmitButton
                        pendingText="提交中..."
                        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认转精准
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {tab !== "new" ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <button
                    type="button"
                    onClick={() => setRecordOpenOrderId(recordOpenOrderId === item.id ? null : item.id)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left"
                  >
                    <span className="text-xs font-semibold text-slate-600">流转记录（{item.records.length}）</span>
                    <span className="text-xs text-slate-500">{recordOpenOrderId === item.id ? "收起" : "展开"}</span>
                  </button>

                  {recordOpenOrderId === item.id ? (
                    item.records.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {item.records.map((record) => (
                          <li key={record.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-700">
                                {record.operator.displayName || record.operator.username} ·{" "}
                                {new Date(record.createdAt).toLocaleString("zh-CN")} · {actionText(record.actionType)}
                              </p>
                              <RecordTrackMapButton
                                orderTitle={item.title}
                                orderAddress={item.address}
                                orderLongitude={item.longitude}
                                orderLatitude={item.latitude}
                                operatorName={record.operator.displayName || record.operator.username}
                                operatorLongitude={record.operatorLongitude}
                                operatorLatitude={record.operatorLatitude}
                              />
                            </div>
                            {cleanRecordRemark(record.remark) ? (
                              <p className="mt-1 whitespace-pre-wrap text-slate-700">备注：{cleanRecordRemark(record.remark)}</p>
                            ) : null}
                            {record.photoUrl ? (
                              <a href={record.photoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                                <Image src={record.photoUrl} alt="记录照片" width={56} height={56} className="rounded object-cover" />
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">暂无流转记录</p>
                    )
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}

        {visibleOrders.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
            当前筛选下暂无单据
          </div>
        ) : null}
        {visibleOrders.length > 0 ? (
          <div className="pt-1 text-center text-xs text-slate-400">
            已显示 {pagedOrders.length} / {visibleOrders.length}
          </div>
        ) : null}
        {hasMoreOrders ? (
          <>
            <div ref={loadMoreRef} className="h-1 w-full" />
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(prev + LOAD_MORE_STEP, visibleOrders.length))}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-600"
            >
              加载更多
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
