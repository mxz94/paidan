"use client";

import { useState } from "react";
import { AmapPickerModal } from "@/components/amap-picker-modal";

type PackageOption = {
  id: number;
  name: string;
  code: string;
  isDefault?: boolean;
};

type Props = {
  packages: PackageOption[];
  customerTypes: string[];
  regions: string[];
  action: (formData: FormData) => void | Promise<void>;
};

export function OrderCreateModal({ packages, customerTypes, regions, action }: Props) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");

  const defaultTitle = packages.find((item) => item.isDefault)?.name ?? packages[0]?.name ?? "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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

            <form action={action} className="grid gap-4">
              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">标题</span>
                <div>
                  <input
                    name="title"
                    required
                    defaultValue={defaultTitle}
                    list="order-title-options"
                    placeholder="可选择套餐名称，也可手动输入"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                  <datalist id="order-title-options">
                    {packages.map((item) => (
                      <option key={item.id} value={item.name} />
                    ))}
                  </datalist>
                </div>
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">区域</span>
                <select
                  name="region"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">请选择区域</option>
                  {regions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">地址</span>
                <div className="flex items-center gap-2">
                  <input
                    name="address"
                    value={address}
                    onChange={(event) => setAddress(event.currentTarget.value)}
                    placeholder="请输入地址，可点击右侧地图图标查询"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                  <AmapPickerModal
                    iconOnly
                    initialAddress={address}
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
                <span className="text-sm font-medium text-slate-700">手机号</span>
                <input
                  name="phone"
                  required
                  placeholder="请输入手机号"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
                <span className="text-sm font-medium text-slate-700">客户类型</span>
                <select
                  name="customerType"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">请选择客户类型</option>
                  {customerTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

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
                  disabled={packages.length === 0}
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
