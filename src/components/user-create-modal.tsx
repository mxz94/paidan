"use client";

import { useState } from "react";

type RoleOption = {
  id: number;
  name: string;
};

type StoreOption = {
  id: number;
  name: string;
};

type Props = {
  roles: RoleOption[];
  stores: StoreOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function UserCreateModal({ roles, stores, action }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        新增用户
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-100 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">新增用户</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <form action={action} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">用户名</span>
                  <input
                    name="username"
                    required
                    minLength={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="如：zhangsan"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">姓名</span>
                  <input
                    name="displayName"
                    required
                    minLength={2}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="如：张三"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">初始密码</span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="至少6位"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">角色</span>
                  <select
                    name="roleId"
                    required
                    defaultValue={roles[0]?.id ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">门店</span>
                  <select
                    name="storeId"
                    required
                    defaultValue={stores[0]?.id ?? ""}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {stores.length === 0 ? <option value="">暂无门店，请先去门店管理新增</option> : null}
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">登录端类型</span>
                  <select
                    name="accessMode"
                    defaultValue="BACKEND"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="BACKEND">后台端</option>
                    <option value="MOBILE">移动端</option>
                  </select>
                </label>
              </div>

              <p className="text-xs text-slate-500">用户经纬度由移动端客户端自动上传更新。</p>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={stores.length === 0}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  创建用户
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
