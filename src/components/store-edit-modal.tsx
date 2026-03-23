"use client";

import { useState } from "react";

type ManagerOption = {
  id: number;
  label: string;
};

type Props = {
  storeId: number;
  defaultName: string;
  defaultManagerUserId: number;
  managers: ManagerOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function StoreEditModal({
  storeId,
  defaultName,
  defaultManagerUserId,
  managers,
  action,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        编辑
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">编辑门店</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form action={action} className="space-y-4">
              <input type="hidden" name="storeId" value={storeId} />

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">门店名称</span>
                <input
                  name="name"
                  required
                  maxLength={40}
                  defaultValue={defaultName}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">门店主管</span>
                <select
                  name="managerUserId"
                  required
                  defaultValue={defaultManagerUserId}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {managers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  保存
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
