"use client";

import { useState } from "react";

type MobileUser = {
  id: number;
  displayName: string;
  username: string;
};

type Props = {
  orderId: number;
  users: MobileUser[];
  action: (formData: FormData) => void | Promise<void>;
};

export function OrderAssignModal({ orderId, users, action }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-indigo-600">
        派单
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">指定领取人</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form action={action} className="space-y-3">
              <input type="hidden" name="orderId" value={orderId} />

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">移动端用户</span>
                <select
                  name="userId"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>
                    请选择用户
                  </option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}（{user.username}）
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={users.length === 0}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  确认派单
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
