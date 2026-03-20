import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSystemConfigTable, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";
import { isSuperAdminRole, isTenantAdminRole } from "@/lib/tenant";
import { saveSystemConfig } from "./actions";

type SearchParams = Promise<{ saved?: string; err?: string }>;

const errorText: Record<string, string> = {
  url: "Webhook 链接格式不正确，请输入完整 URL。",
  limit: "每日领取次数必须是大于等于 0 的整数。",
};

const DEFAULT_PRECISE_LIMIT = 3;
const DEFAULT_SERVICE_LIMIT = 20;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!isTenantAdminRole(session.user.roleCode) || isSuperAdminRole(session.user.roleCode)) {
    redirect("/dashboard");
  }

  await ensureSystemConfigTable();
  const params = await searchParams;

  const rows = (await prisma.$queryRaw`
    SELECT "key", "value", "updatedAt"
    FROM "SystemConfig"
    WHERE "key" IN (
      ${SYSTEM_CONFIG_KEYS.webhookUrl},
      ${SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit},
      ${SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit},
      ${SYSTEM_CONFIG_KEYS.claimLimitDisabled}
    )
  `) as Array<{ key: string; value: string | null; updatedAt: string | Date }>;

  const valueByKey = new Map<string, string>();
  let lastUpdatedAt: string | Date | null = null;
  for (const row of rows) {
    valueByKey.set(row.key, row.value ?? "");
    if (!lastUpdatedAt || new Date(row.updatedAt).getTime() > new Date(lastUpdatedAt).getTime()) {
      lastUpdatedAt = row.updatedAt;
    }
  }

  const webhookUrl = valueByKey.get(SYSTEM_CONFIG_KEYS.webhookUrl) ?? "";
  const preciseDailyClaimLimit = Number(valueByKey.get(SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit) ?? "");
  const serviceDailyClaimLimit = Number(valueByKey.get(SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit) ?? "");
  const claimLimitDisabled = valueByKey.get(SYSTEM_CONFIG_KEYS.claimLimitDisabled) === "1";
  const updatedAt = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("zh-CN") : "-";

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-2xl font-bold">参数配置</h1>
        <p className="mt-2 text-sm text-slate-600">配置系统级参数，如消息通知 Webhook（可选）和每日领取上限。</p>
        {params.saved === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">保存成功</p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "保存失败"}</p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <form action={saveSystemConfig} className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">消息通知 Webhook 链接</span>
            <input
              name="webhookUrl"
              type="url"
              defaultValue={webhookUrl}
              placeholder="https://example.com/webhook"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">精准客资每天领取次数</span>
              <input
                name="preciseDailyClaimLimit"
                type="number"
                min={0}
                step={1}
                defaultValue={
                  Number.isInteger(preciseDailyClaimLimit) && preciseDailyClaimLimit >= 0
                    ? preciseDailyClaimLimit
                    : DEFAULT_PRECISE_LIMIT
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">客服客资每天领取次数</span>
              <input
                name="serviceDailyClaimLimit"
                type="number"
                min={0}
                step={1}
                defaultValue={
                  Number.isInteger(serviceDailyClaimLimit) && serviceDailyClaimLimit >= 0
                    ? serviceDailyClaimLimit
                    : DEFAULT_SERVICE_LIMIT
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <input
              name="claimLimitDisabled"
              type="checkbox"
              value="1"
              defaultChecked={claimLimitDisabled}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
            />
            <span className="text-sm font-medium text-slate-700">关闭移动端每日领取次数限制</span>
          </label>

          <div className="text-xs text-slate-500">最近更新时间：{updatedAt}</div>

          <div>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              保存配置
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
