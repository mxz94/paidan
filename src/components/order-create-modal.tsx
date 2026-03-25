"use client";

import { useEffect, useMemo, useState } from "react";
import { AmapPickerModal } from "@/components/amap-picker-modal";
import { composeRegionValue, getLuoyangTowns, type LuoyangRegionNode } from "@/lib/regions";

type PackageOption = {
  id: number;
  name: string;
  code: string;
  isDefault?: boolean;
};

type Props = {
  packages: PackageOption[];
  customerTypes: string[];
  regionTree: LuoyangRegionNode[];
  currentAccessMode: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function OrderCreateModal({ packages, customerTypes, regionTree, currentAccessMode, action }: Props) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");
  const [district, setDistrict] = useState("");
  const [town, setTown] = useState("");
  const [addressTips, setAddressTips] = useState<Array<{ name: string; address: string; longitude?: number; latitude?: number }>>([]);
  const [showAddressTips, setShowAddressTips] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const isServiceUser = currentAccessMode === "SERVICE";
  const towns = getLuoyangTowns(district);
  const regionValue = composeRegionValue(district, town);
  const amapWebKey = process.env.NEXT_PUBLIC_AMAP_KEY ?? "";
  const nowLocal = new Date();
  const toLocalInput = (value: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  const minAppointmentAt = toLocalInput(nowLocal);
  const maxAppointmentAt = toLocalInput(new Date(nowLocal.getTime() + 15 * 24 * 60 * 60 * 1000));
  const addressSearchSeed = useMemo(() => {
    const prefix = regionValue.trim();
    const addr = address.trim();
    if (prefix && addr) return `${prefix} ${addr}`;
    return prefix || addr;
  }, [address, regionValue]);

  useEffect(() => {
    const keyword = addressSearchSeed.trim();
    if (!keyword || !amapWebKey) {
      setAddressTips([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          key: amapWebKey,
          keywords: keyword,
          city: "洛阳",
          citylimit: "true",
          datatype: "all",
        });
        const resp = await fetch(`https://restapi.amap.com/v3/assistant/inputtips?${query.toString()}`, {
          cache: "no-store",
        });
        if (!resp.ok) {
          setAddressTips([]);
          return;
        }
        const json = (await resp.json()) as {
          status?: string;
          tips?: Array<{ name?: string; district?: string; address?: string; location?: string }>;
        };
        if (json.status !== "1" || !json.tips?.length) {
          setAddressTips([]);
          return;
        }
        const tips = json.tips
          .filter((tip) => (tip.name || "").trim())
          .slice(0, 8)
          .map((tip) => {
            const locationText = String(tip.location ?? "");
            const [lngText, latText] = locationText.split(",");
            const lng = Number(lngText);
            const lat = Number(latText);
            return {
              name: String(tip.name ?? "").trim(),
              address: `${String(tip.district ?? "").trim()}${String(tip.address ?? "").trim()}`.trim(),
              longitude: Number.isFinite(lng) ? lng : undefined,
              latitude: Number.isFinite(lat) ? lat : undefined,
            };
          });
        setAddressTips(tips);
      } catch {
        setAddressTips([]);
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [addressSearchSeed, amapWebKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        新增单据
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">新增单据</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form
              action={action}
              className="grid gap-4"
              onSubmit={(event) => {
                const data = new FormData(event.currentTarget);
                const title = String(data.get("title") ?? "").trim();
                const region = String(data.get("region") ?? "").trim();
                const addr = String(data.get("address") ?? "").trim();
                const phone = String(data.get("phone") ?? "").trim();
                const customerType = isServiceUser ? "客服" : String(data.get("customerType") ?? "").trim();

                if (!title || !region || !addr || !customerType || !phone) {
                  event.preventDefault();
                  setSubmitError("请先完善必填项：标题、区域、地址、手机号、客户类型。");
                  return;
                }
                setSubmitError("");
              }}
            >
              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">
                  标题 <span className="text-rose-500">*</span>
                </span>
                <div>
                  <select
                    name="title"
                    required
                    defaultValue=""
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">请选择套餐</option>
                    {packages.map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">标题由套餐名称自动带出。</p>
                </div>
              </label>

              <input type="hidden" name="region" value={regionValue} />
              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-start">
                <span className="text-sm font-medium text-slate-700">
                  区域 <span className="text-rose-500">*</span>
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    required
                    value={district}
                    onChange={(event) => {
                      setDistrict(event.currentTarget.value);
                      setTown("");
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">请选择区/县</option>
                    {regionTree.map((item) => (
                      <option key={item.district} value={item.district}>
                        {item.district}
                      </option>
                    ))}
                  </select>
                  <select
                    value={town}
                    onChange={(event) => setTown(event.currentTarget.value)}
                    disabled={!district}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">请选择镇/街道（可选）</option>
                    {towns.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">
                  地址 <span className="text-rose-500">*</span>
                </span>
                <div className="relative flex items-center gap-2">
                  <div className="relative w-full">
                  <input
                    name="address"
                      value={address}
                      onChange={(event) => {
                        setAddress(event.currentTarget.value);
                        setShowAddressTips(true);
                      }}
                      onFocus={() => setShowAddressTips(true)}
                      onBlur={() => {
                        window.setTimeout(() => setShowAddressTips(false), 120);
                      }}
                      required
                      placeholder="请输入地址，可点击右侧地图图标查询"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                    {showAddressTips && addressTips.length > 0 ? (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {addressTips.map((tip, index) => (
                          <button
                            key={`${tip.name}-${tip.address}-${index}`}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              const pickedAddress = `${tip.name}${tip.address}`.trim() || tip.name;
                              setAddress(pickedAddress);
                              if (tip.longitude != null && tip.latitude != null) {
                                setLongitude(String(tip.longitude.toFixed(6)));
                                setLatitude(String(tip.latitude.toFixed(6)));
                              }
                              setShowAddressTips(false);
                            }}
                            className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-b-0 hover:bg-slate-50"
                          >
                            <p className="font-semibold text-slate-800">{tip.name}</p>
                            <p className="mt-0.5 text-slate-500">{tip.address || "无详细地址"}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <AmapPickerModal
                    iconOnly
                    autoSearchOnOpen
                    initialAddress={addressSearchSeed}
                    initialLongitude={longitude ? Number(longitude) : undefined}
                    initialLatitude={latitude ? Number(latitude) : undefined}
                    onConfirm={(picked) => {
                      setAddress(picked.address);
                      setLongitude(String(picked.longitude.toFixed(6)));
                      setLatitude(String(picked.latitude.toFixed(6)));
                    }}
                  />
                </div>
              </label>

              <input type="hidden" name="longitude" value={longitude} />
              <input type="hidden" name="latitude" value={latitude} />

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">
                  手机号 <span className="text-rose-500">*</span>
                </span>
                <input
                  name="phone"
                  required
                  pattern="1[0-9]{10}"
                  maxLength={11}
                  inputMode="numeric"
                  title="请与请求的格式匹配"
                  placeholder="请输入手机号"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">
                  客户类型 <span className="text-rose-500">*</span>
                </span>
                {isServiceUser ? <input type="hidden" name="customerType" value="客服" /> : null}
                <select
                  name="customerType"
                  required
                  defaultValue={isServiceUser ? "客服" : ""}
                  disabled={isServiceUser}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {isServiceUser ? null : <option value="">请选择客户类型</option>}
                  {customerTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {submitError ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{submitError}</p>
              ) : null}

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-start">
                <span className="pt-2 text-sm font-medium text-slate-700">单据备注</span>
                <textarea
                  name="remark"
                  rows={4}
                  maxLength={500}
                  placeholder="请输入单据备注（仅文字）"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">约定时间</span>
                <input
                  name="appointmentAt"
                  type="datetime-local"
                  min={minAppointmentAt}
                  max={maxAppointmentAt}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-start">
                <span className="pt-2 text-sm font-medium text-slate-700">单据照片</span>
                <div>
                  <input
                    name="photo"
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    请上传大小不超过 <span className="font-semibold text-rose-500">10MB</span> 的图片
                  </p>
                </div>
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  提交单据
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
