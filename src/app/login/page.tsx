"use client";

import { FormEvent, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showSupervisorEntryPicker, setShowSupervisorEntryPicker] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.ok) {
        try {
          const resp = await fetch("/api/auth/session", { cache: "no-store" });
          const session = (await resp.json()) as { user?: { accessMode?: string; username?: string } };
          const isAdminAccount = session?.user?.username === "admin";
          if (session?.user?.accessMode === "SUPERVISOR" && !isAdminAccount) {
            setShowSupervisorEntryPicker(true);
            return;
          }
        } catch {}
        router.replace("/");
        router.refresh();
        return;
      }

      setError("账号密码错误，或该账号无权限登录。");
    });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.25),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(251,191,36,0.2),transparent_40%),radial-gradient(circle_at_50%_90%,rgba(14,165,233,0.2),transparent_45%)]" />
      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/15 bg-white/95 p-6 shadow-2xl backdrop-blur md:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">派单管理系统</h1>
        <p className="mt-2 text-sm text-slate-600">支持后台管理与移动端派单大厅</p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">用户名</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">密码</span>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "登录中..." : "登录"}
          </button>
        </form>
      </section>

      {showSupervisorEntryPicker ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">请选择进入端</h2>
            <p className="mt-1 text-sm text-slate-600">主管账号可进入后台或客户端。</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  router.replace("/dashboard");
                  router.refresh();
                }}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                进入后台
              </button>
              <button
                type="button"
                onClick={() => {
                  router.replace("/mobile");
                  router.refresh();
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                进入客户端
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
