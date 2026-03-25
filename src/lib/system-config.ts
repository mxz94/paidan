import { prisma } from "@/lib/prisma";

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

export async function ensureSystemConfigTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemConfig" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const [key, value] of Object.entries(SYSTEM_CONFIG_DEFAULTS)) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
      VALUES ('${key}', '${value}', CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO NOTHING;
    `);
  }
}

export async function getSystemConfigValues(keys: string[]) {
  await ensureSystemConfigTable();
  const result = new Map<string, string>();

  for (const key of keys) {
    const rows = (await prisma.$queryRaw`
      SELECT "value"
      FROM "SystemConfig"
      WHERE "key" = ${key}
      LIMIT 1
    `) as Array<{ value: string | null }>;
    const value = rows[0]?.value;
    if (value != null) {
      result.set(key, String(value));
    }
  }

  return result;
}

export async function getSystemConfigNumber(key: string, defaultValue: number) {
  const values = await getSystemConfigValues([key]);
  const raw = values.get(key);
  const value = Number(raw ?? "");
  if (!Number.isInteger(value) || value < 0) {
    return defaultValue;
  }
  return value;
}
