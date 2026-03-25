"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  claimDispatchOrder,
  convertDispatchOrderToPrecise,
  endDispatchOrder,
  finishDispatchOrder,
  rescheduleDispatchOrder,
} from "@/app/mobile/actions";
import { AmapPickerModal } from "@/components/amap-picker-modal";
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
  address: string;
  region: string;
  customerType: string;
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

function buildAmapNavUrl(item: OrderItem) {
  const name = item.title || `单据#${item.id}`;
  if (item.longitude != null && item.latitude != null) {
    return `https://uri.amap.com/navigation?to=${item.longitude},${item.latitude},${encodeURIComponent(name)}&mode=car&policy=1&src=paidan&coordinate=gaode&callnative=1`;
  }
  const keyword = item.address || name;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&src=paidan&callnative=1`;
}

function customerTypeBadge(customerType: string) {
  const text = (customerType || "").trim();
  if (!text) return null;
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

export function MobileOrdersPanel({
  tab,
  accessMode,
  regions,
  initialSelectedRegion,
  orders,
}: Props) {
  const isSupervisor = accessMode === "SUPERVISOR";
  const [selectedRegion, setSelectedRegion] = useState(initialSelectedRegion === "AUTO" ? "" : (initialSelectedRegion || ""));
  const [newCustomerType, setNewCustomerType] = useState<"" | "精准" | "客服">("");
  const [newTitleKeyword, setNewTitleKeyword] = useState("");
  const [newSortMode, setNewSortMode] = useState<NewSortMode>("distance");
  const [doingSortMode, setDoingSortMode] = useState<DoingSortMode>("appointment");
  const [doneSortMode, setDoneSortMode] = useState<DoneSortMode>("updated");
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
  const [recordOpenOrderId, setRecordOpenOrderId] = useState<number | null>(null);
  const nowLocal = new Date();
  const toLocalInput = (value: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  const minScheduleAt = toLocalInput(nowLocal);
  const maxScheduleAt = toLocalInput(new Date(nowLocal.getTime() + 15 * 24 * 60 * 60 * 1000));

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

    const keyword = selectedRegion.trim().toLowerCase();
    const filtered = !keyword
      ? [...orders]
      : orders.filter((item) => {
      const region = (item.region || "").toLowerCase();
      const address = (item.address || "").toLowerCase();
      return region.includes(keyword) || address.includes(keyword);
    });

    if (tab === "new") {
      const typed =
        newCustomerType === ""
          ? filtered
          : filtered.filter((item) => {
              const text = String(item.customerType || "");
              return newCustomerType === "精准" ? text.includes("精准") : text.includes("客服") || text.includes("客户");
            });
      const titleKeyword = newTitleKeyword.trim().toLowerCase();
      const typedAndNamed = !titleKeyword
        ? typed
        : typed.filter((item) => String(item.title || "").toLowerCase().includes(titleKeyword));

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
      return filtered.sort((a, b) => {
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

    return filtered.sort((a, b) => {
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
  }, [doingSortMode, doneSortMode, newCustomerType, newSortMode, newTitleKeyword, orders, selectedRegion, tab]);

  return (
    <>
      <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-2">
          <input
            list="mobile-region-options"
            name="region"
            value={selectedRegion}
            onChange={(event) => {
              setSelectedRegion(event.currentTarget.value);
            }}
            placeholder="区域筛选（可搜索）"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <select
            value={tab === "new" ? newSortMode : tab === "doing" ? doingSortMode : doneSortMode}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (tab === "new") setNewSortMode(value as NewSortMode);
              if (tab === "doing") setDoingSortMode(value as DoingSortMode);
              if (tab === "done") setDoneSortMode(value as DoneSortMode);
            }}
            className="w-[42%] rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
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
              className="w-[24%] rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">全部</option>
              <option value="精准">精准</option>
              <option value="客服">客服</option>
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => setSelectedRegion("")}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
          >
            清除
          </button>
        </div>
        {tab === "new" ? (
          <div className="mt-2">
            <input
              value={newTitleKeyword}
              onChange={(event) => setNewTitleKeyword(event.currentTarget.value)}
              placeholder="套餐名筛选（标题）"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        ) : null}
        <datalist id="mobile-region-options">
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </datalist>
      </div>

      <div className="space-y-3">
        {visibleOrders.map((item) => {
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
                  {customerTypeBadge(item.customerType)}
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
              <p className="mt-1 text-sm text-slate-500">创建人：{item.createdByName}</p>
              {tab === "new" ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-500">创建时间：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  <form action={claimDispatchOrder}>
                    <input type="hidden" name="orderId" value={item.id} />
                    <input type="hidden" name="region" value={selectedRegion} />
                    <button
                      type="submit"
                      className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 active:scale-[0.98]"
                    >
                      领取
                    </button>
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
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        确认已办理
                      </button>
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
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white"
                      >
                        确认不办理
                      </button>
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
                        max={maxScheduleAt}
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
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        提交改约
                      </button>
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
                        max={maxScheduleAt}
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
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        确认转精准
                      </button>
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
                            {record.remark ? <p className="mt-1 whitespace-pre-wrap text-slate-700">备注：{record.remark}</p> : null}
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
      </div>
    </>
  );
}
