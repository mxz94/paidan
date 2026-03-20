"use client";

import { useState } from "react";

type UserOption = {
  id: number;
  displayName: string;
  username: string;
};

type Props = {
  users: UserOption[];
  formId: string;
  checkboxSelector: string;
};

export function BatchAssignButton({ users, formId, checkboxSelector }: Props) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");

  const openAssign = () => {
    const checkedCount = document.querySelectorAll<HTMLInputElement>(`${checkboxSelector}:checked`).length;
    if (checkedCount <= 0) {
      window.alert("请先勾选要派单的单据");
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <input type="hidden" name="userId" value={userId} form={formId} />

      <button
        type="button"
        onClick={openAssign}
        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
      >
        批量派单
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">批量派单</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">选择移动端用户</span>
              <select
                value={userId}
                onChange={(event) => setUserId(event.currentTarget.value)}
                className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              >
                <option value="">请选择用户</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.displayName}（{user.username}）
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                取消
              </button>
              <button
                type="submit"
                form={formId}
                name="intent"
                value="assign"
                disabled={!userId}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认派单
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

