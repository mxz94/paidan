import { prisma } from "@/lib/prisma";

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /duplicate column name/i.test(message) || /already exists/i.test(message);
}

async function addColumnIfMissing(sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }
}

export async function ensureDispatchRecordGpsColumns() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("DispatchOrderRecord");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));

  if (!names.has("operatorLongitude")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrderRecord" ADD COLUMN "operatorLongitude" REAL;`);
  }
  if (!names.has("operatorLatitude")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrderRecord" ADD COLUMN "operatorLatitude" REAL;`);
  }
}

export async function ensureDispatchOrderBusinessColumns() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("DispatchOrder");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));

  if (!names.has("appointmentAt")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "appointmentAt" DATETIME;`);
  }
  if (!names.has("handledPhone")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "handledPhone" TEXT;`);
  }
  if (!names.has("notHandledReason")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "notHandledReason" TEXT;`);
  }
  if (!names.has("convertedToPreciseById")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "convertedToPreciseById" INTEGER;`);
  }
  if (!names.has("convertedToPreciseAt")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "convertedToPreciseAt" DATETIME;`);
  }
  if (!names.has("isImportant")) {
    await addColumnIfMissing(`ALTER TABLE "DispatchOrder" ADD COLUMN "isImportant" BOOLEAN NOT NULL DEFAULT false;`);
  }
}

export async function ensureStoreTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Store" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "managerUserId" INTEGER NOT NULL,
      "isDeleted" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Store");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("isDeleted")) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Store" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;`);
    } catch {
      // Ignore duplicate-column errors caused by concurrent startup checks.
    }
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Store_tenantId_idx" ON "Store"("tenantId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Store_managerUserId_idx" ON "Store"("managerUserId");`);
}

export async function ensureUserStoreColumn() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("User");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("storeId")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "storeId" INTEGER;`);
  }
}

export async function ensureUserManageColumns() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("User");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("isDeleted")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;`);
  }
  if (!names.has("isDisabled")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT false;`);
  }
  if (!names.has("lastLoginAt")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;`);
  }
  if (!names.has("canClaimOrders")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "canClaimOrders" BOOLEAN NOT NULL DEFAULT true;`);
  }
  if (!names.has("preciseClaimLimit")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "preciseClaimLimit" INTEGER;`);
  }
  if (!names.has("serviceClaimLimit")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "serviceClaimLimit" INTEGER;`);
  }
  if (!names.has("sessionToken")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "sessionToken" TEXT;`);
  }
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "accessMode" = 'SERVICE' WHERE "accessMode" = 'BACKEND';`);
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "accessMode" = 'SALE' WHERE "accessMode" = 'MOBILE';`);
}
