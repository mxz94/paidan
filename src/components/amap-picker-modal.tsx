"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PickResult = {
  address: string;
  longitude: number;
  latitude: number;
};

type SuggestionItem = {
  name: string;
  address: string;
  location?: {
    lng: number;
    lat: number;
  };
};

type Props = {
  initialAddress: string;
  initialLongitude?: number;
  initialLatitude?: number;
  iconOnly?: boolean;
  onConfirm: (result: PickResult) => void;
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
      reject(new Error("缺少高德地图 Key 或安全密钥"));
      return;
    }

    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_JS_CODE,
    };

    const existed = document.getElementById("amap-jsapi");
    if (existed) {
      existed.addEventListener("load", () => resolve());
      existed.addEventListener("error", () => reject(new Error("地图脚本加载失败")));
      return;
    }

    const script = document.createElement("script");
    script.id = "amap-jsapi";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder,AMap.AutoComplete`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("地图脚本加载失败"));
    document.head.appendChild(script);
  });
}

export function AmapPickerModal({
  initialAddress,
  initialLongitude,
  initialLatitude,
  iconOnly,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [queryAddress, setQueryAddress] = useState(initialAddress || "");
  const [pickedAddress, setPickedAddress] = useState(initialAddress || "");
  const [pickedLng, setPickedLng] = useState<number | undefined>(initialLongitude);
  const [pickedLat, setPickedLat] = useState<number | undefined>(initialLatitude);
  const [errorText, setErrorText] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const autoCompleteRef = useRef<any>(null);

  const center = useMemo(() => {
    if (pickedLng != null && pickedLat != null) {
      return [pickedLng, pickedLat];
    }
    if (initialLongitude != null && initialLatitude != null) {
      return [initialLongitude, initialLatitude];
    }
    return [112.453926, 34.619683];
  }, [initialLatitude, initialLongitude, pickedLat, pickedLng]);

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!open || !mapContainerRef.current) return;

      setErrorText("");
      try {
        await loadAmapScript();
        if (canceled || !window.AMap || !mapContainerRef.current) return;

        const map = new window.AMap.Map(mapContainerRef.current, {
          zoom: 12,
          center,
        });
        mapRef.current = map;
        await new Promise<void>((resolve) => {
          window.AMap.plugin(["AMap.Geocoder", "AMap.AutoComplete"], () => resolve());
        });
        geocoderRef.current = new window.AMap.Geocoder({ city: "洛阳" });
        autoCompleteRef.current = new window.AMap.AutoComplete({ city: "洛阳", citylimit: true });

        if (pickedLng != null && pickedLat != null) {
          markerRef.current = new window.AMap.Marker({
            position: [pickedLng, pickedLat],
            map,
          });
        }

        map.on("click", (event: any) => {
          const lng = event.lnglat.getLng();
          const lat = event.lnglat.getLat();
          setPickedLng(lng);
          setPickedLat(lat);

          if (!markerRef.current) {
            markerRef.current = new window.AMap.Marker({ map });
          }
          markerRef.current.setPosition([lng, lat]);

          if (!geocoderRef.current) return;
          geocoderRef.current.getAddress([lng, lat], (status: string, result: any) => {
            if (status === "complete" && result?.regeocode?.formattedAddress) {
              const address = result.regeocode.formattedAddress;
              setPickedAddress(address);
              setQueryAddress(address);
            }
          });
        });
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
      markerRef.current = null;
      geocoderRef.current = null;
      autoCompleteRef.current = null;
    };
  }, [center, open, pickedLat, pickedLng]);

  useEffect(() => {
    if (!open) return;
    setQueryAddress(initialAddress || "");
    setPickedAddress(initialAddress || "");
    setPickedLng(initialLongitude);
    setPickedLat(initialLatitude);
    setSuggestions([]);
  }, [initialAddress, initialLatitude, initialLongitude, open]);

  const applyPickedPoint = (lng: number, lat: number, address: string) => {
    setPickedLng(lng);
    setPickedLat(lat);
    setPickedAddress(address);
    setQueryAddress(address);
    setSuggestions([]);

    if (!markerRef.current && mapRef.current) {
      markerRef.current = new window.AMap.Marker({ map: mapRef.current });
    }
    if (markerRef.current) {
      markerRef.current.setPosition([lng, lat]);
    }
    if (mapRef.current) {
      mapRef.current.setCenter([lng, lat]);
      mapRef.current.setZoom(16);
    }
  };

  const fetchSuggestions = (keyword: string) => {
    if (!autoCompleteRef.current) return;
    const input = keyword.trim();
    if (!input) {
      setSuggestions([]);
      return;
    }
    autoCompleteRef.current.search(input, (status: string, result: any) => {
      if (status !== "complete" || !result?.tips?.length) {
        setSuggestions([]);
        return;
      }
      const next = result.tips
        .filter((tip: any) => tip?.name)
        .slice(0, 8)
        .map((tip: any) => ({
          name: String(tip.name ?? ""),
          address: String(tip.district ?? "") + String(tip.address ?? ""),
          location: tip.location
            ? {
                lng: Number(tip.location.lng),
                lat: Number(tip.location.lat),
              }
            : undefined,
        }));
      setSuggestions(next);
    });
  };

  const selectSuggestion = (tip: SuggestionItem) => {
    const keyword = `${tip.name}${tip.address}`.trim();
    if (tip.location && Number.isFinite(tip.location.lng) && Number.isFinite(tip.location.lat)) {
      applyPickedPoint(tip.location.lng, tip.location.lat, keyword || tip.name);
      return;
    }
    if (!geocoderRef.current) return;
    geocoderRef.current.getLocation(keyword || tip.name, (status: string, result: any) => {
      if (status !== "complete" || !result?.geocodes?.length) {
        setErrorText("该提示项未能定位，请尝试其他地址");
        return;
      }
      const geocode = result.geocodes[0];
      applyPickedPoint(Number(geocode.location.lng), Number(geocode.location.lat), geocode.formattedAddress || keyword);
    });
  };

  const searchAddress = () => {
    if (!queryAddress.trim()) {
      setErrorText("请输入地址后再搜索");
      return;
    }
    if (!geocoderRef.current || !mapRef.current) {
      setErrorText("地图尚未就绪，请稍后重试");
      return;
    }

    setErrorText("");
    setSuggestions([]);
    geocoderRef.current.getLocation(queryAddress.trim(), (status: string, result: any) => {
      if (status !== "complete" || !result?.geocodes?.length) {
        setErrorText("未找到该地址，请尝试更详细地址");
        return;
      }
      const geocode = result.geocodes[0];
      applyPickedPoint(
        Number(geocode.location.lng),
        Number(geocode.location.lat),
        geocode.formattedAddress || queryAddress.trim(),
      );
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          iconOnly
            ? "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            : "rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        }
        title="地图选点"
        aria-label="地图选点"
      >
        {iconOnly ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
            <path d="M9 3v15" />
            <path d="M15 6v15" />
          </svg>
        ) : (
          "地图选点"
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">地图选点（高德）</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <div className="mb-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={queryAddress}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setQueryAddress(next);
                    setErrorText("");
                    fetchSuggestions(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchAddress();
                    }
                  }}
                  placeholder="输入地址后搜索，例如：洛阳市西工区王城大道"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                {suggestions.length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {suggestions.map((tip, index) => (
                      <button
                        key={`${tip.name}-${tip.address}-${index}`}
                        type="button"
                        onClick={() => selectSuggestion(tip)}
                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-b-0 hover:bg-slate-50"
                      >
                        <p className="font-semibold text-slate-800">{tip.name}</p>
                        <p className="mt-0.5 text-slate-500">{tip.address || "无详细地址"}</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={searchAddress}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                搜索
              </button>
            </div>

            {errorText ? (
              <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorText}</p>
            ) : null}

            <div ref={mapContainerRef} className="h-[360px] w-full rounded-xl border border-slate-200" />

            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>地址：{pickedAddress || "未选择"}</p>
              <p>
                坐标：{pickedLng != null && pickedLat != null ? `${pickedLng.toFixed(6)}, ${pickedLat.toFixed(6)}` : "未选择"}
              </p>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pickedLng == null || pickedLat == null) {
                    setErrorText("请先搜索地址或点击地图选择坐标");
                    return;
                  }
                  onConfirm({
                    address: pickedAddress || queryAddress.trim(),
                    longitude: pickedLng,
                    latitude: pickedLat,
                  });
                  setOpen(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                使用该位置
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
