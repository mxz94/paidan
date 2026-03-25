import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessMobile } from "@/lib/user-access";
import { touchUserDailyActive } from "@/lib/user-activity";
import { LogoutButton } from "@/components/logout-button";
import { OnlineHeartbeat } from "@/components/online-heartbeat";
import { updateMobileProfilePassword } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  op?: string;
  tab?: string;
}>;

const opMessage: Record<string, { text: string; cls: string }> = {
  "profile-pwd1": { text: "密码修改成功", cls: "bg-emerald-50 text-emerald-700" },
  "profile-pwd0": { text: "请填写完整密码信息", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-short": { text: "新密码至少 6 位", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-mismatch": { text: "两次输入的新密码不一致", cls: "bg-rose-50 text-rose-700" },
  "profile-pwd-old": { text: "原密码错误", cls: "bg-rose-50 text-rose-700" },
};

export default async function MobileProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, accessMode: true, isDeleted: true, isDisabled: true, displayName: true, lastLoginAt: true },
  });
  if (!me || me.isDeleted || me.isDisabled) {
    redirect("/login");
  }
  if (!canAccessMobile(me.accessMode)) {
    redirect("/dashboard");
  }

  await touchUserDailyActive(me.id, me.lastLoginAt);

  const params = await searchParams;
  const opInfo = params.op ? opMessage[params.op] : null;
  const backTab = ["new", "doing", "done"].includes(String(params.tab)) ? String(params.tab) : "new";

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-900">
      <section className="mx-auto max-w-md space-y-3">
        <OnlineHeartbeat />
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">个人中心</h1>
            <Link href={`/mobile?tab=${backTab}`} className="text-xs text-blue-600">
              返回
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">当前用户：{me.displayName}</p>
        </div>

        {opInfo ? <p className={`rounded-lg px-3 py-2 text-sm ${opInfo.cls}`}>{opInfo.text}</p> : null}

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <form action={updateMobileProfilePassword} className="space-y-2">
            <input type="hidden" name="source" value="profile" />
            <input
              type="password"
              name="oldPassword"
              required
              placeholder="原密码"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              name="newPassword"
              required
              minLength={6}
              placeholder="新密码（至少6位）"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              placeholder="确认新密码"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              修改密码
            </button>
          </form>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
