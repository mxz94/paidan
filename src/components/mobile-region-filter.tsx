"use client";

type Props = {
  tab: string;
  selectedRegion: string;
  regions: string[];
};

export function MobileRegionFilter({ tab, selectedRegion, regions }: Props) {
  return (
    <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
      <select
        name="region"
        defaultValue={selectedRegion}
        onChange={(event) => {
          const next = event.currentTarget.value;
          const search = new URLSearchParams();
          search.set("tab", tab);
          if (next && next !== "AUTO") {
            search.set("region", next);
          }
          window.location.href = `/mobile?${search.toString()}`;
        }}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
      >
        <option value="AUTO">区域筛选（自动按距离）</option>
        {regions.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </select>
    </div>
  );
}
