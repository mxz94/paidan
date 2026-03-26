"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type StoreItem = {
  id: number;
  name: string;
};

type Props = {
  stores: StoreItem[];
  activeStoreId?: number;
  period: "day" | "week" | "month";
};

export function DashboardStoreFilter({ stores, activeStoreId, period }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      name="storeId"
      value={activeStoreId ? String(activeStoreId) : ""}
      onChange={(event) => {
        const value = event.currentTarget.value;
        const next = new URLSearchParams(searchParams.toString());
        if (value) next.set("storeId", value);
        else next.delete("storeId");
        next.set("period", period);
        router.push(`${pathname}?${next.toString()}`);
      }}
      className="h-9 min-w-[160px] rounded-xl border border-cyan-300/40 bg-white px-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-cyan-300/40"
    >
      <option value="">全部门店</option>
      {stores.map((store) => (
        <option key={store.id} value={store.id}>
          {store.name}
        </option>
      ))}
    </select>
  );
}
