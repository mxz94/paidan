import { prisma } from "@/lib/prisma";

function normalizeIds(values: number[]) {
  return Array.from(new Set(values.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)));
}

export async function ensureUserPackageBindingTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserPackageBinding" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER NOT NULL,
      "userId" INTEGER NOT NULL,
      "packageId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserPackageBinding_user_package_unique" ON "UserPackageBinding"("userId", "packageId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "UserPackageBinding_user_idx" ON "UserPackageBinding"("userId");`,
  );
}

export async function replaceUserAllowedPackages(tenantId: number, userId: number, packageIds: number[]) {
  const ids = normalizeIds(packageIds);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "UserPackageBinding" WHERE "tenantId" = ? AND "userId" = ?`, tenantId, userId);
    for (const packageId of ids) {
      await tx.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "UserPackageBinding" ("tenantId", "userId", "packageId") VALUES (?, ?, ?)`,
        tenantId,
        userId,
        packageId,
      );
    }
  });
}

export async function getAllowedPackageIdsForUser(tenantId: number, userId: number) {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "packageId" FROM "UserPackageBinding" WHERE "tenantId" = ? AND "userId" = ?`,
    tenantId,
    userId,
  )) as Array<{ packageId: number }>;
  return normalizeIds(rows.map((row) => Number(row.packageId)));
}

export async function getAllowedPackageIdsMapForUsers(tenantId: number, userIds: number[]) {
  const safeUserIds = normalizeIds(userIds);
  const result = new Map<number, number[]>();
  if (safeUserIds.length === 0) return result;
  const sql = `SELECT "userId","packageId" FROM "UserPackageBinding" WHERE "tenantId"=${tenantId} AND "userId" IN (${safeUserIds.join(",")})`;
  const rows = (await prisma.$queryRawUnsafe(sql)) as Array<{ userId: number; packageId: number }>;
  for (const row of rows) {
    const uid = Number(row.userId);
    const pid = Number(row.packageId);
    if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(pid) || pid <= 0) continue;
    if (!result.has(uid)) result.set(uid, []);
    result.get(uid)!.push(pid);
  }
  for (const [uid, ids] of result.entries()) {
    result.set(uid, normalizeIds(ids));
  }
  return result;
}
