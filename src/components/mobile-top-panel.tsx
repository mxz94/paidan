"use client";

import { useEffect, useState } from "react";
import { MobileGpsSyncButton } from "@/components/mobile-gps-sync-button";
import { MobileOrdersMapModal } from "@/components/mobile-orders-map-modal";

type MapOrder = {
  id: number;
  title: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
};

type Props = {
  displayName: string;
  latitude: number | null;
  longitude: number | null;
  orders: MapOrder[];
  claimed?: string;
  opText?: string;
  opClassName?: string;
};

const STORAGE_KEY = "mobile_top_panel_expanded";

export function MobileTopPanel({
  displayName,
  latitude,
  longitude,
  orders,
  claimed,
  opText,
  opClassName,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      setExpanded(cached !== "0");
    } finally {
      setReady(true);
    }
  }, []);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  return (
    <div className="relative rounded-2xl bg-white p-4 pb-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">派单大厅</h1>
      </div>

      {ready && expanded ? (
        <>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">当前用户：{displayName}</p>
              <p className="mt-1 text-sm text-slate-500">当前位置</p>
              <p className="text-base font-semibold text-slate-800">
                {latitude != null && longitude != null ? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}` : "未获取定位"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <MobileGpsSyncButton />
              <MobileOrdersMapModal myLongitude={longitude} myLatitude={latitude} orders={orders} />
            </div>
          </div>

        </>
      ) : null}

      {claimed === "1" ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">抢单成功</p>
      ) : null}
      {claimed === "0" ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">该单据已被他人领取</p>
      ) : null}
      {opText ? <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${opClassName ?? ""}`}>{opText}</p> : null}

      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? "折叠顶部信息" : "展开顶部信息"}
        className="absolute bottom-0 left-1/2 inline-flex h-5 w-10 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-[12px] font-bold text-slate-600 shadow-sm"
      >
        {expanded ? "˅" : "˄"}
      </button>
    </div>
  );
}
