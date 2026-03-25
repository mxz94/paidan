import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessDashboard } from "@/lib/user-access";
import { updateDashboardProfile } from "./actions";

type SearchParams = Promise<{
  op?: string;
}>;

const opMessage: Record<string, { text: string; cls: string }> = {
  ok: { text: "保存成功", cls: "bg-emerald-50 text-emerald-700" },
  "name-empty": { text: "姓名不能为空", cls: "bg-rose-50 text-rose-700" },
  "pwd-empty": { text: "修改密码时请完整填写旧密码、新密码和确认密码", cls: "bg-rose-50 text-rose-700" },
  "pwd-short": { text: "新密码至少 6 位", cls: "bg-rose-50 text-rose-700" },
  "pwd-mismatch": { text: "两次输入的新密码不一致", cls: "bg-rose-50 text-rose-700" },
  "pwd-old": { text: "旧密码错误", cls: "bg-rose-50 text-rose-700" },
};

export const dynamic = "force-dynamic";

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      id: true,
      username: true,
      displayName: true,
      accessMode: true,
      isDeleted: true,
      isDisabled: true,
    },
  });
  if (!me || me.isDeleted || me.isDisabled) {
    redirect("/login");
  }
  if (!canAccessDashboard(me.accessMode)) {
    redirect("/mobile");
  }

  const params = await searchParams;
  const opInfo = params.op ? opMessage[params.op] : null;

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">个人中心</h1>
          <Link href="/dashboard" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            返回首页
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          账号：{me.username} · 当前姓名：{me.displayName}
        </p>
      </header>

      {opInfo ? <p className={`rounded-xl px-3 py-2 text-sm ${opInfo.cls}`}>{opInfo.text}</p> : null}

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <form action={updateDashboardProfile} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="displayName" className="text-sm font-medium text-slate-700">
              姓名
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={me.displayName}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">修改密码（可选）</p>
            <div className="space-y-2">
              <input
                type="password"
                name="oldPassword"
                placeholder="旧密码"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              />
              <input
                type="password"
                name="newPassword"
                minLength={6}
                placeholder="新密码（至少 6 位）"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              />
              <input
                type="password"
                name="confirmPassword"
                minLength={6}
                placeholder="确认新密码"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            保存
          </button>
        </form>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <LogoutButton />
        </div>
      </article>
    </section>
  );
}

