import { prisma } from "@/lib/prisma";
import { ensureSystemConfigTable } from "@/lib/db-ensure";

export const SYSTEM_CONFIG_KEYS = {
  webhookUrl: "notify_webhook_url",
  preciseDailyClaimLimit: "precise_daily_claim_limit",
  serviceDailyClaimLimit: "service_daily_claim_limit",
  claimLimitDisabled: "claim_limit_disabled",
} as const;

export const SYSTEM_CONFIG_DEFAULTS: Record<string, string> = {
  [SYSTEM_CONFIG_KEYS.preciseDailyClaimLimit]: "3",
  [SYSTEM_CONFIG_KEYS.serviceDailyClaimLimit]: "20",
  [SYSTEM_CONFIG_KEYS.claimLimitDisabled]: "0",
};

export async function ensureTenantSystemConfigDefaults(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return;
  }
  await ensureSystemConfigTable();

  for (const [key, value] of Object.entries(SYSTEM_CONFIG_DEFAULTS)) {
    await prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("tenantId", "key", "value", "updatedAt")
      VALUES (${tenantId}, ${key}, ${value}, CURRENT_TIMESTAMP)
      ON CONFLICT("tenantId", "key") DO NOTHING
    `;
  }
}

export async function getSystemConfigValues(tenantId: number, keys: string[]) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return new Map<string, string>();
  }
  await ensureSystemConfigTable();
  await ensureTenantSystemConfigDefaults(tenantId);

  const result = new Map<string, string>();
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));

  for (const key of uniqueKeys) {
    const rows = (await prisma.$queryRaw`
      SELECT "value"
      FROM "SystemConfig"
      WHERE "tenantId" = ${tenantId}
        AND "key" = ${key}
      LIMIT 1
    `) as Array<{ value: string | null }>;
    const value = rows[0]?.value;
    if (value != null) {
      result.set(key, String(value));
    }
  }

  return result;
}

export async function getSystemConfigNumber(tenantId: number, key: string, defaultValue: number) {
  const values = await getSystemConfigValues(tenantId, [key]);
  const raw = values.get(key);
  const value = Number(raw ?? "");
  if (!Number.isInteger(value) || value < 0) {
    return defaultValue;
  }
  return value;
}

export async function saveTenantSystemConfig(
  tenantId: number,
  entries: Array<{ key: string; value: string }>,
) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return;
  }
  await ensureSystemConfigTable();
  await ensureTenantSystemConfigDefaults(tenantId);

  for (const entry of entries) {
    await prisma.$executeRaw`
      INSERT INTO "SystemConfig" ("tenantId", "key", "value", "updatedAt")
      VALUES (${tenantId}, ${entry.key}, ${entry.value}, CURRENT_TIMESTAMP)
      ON CONFLICT("tenantId", "key") DO UPDATE SET
        "value" = excluded."value",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }
}
