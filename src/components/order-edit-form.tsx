"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AmapPickerModal } from "@/components/amap-picker-modal";
import {
  composeRegionValue,
  getLuoyangTowns,
  parseRegionValue,
  type LuoyangRegionNode,
} from "@/lib/regions";

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
  regionTree: LuoyangRegionNode[];
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
  regionTree,
  action,
}: Props) {
  const parsedRegion = useMemo(() => parseRegionValue(region), [region]);
  const [district, setDistrict] = useState(parsedRegion.district);
  const [town, setTown] = useState(parsedRegion.town);

  const [addressValue, setAddressValue] = useState(address || "");
  const [longitudeValue, setLongitudeValue] = useState(longitude != null ? String(longitude) : "");
  const [latitudeValue, setLatitudeValue] = useState(latitude != null ? String(latitude) : "");
  const [submitError, setSubmitError] = useState("");

  const towns = getLuoyangTowns(district);
  const regionValue = composeRegionValue(district, town);

  return (
    <form
      action={action}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const packageId = Number(data.get("packageId") ?? 0);
        const region = String(data.get("region") ?? "").trim();
        const address = String(data.get("address") ?? "").trim();
        const phone = String(data.get("phone") ?? "").trim();
        const customerType = String(data.get("customerType") ?? "").trim();

        if (
          !Number.isInteger(packageId) ||
          packageId <= 0 ||
          !region ||
          !address ||
          !customerType ||
          !phone
        ) {
          event.preventDefault();
          setSubmitError("请先完善必填项：标题、区域、地址、手机号、客户类型。");
          return;
        }
        setSubmitError("");
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value="PENDING" />
      <input type="hidden" name="claimedById" value="" />
      <input type="hidden" name="claimedAt" value="" />
      <input type="hidden" name="longitude" value={longitudeValue} />
      <input type="hidden" name="latitude" value={latitudeValue} />
      <input type="hidden" name="region" value={regionValue} />

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

        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-start">
          <span className="text-sm font-medium text-slate-700">区域</span>
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
          <span className="text-sm font-medium text-slate-700">地址</span>
          <div className="flex items-center gap-2">
            <input
              name="address"
              value={addressValue}
              onChange={(event) => setAddressValue(event.currentTarget.value)}
              required
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
            pattern="1[0-9]{10}"
            maxLength={11}
            inputMode="numeric"
            title="请与请求的格式匹配"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="grid gap-2 sm:grid-cols-[88px,1fr] sm:items-center">
          <span className="text-sm font-medium text-slate-700">客户类型</span>
          <select
            name="customerType"
            defaultValue={customerType}
            required
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
        {submitError ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{submitError}</p>
        ) : null}
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
