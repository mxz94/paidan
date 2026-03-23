"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  appendDispatchOrderRecord,
  claimDispatchOrder,
  convertDispatchOrderToPrecise,
  endDispatchOrder,
  finishDispatchOrder,
  rescheduleDispatchOrder,
} from "@/app/mobile/actions";
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
  claimedAt: string | null;
  convertedToPreciseAt: string | null;
  convertedToPreciseByName: string;
  createdByName: string;
  distanceKm: number | null;
  records: RecordItem[];
};

type Props = {
  tab: string;
  regions: string[];
  initialSelectedRegion: string;
  orders: OrderItem[];
};

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
  regions,
  initialSelectedRegion,
  orders,
}: Props) {
  const [selectedRegion, setSelectedRegion] = useState(initialSelectedRegion === "AUTO" ? "" : (initialSelectedRegion || ""));
  const [appendOrderId, setAppendOrderId] = useState<number | null>(null);
  const [finishOrderId, setFinishOrderId] = useState<number | null>(null);
  const [finishHandledPhoneMap, setFinishHandledPhoneMap] = useState<Record<number, string>>({});
  const [finishConvertPreciseMap, setFinishConvertPreciseMap] = useState<Record<number, boolean>>({});
  const [rescheduleOrderId, setRescheduleOrderId] = useState<number | null>(null);
  const [rescheduleAtMap, setRescheduleAtMap] = useState<Record<number, string>>({});
  const [convertOrderId, setConvertOrderId] = useState<number | null>(null);
  const [convertRemarkMap, setConvertRemarkMap] = useState<Record<number, string>>({});
  const [convertRegionMap, setConvertRegionMap] = useState<Record<number, string>>({});
  const [convertAddressMap, setConvertAddressMap] = useState<Record<number, string>>({});
  const [convertAtMap, setConvertAtMap] = useState<Record<number, string>>({});
  const [recordOpenOrderId, setRecordOpenOrderId] = useState<number | null>(null);

  const visibleOrders = useMemo(() => {
    const keyword = selectedRegion.trim().toLowerCase();
    if (!keyword) {
      return orders;
    }
    return orders.filter((item) => {
      const region = (item.region || "").toLowerCase();
      const address = (item.address || "").toLowerCase();
      return region.includes(keyword) || address.includes(keyword);
    });
  }, [orders, selectedRegion]);

  return (
    <>
      <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
        <input
          list="mobile-region-options"
          name="region"
          value={selectedRegion}
          onChange={(event) => {
            setSelectedRegion(event.currentTarget.value);
            setAppendOrderId(null);
          }}
          placeholder="区域/地址模糊搜索（默认按距离）"
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
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
          const showAppendForm = tab === "doing" && appendOrderId === item.id;
          const showFinishForm = tab === "doing" && finishOrderId === item.id;
          const showRescheduleForm = tab === "doing" && rescheduleOrderId === item.id;
          const showConvertForm = tab === "doing" && convertOrderId === item.id;
          const rescheduleAt = rescheduleAtMap[item.id] ?? "";
          const convertRemark = convertRemarkMap[item.id] ?? "";
          const convertRegion = convertRegionMap[item.id] ?? item.region ?? "";
          const convertAddress = convertAddressMap[item.id] ?? item.address ?? "";
          const convertAt = convertAtMap[item.id] ?? (item.appointmentAt ? item.appointmentAt.slice(0, 16) : "");
          const finishHandledPhone = finishHandledPhoneMap[item.id] ?? "";
          const finishConvertPrecise = finishConvertPreciseMap[item.id] ?? false;
          const calendarHref = rescheduleAt ? `/api/calendar/order/${item.id}?at=${encodeURIComponent(rescheduleAt)}` : "#";
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
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFinishOrderId(showFinishForm ? null : item.id);
                        setAppendOrderId(null);
                        setRescheduleOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showFinishForm ? "收起" : "完结"}
                    </button>

                    <form action={endDispatchOrder}>
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                      >
                        结束
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => {
                        setAppendOrderId(showAppendForm ? null : item.id);
                        setRescheduleOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showAppendForm ? "收起" : "追加记录"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRescheduleOrderId(showRescheduleForm ? null : item.id);
                        setAppendOrderId(null);
                        setConvertOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showRescheduleForm ? "收起" : "改约"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConvertOrderId(showConvertForm ? null : item.id);
                        setAppendOrderId(null);
                        setRescheduleOrderId(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {showConvertForm ? "收起" : "转精准"}
                    </button>
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
                        onChange={(event) =>
                          setFinishHandledPhoneMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
                        required
                        placeholder="客户办理号码（11位）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          name="convertToPrecise"
                          value="1"
                          checked={finishConvertPrecise}
                          onChange={(event) =>
                            setFinishConvertPreciseMap((prev) => ({
                              ...prev,
                              [item.id]: event.currentTarget.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        转精准
                      </label>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        确认完结
                      </button>
                    </form>
                  ) : null}

                  {showAppendForm ? (
                    <form
                      action={appendDispatchOrderRecord}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                    >
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <textarea
                        name="remark"
                        placeholder="追加备注（可选）"
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="file"
                        name="photo"
                        accept="image/*"
                        className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        提交追加记录
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
                        onChange={(event) =>
                          setRescheduleAtMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
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
                      <a
                        href={calendarHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          if (!rescheduleAt) {
                            event.preventDefault();
                          }
                        }}
                        className={`block w-full rounded-lg border px-3 py-2 text-center text-sm font-semibold ${
                          rescheduleAt
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        }`}
                      >
                        加入日历提醒
                      </a>
                    </form>
                  ) : null}

                  {showConvertForm ? (
                    <form action={convertDispatchOrderToPrecise} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <input type="hidden" name="orderId" value={item.id} />
                      <input type="hidden" name="region" value={selectedRegion} />
                      <input
                        name="regionText"
                        value={convertRegion}
                        onChange={(event) =>
                          setConvertRegionMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
                        placeholder="区域（可修改）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="address"
                        value={convertAddress}
                        onChange={(event) =>
                          setConvertAddressMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
                        placeholder="地址（可修改）"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="appointmentAt"
                        type="datetime-local"
                        value={convertAt}
                        onChange={(event) =>
                          setConvertAtMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <textarea
                        name="remark"
                        value={convertRemark}
                        onChange={(event) =>
                          setConvertRemarkMap((prev) => ({
                            ...prev,
                            [item.id]: event.currentTarget.value,
                          }))
                        }
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
