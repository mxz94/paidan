"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UserLocation = {
  id: number;
  username: string;
  displayName: string;
  longitude: number | null;
  latitude: number | null;
};

type Props = {
  users: UserLocation[];
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

export function UserLocationsMapModal({ users = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const locatedUsers = useMemo(
    () => (users ?? []).filter((item) => item.longitude != null && item.latitude != null),
    [users],
  );

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!open || !mapContainerRef.current) return;
      setErrorText("");

      try {
        await loadAmapScript();
        if (canceled || !window.AMap || !mapContainerRef.current) return;

        const firstLocated = locatedUsers.at(0);
        const defaultCenter: [number, number] =
          firstLocated && firstLocated.longitude != null && firstLocated.latitude != null
            ? [firstLocated.longitude, firstLocated.latitude]
            : [112.453926, 34.619683];

        const map = new window.AMap.Map(mapContainerRef.current, {
          zoom: 11,
          center: defaultCenter,
        });
        mapRef.current = map;

        locatedUsers.forEach((user) => {
          if (user.longitude == null || user.latitude == null) return;

          const marker = new window.AMap.Marker({
            map,
            position: [user.longitude, user.latitude],
            title: `${user.displayName} (${user.username})`,
          });

          const infoWindow = new window.AMap.InfoWindow({
            content: `${user.displayName} (${user.username})<br/>${user.longitude.toFixed(6)}, ${user.latitude.toFixed(6)}`,
            offset: new window.AMap.Pixel(0, -28),
          });

          marker.on("click", () => infoWindow.open(map, marker.getPosition()));
        });

        if (locatedUsers.length > 0) {
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
  }, [locatedUsers, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        用户位置地图
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">所有用户位置</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                关闭
              </button>
            </div>

            {errorText ? (
              <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorText}</p>
            ) : null}

            <div ref={mapContainerRef} className="h-[480px] w-full rounded-xl border border-slate-200" />

            <p className="mt-2 text-xs text-slate-500">
              共 {users.length} 个用户，已定位 {locatedUsers.length} 个。
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
