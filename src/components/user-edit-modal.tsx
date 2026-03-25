"use client";

import { useState } from "react";

type RoleOption = {
  id: number;
  name: string;
};

type Props = {
  userId: number;
  defaultDisplayName: string;
  defaultAccessMode: "SUPERVISOR" | "SERVICE" | "SALE";
  defaultRoleId: number;
  defaultStoreName: string;
  roles: RoleOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function UserEditModal({
  userId,
  defaultDisplayName,
  defaultAccessMode,
  defaultRoleId,
  defaultStoreName,
  roles = [],
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const safeRoles = Array.isArray(roles) ? roles : [];
  const firstRoleId = (() => {
    for (const role of safeRoles) {
      return role.id;
    }
    return null;
  })();
  const fallbackRoleId = safeRoles.find((role) => role.id === defaultRoleId)?.id ?? firstRoleId;
  const safeAccessMode =
    defaultAccessMode === "SUPERVISOR" || defaultAccessMode === "SALE" || defaultAccessMode === "SERVICE"
      ? defaultAccessMode
      : "SERVICE";

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
              <h3 className="text-lg font-bold text-slate-900">编辑用户</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form action={action} className="space-y-3">
              <input type="hidden" name="userId" value={userId} />

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">姓名</span>
                <input
                  name="displayName"
                  required
                  minLength={2}
                  defaultValue={defaultDisplayName}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">角色</span>
                <select
                  name="roleId"
                  required
                  defaultValue={fallbackRoleId != null ? String(fallbackRoleId) : ""}
                  disabled={safeRoles.length === 0}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {safeRoles.length === 0 ? (
                    <option value="">暂无可用角色</option>
                  ) : null}
                  {safeRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">门店</span>
                <input
                  value={defaultStoreName || "-"}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">用户类型</span>
                <select
                  name="userType"
                  required
                  defaultValue={safeAccessMode}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="SUPERVISOR">主管</option>
                  <option value="SERVICE">客服</option>
                  <option value="SALE">业务员</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-600">重置密码（可选）</span>
                <input
                  name="password"
                  type="password"
                  minLength={6}
                  placeholder="不填写则保持原密码"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={safeRoles.length === 0}
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
