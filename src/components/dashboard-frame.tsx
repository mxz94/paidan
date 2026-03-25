"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { MobileLocationSync } from "@/components/mobile-location-sync";

type MenuItem = {
  id: number;
  name: string;
  path: string;
};

type Props = {
  displayName: string;
  roleName: string;
  menus: MenuItem[];
  children: React.ReactNode;
};

export function DashboardFrame({ displayName, roleName, menus, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    try {
      const cached = window.localStorage.getItem("dashboard_sidebar_collapsed");
      if (cached === "1") {
        setCollapsed(true);
      }
    } catch {}
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside
        className={`z-20 border-b border-slate-200 bg-white ${mounted ? "transition-all duration-200" : "transition-none"} md:fixed md:inset-y-0 md:left-0 md:border-b-0 md:border-r ${
          collapsed ? "md:w-12" : "md:w-72"
        }`}
      >
        <div className={`border-b border-slate-200 ${collapsed ? "p-2" : "p-4 md:p-6"}`}>
          <div className="flex items-center justify-between gap-2">
            {!collapsed ? (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">后台管理</p>
                <h2 className="mt-2 text-xl font-bold">派单管理系统</h2>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = !prev;
                  try {
                    window.localStorage.setItem("dashboard_sidebar_collapsed", next ? "1" : "0");
                  } catch {}
                  return next;
                })
              }
              className="hidden h-6 w-10 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 md:inline-flex md:items-center md:justify-center"
              title={collapsed ? "展开菜单" : "折叠菜单"}
              aria-label={collapsed ? "展开菜单" : "折叠菜单"}
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4l6 6-6 6" />
              </svg>
            </button>
          </div>
          {!collapsed ? <p className="mt-1 text-sm text-slate-600">{displayName} · {roleName}</p> : null}
        </div>

        {!collapsed ? (
          <nav className="overflow-x-auto p-3 md:p-4">
          <ul className="flex gap-2 md:flex-col">
            {menus.map((menu) => (
              <li key={menu.id}>
                <Link
                  href={menu.path}
                  title={menu.name}
                  className={`block whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
                    collapsed
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white md:text-center"
                      : "bg-slate-900 text-white hover:bg-slate-700 md:bg-slate-100 md:text-slate-700 md:hover:bg-slate-900 md:hover:text-white"
                  }`}
                >
                  {collapsed ? menu.name.slice(0, 2) : menu.name}
                </Link>
              </li>
            ))}
          </ul>
          </nav>
        ) : null}

        <div className="p-2 md:absolute md:bottom-0 md:left-0 md:w-full md:p-3">
          <Link
            href="/dashboard/profile"
            title="个人中心"
            className={`inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${
              collapsed ? "h-9 px-0" : "h-10 px-3"
            }`}
          >
            {collapsed ? "我" : "个人中心"}
          </Link>
        </div>

      </aside>

      <main
        className={`min-h-screen flex-1 p-4 ${mounted ? "transition-all duration-200" : "transition-none"} md:p-8 ${
          collapsed ? "md:ml-12" : "md:ml-72"
        }`}
      >
        {children}
      </main>
      <MobileLocationSync />
    </div>
  );
}
