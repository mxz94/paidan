"use client";

import { useState } from "react";

type Props = {
  packageId: number;
  defaultName: string;
  defaultCode: string;
  defaultPrice: number;
  defaultDescription?: string | null;
  defaultIsActive: boolean;
  defaultIsDefault: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

export function PackageEditModal({
  packageId,
  defaultName,
  defaultCode,
  defaultPrice,
  defaultDescription,
  defaultIsActive,
  defaultIsDefault,
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
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">编辑套餐</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form action={action} className="grid gap-4">
              <input type="hidden" name="packageId" value={packageId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">套餐名称</span>
                  <input
                    name="name"
                    required
                    minLength={2}
                    defaultValue={defaultName}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">套餐代码</span>
                  <input
                    name="code"
                    required
                    pattern="[A-Z0-9_]+"
                    defaultValue={defaultCode}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">价格</span>
                  <input
                    name="price"
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={defaultPrice}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">状态</span>
                  <select
                    name="isActive"
                    defaultValue={defaultIsActive ? "1" : "0"}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">默认套餐</span>
                  <select
                    name="isDefault"
                    defaultValue={defaultIsDefault ? "1" : "0"}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="0">否</option>
                    <option value="1">是</option>
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm text-slate-600">套餐说明</span>
                  <textarea
                    name="description"
                    maxLength={200}
                    rows={3}
                    defaultValue={defaultDescription ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>

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
