"use client";

import Link from "next/link";
import { useState } from "react";
import { AmapPickerModal } from "@/components/amap-picker-modal";

type PackageOption = {
  id: number;
  name: string;
  code: string;
};

type Props = {
  orderId: number;
  detailHref: string;
  selectedPackageId: number;
  phone: string;
  customerType: string;
  region: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
  remark: string;
  packages: PackageOption[];
  customerTypes: string[];
  regions: string[];
  action: (formData: FormData) => void | Promise<void>;
};

export function OrderEditForm({
  orderId,
  detailHref,
  selectedPackageId,
  phone,
  customerType,
  region,
  address,
  longitude,
  latitude,
  remark,
  packages,
  customerTypes,
  regions,
  action,
}: Props) {
  const [addressValue, setAddressValue] = useState(address || "");
  const [longitudeValue, setLongitudeValue] = useState(longitude != null ? String(longitude) : "");
  const [latitudeValue, setLatitudeValue] = useState(latitude != null ? String(latitude) : "");

  return (
    <form action={action} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value="PENDING" />
      <input type="hidden" name="claimedById" value="" />
      <input type="hidden" name="claimedAt" value="" />
      <input type="hidden" name="longitude" value={longitudeValue} />
      <input type="hidden" name="latitude" value={latitudeValue} />

      <div className="grid gap-4">
        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
          <span className="text-sm font-medium text-slate-700">标题</span>
          <select
            name="packageId"
            defaultValue={String(selectedPackageId)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} ({pkg.code})
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
          <span className="text-sm font-medium text-slate-700">区域</span>
          <select
            name="region"
            defaultValue={region}
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
              value={addressValue}
              onChange={(event) => setAddressValue(event.currentTarget.value)}
              placeholder="请输入地址，可点击右侧地图图标查询"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <AmapPickerModal
              iconOnly
              initialAddress={addressValue}
              initialLongitude={longitudeValue ? Number(longitudeValue) : undefined}
              initialLatitude={latitudeValue ? Number(latitudeValue) : undefined}
              onConfirm={(picked) => {
                setAddressValue(picked.address);
                setLongitudeValue(String(picked.longitude.toFixed(6)));
                setLatitudeValue(String(picked.latitude.toFixed(6)));
              }}
            />
          </div>
        </label>

        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
          <span className="text-sm font-medium text-slate-700">手机号</span>
          <input
            name="phone"
            defaultValue={phone}
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
          <span className="text-sm font-medium text-slate-700">客户类型</span>
          <select
            name="customerType"
            defaultValue={customerType}
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
            defaultValue={remark}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          保存修改
        </button>
        <Link
          href={detailHref}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          取消
        </Link>
      </div>
    </form>
  );
}

