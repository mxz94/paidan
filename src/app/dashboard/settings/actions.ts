"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSystemConfigTable, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";
import { isSuperAdminRole, isTenantAdminRole } from "@/lib/tenant";

const DEFAULT_PRECISE_LIMIT = 3;
const DEFAULT_SERVICE_LIMIT = 20;

export async function saveSystemConfig(formData: FormData) {
  const session = await getAuthSession();

  if (!session?.user?.id || !isTenantAdminRole(session.user.roleCode) || isSuperAdminRole(session.user.roleCode)) {
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

  await ensureSystemConfigTable();
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
      VALUES (${SYSTEM_CONFIG_KEYS.webhookUrl}, ${webhookUrl}, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
      VALUES (${SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit}, ${String(preciseLimit)}, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
      VALUES (${SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit}, ${String(serviceLimit)}, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
      VALUES (${SYSTEM_CONFIG_KEYS.claimLimitDisabled}, ${claimLimitDisabled ? "1" : "0"}, CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
  ]);

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
