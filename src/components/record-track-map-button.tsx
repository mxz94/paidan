"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  orderTitle: string;
  orderAddress: string;
  orderLongitude: number | null;
  orderLatitude: number | null;
  operatorName: string;
  operatorLongitude: number | null;
  operatorLatitude: number | null;
};

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
  }
}

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY ?? "";
const AMAP_SECURITY_JS_CODE = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE ?? "";

function loadAmapScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("仅支持浏览器环境"));
      return;
    }
    if (window.AMap) {
      resolve();
      return;
    }
    if (!AMAP_KEY || !AMAP_SECURITY_JS_CODE) {
      reject(new Error("缺少高德地图配置"));
      return;
    }

    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_JS_CODE };
    const existed = document.getElementById("amap-jsapi");
    if (existed) {
      existed.addEventListener("load", () => resolve());
      existed.addEventListener("error", () => reject(new Error("地图脚本加载失败")));
      return;
    }

    const script = document.createElement("script");
    script.id = "amap-jsapi";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("地图脚本加载失败"));
    document.head.appendChild(script);
  });
}

export function RecordTrackMapButton({
  orderTitle,
  orderAddress,
  orderLongitude,
  orderLatitude,
  operatorName,
  operatorLongitude,
  operatorLatitude,
}: Props) {
  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const hasOrderPoint = orderLongitude != null && orderLatitude != null;
  const hasOperatorPoint = operatorLongitude != null && operatorLatitude != null;
  const canShow = hasOrderPoint || hasOperatorPoint;

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!open || !canShow || !mapContainerRef.current) return;
      setErrorText("");

      try {
        await loadAmapScript();
        if (canceled || !window.AMap || !mapContainerRef.current) return;

        const center = hasOperatorPoint
          ? [operatorLongitude, operatorLatitude]
          : hasOrderPoint
            ? [orderLongitude, orderLatitude]
            : [112.453926, 34.619683];

        const map = new window.AMap.Map(mapContainerRef.current, {
          zoom: 14,
          center,
        });
        mapRef.current = map;
        const points: any[] = [];

        if (hasOrderPoint) {
          const orderMarker = new window.AMap.Marker({
            map,
            position: [orderLongitude, orderLatitude],
            title: orderTitle || "单据位置",
            label: { content: "单", direction: "top" },
          });
          points.push(orderMarker.getPosition());
          orderMarker.on("click", () => {
            const info = new window.AMap.InfoWindow({
              content: `${orderTitle || "单据"}<br/>${orderAddress || "未填写地址"}`,
              offset: new window.AMap.Pixel(0, -28),
            });
            info.open(map, orderMarker.getPosition());
          });
        }

        if (hasOperatorPoint) {
          const operatorMarker = new window.AMap.Marker({
            map,
            position: [operatorLongitude, operatorLatitude],
            title: `${operatorName}（操作时位置）`,
            label: { content: "人", direction: "top" },
          });
          points.push(operatorMarker.getPosition());
          operatorMarker.on("click", () => {
            const info = new window.AMap.InfoWindow({
              content: `${operatorName}（操作时位置）<br/>${operatorLongitude!.toFixed(6)}, ${operatorLatitude!.toFixed(6)}`,
              offset: new window.AMap.Pixel(0, -28),
            });
            info.open(map, operatorMarker.getPosition());
          });
        }

        if (points.length > 0) {
          map.setFitView(undefined, false, [40, 40, 40, 40]);
        }
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "地图加载失败");
      }
    }

    initMap();
    return () => {
      canceled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [
    canShow,
    hasOperatorPoint,
    hasOrderPoint,
    open,
    operatorLatitude,
    operatorLongitude,
    operatorName,
    orderAddress,
    orderLatitude,
    orderLongitude,
    orderTitle,
  ]);

  return (
    <>
      <button
        type="button"
        disabled={!canShow}
        onClick={() => setOpen(true)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        title={canShow ? "查看轨迹位置" : "无位置数据"}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s6-5.4 6-10a6 6 0 10-12 0c0 4.6 6 10 6 10z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">单据与操作人位置</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                关闭
              </button>
            </div>
            {errorText ? <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorText}</p> : null}
            <div ref={mapContainerRef} className="h-[420px] w-full rounded-xl border border-slate-200" />
          </div>
        </div>
      ) : null}
    </>
  );
}
