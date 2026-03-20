"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type OrderPoint = {
  id: number;
  title: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
};

type Props = {
  myLongitude: number | null;
  myLatitude: number | null;
  orders: OrderPoint[];
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

function shortName(title: string, fallback: string) {
  const text = (title || "").trim() || fallback;
  return text.length > 8 ? `${text.slice(0, 8)}…` : text;
}

export function MobileOrdersMapModal({ myLongitude, myLatitude, orders }: Props) {
  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const validOrders = useMemo(() => orders.filter((item) => item.longitude != null && item.latitude != null), [orders]);

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!open || !mapContainerRef.current) return;
      setErrorText("");
      try {
        await loadAmapScript();
        if (canceled || !window.AMap || !mapContainerRef.current) return;

        const defaultCenter =
          myLongitude != null && myLatitude != null
            ? [myLongitude, myLatitude]
            : validOrders.length > 0
              ? [validOrders[0].longitude, validOrders[0].latitude]
              : [112.453926, 34.619683];

        const map = new window.AMap.Map(mapContainerRef.current, {
          zoom: 12,
          center: defaultCenter,
        });
        mapRef.current = map;

        const points: any[] = [];

        if (myLongitude != null && myLatitude != null) {
          const myMarker = new window.AMap.Marker({
            map,
            position: [myLongitude, myLatitude],
            title: "我的位置",
            label: { content: "我", direction: "top" },
          });
          points.push(myMarker.getPosition());
        }

        validOrders.forEach((item) => {
          const fallback = `单据#${item.id}`;
          const marker = new window.AMap.Marker({
            map,
            position: [item.longitude, item.latitude],
            title: item.title || fallback,
            label: { content: shortName(item.title, fallback), direction: "top" },
          });
          const info = `${item.title || fallback}<br/>${item.address || "未填写地址"}`;
          marker.on("click", () => {
            const infoWindow = new window.AMap.InfoWindow({ content: info, offset: new window.AMap.Pixel(0, -28) });
            infoWindow.open(map, marker.getPosition());
          });
          points.push(marker.getPosition());
        });

        if (points.length > 0) {
          map.setFitView(undefined, false, [40, 40, 40, 40]);
        }
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "地图初始化失败");
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
  }, [myLatitude, myLongitude, open, validOrders]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-7 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700"
      >
        地图
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">位置地图</h3>
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
            <p className="mt-2 text-xs text-slate-500">
              当前筛选单据：{orders.length} 条，可定位单据：{validOrders.length} 条
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
