"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveTenantSystemConfig, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";
import { getSessionUserWithTenant, hasMenuPermission } from "@/lib/tenant";

const DEFAULT_PRECISE_LIMIT = 3;
const DEFAULT_SERVICE_LIMIT = 20;

export async function saveSystemConfig(formData: FormData) {
  const me = await getSessionUserWithTenant();
  const hasPermission = await hasMenuPermission(me.id, "system-config");
  const tenantId = Number(me.tenantId);
  if (!tenantId || !hasPermission) {
    redirect("/dashboard");
  }

  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  if (webhookUrl) {
    try {
      new URL(webhookUrl);
    } catch {
      redirect("/dashboard/settings?err=url");
    }
  }

  const preciseLimit = Number(formData.get("preciseDailyClaimLimit") ?? DEFAULT_PRECISE_LIMIT);
  const serviceLimit = Number(formData.get("serviceDailyClaimLimit") ?? DEFAULT_SERVICE_LIMIT);
  const claimLimitDisabled = String(formData.get("claimLimitDisabled") ?? "") === "1";
  if (!Number.isInteger(preciseLimit) || preciseLimit < 0 || !Number.isInteger(serviceLimit) || serviceLimit < 0) {
    redirect("/dashboard/settings?err=limit");
  }

  await saveTenantSystemConfig(tenantId, [
    { key: SYSTEM_CONFIG_KEYS.webhookUrl, value: webhookUrl },
    { key: SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit, value: String(preciseLimit) },
    { key: SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit, value: String(serviceLimit) },
    { key: SYSTEM_CONFIG_KEYS.claimLimitDisabled, value: claimLimitDisabled ? "1" : "0" },
  ]);

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
