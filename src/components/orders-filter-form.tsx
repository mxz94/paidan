"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getLuoyangTowns } from "@/lib/regions";

type UserOption = {
  id: number;
  displayName: string | null;
  username: string;
};

type Props = {
  pageSize: number;
  sortBy: string;
  sortDir: string;
  keyword: string;
  status: string;
  timeout: string;
  district: string;
  town: string;
  createdByIdRaw: string;
  claimedByIdRaw: string;
  convertedByIdRaw: string;
  timeStartValue: string;
  timeEndValue: string;
  districtOptions: string[];
  filterUsers: UserOption[];
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

export function OrdersFilterForm(props: Props) {
  const router = useRouter();
  const [district, setDistrict] = useState(props.district);
  const townOptions = useMemo(() => (district ? getLuoyangTowns(district) : []), [district]);
  const [town, setTown] = useState(props.town);

  return (
    <form
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const query = buildQuery({
          page: 1,
          pageSize: props.pageSize,
          sortBy: props.sortBy,
          sortDir: props.sortDir,
          keyword: String(formData.get("keyword") ?? "").trim(),
          status: String(formData.get("status") ?? "").trim(),
          timeout: String(formData.get("timeout") ?? "").trim(),
          district: String(formData.get("district") ?? "").trim(),
          town: String(formData.get("town") ?? "").trim(),
          createdById: String(formData.get("createdById") ?? "").trim(),
          claimedById: String(formData.get("claimedById") ?? "").trim(),
          convertedById: String(formData.get("convertedById") ?? "").trim(),
          timeStart: String(formData.get("timeStart") ?? "").trim(),
          timeEnd: String(formData.get("timeEnd") ?? "").trim(),
        });
        router.replace(`/dashboard/orders?${query}`, { scroll: false });
      }}
    >
      <input type="hidden" name="pageSize" value={props.pageSize} />
      <input type="hidden" name="sortBy" value={props.sortBy} />
      <input type="hidden" name="sortDir" value={props.sortDir} />
      <input
        name="keyword"
        defaultValue={props.keyword}
        placeholder="关键字：标题/地址/手机号/创建人/领取人/转精准人"
        className="h-8 w-56 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      />
      <div className="flex h-8 w-[300px] shrink-0 items-center rounded-md border border-slate-300 bg-white px-1">
        <input
          name="timeStart"
          type="date"
          defaultValue={props.timeStartValue}
          className="h-6 w-[130px] rounded px-1 text-[11px] outline-none"
          aria-label="开始时间"
        />
        <span className="px-1 text-[11px] text-slate-400">~</span>
        <input
          name="timeEnd"
          type="date"
          defaultValue={props.timeEndValue}
          className="h-6 w-[130px] rounded px-1 text-[11px] outline-none"
          aria-label="结束时间"
        />
      </div>
      <select
        name="status"
        defaultValue={props.status}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">全部状态</option>
        <option value="PENDING">未领取</option>
        <option value="CLAIMED">已领取</option>
        <option value="DONE">已办理</option>
        <option value="ENDED">不办理</option>
      </select>
      <select
        name="timeout"
        defaultValue={props.timeout}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">超时全部</option>
        <option value="1">超时过</option>
        <option value="0">未超时过</option>
      </select>
      <select
        name="district"
        value={district}
        onChange={(event) => {
          const nextDistrict = event.currentTarget.value;
          setDistrict(nextDistrict);
          if (!nextDistrict) {
            setTown("");
            return;
          }
          const nextTowns = getLuoyangTowns(nextDistrict);
          if (!nextTowns.includes(town)) {
            setTown("");
          }
        }}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">全部区/县</option>
        {props.districtOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        name="town"
        value={town}
        onChange={(event) => setTown(event.currentTarget.value)}
        className="h-8 w-36 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">全部镇/街道</option>
        {townOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        name="createdById"
        defaultValue={props.createdByIdRaw}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">创建人</option>
        {props.filterUsers.map((user) => (
          <option key={`created-${user.id}`} value={user.id}>
            {user.displayName || user.username}
          </option>
        ))}
      </select>
      <select
        name="claimedById"
        defaultValue={props.claimedByIdRaw}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">领取人</option>
        {props.filterUsers.map((user) => (
          <option key={`claimed-${user.id}`} value={user.id}>
            {user.displayName || user.username}
          </option>
        ))}
      </select>
      <select
        name="convertedById"
        defaultValue={props.convertedByIdRaw}
        className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
      >
        <option value="">转精准人</option>
        {props.filterUsers.map((user) => (
          <option key={`converted-${user.id}`} value={user.id}>
            {user.displayName || user.username}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-8 shrink-0 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
      >
        筛选
      </button>
      <button
        type="button"
        onClick={() =>
          router.replace(
            `/dashboard/orders?${buildQuery({ pageSize: props.pageSize, sortBy: props.sortBy, sortDir: props.sortDir })}`,
            { scroll: false },
          )
        }
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold leading-none text-slate-700 transition hover:bg-slate-50"
      >
        重置
      </button>
    </form>
  );
}
