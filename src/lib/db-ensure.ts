import { prisma } from "@/lib/prisma";

export async function ensureDispatchRecordGpsColumns() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("DispatchOrderRecord");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));

  if (!names.has("operatorLongitude")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrderRecord" ADD COLUMN "operatorLongitude" REAL;`);
  }
  if (!names.has("operatorLatitude")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrderRecord" ADD COLUMN "operatorLatitude" REAL;`);
  }
}

export async function ensureDispatchOrderBusinessColumns() {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info("DispatchOrder");`)) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((item) => item.name));

  if (!names.has("appointmentAt")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrder" ADD COLUMN "appointmentAt" DATETIME;`);
  }
  if (!names.has("handledPhone")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrder" ADD COLUMN "handledPhone" TEXT;`);
  }
  if (!names.has("convertedToPreciseById")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrder" ADD COLUMN "convertedToPreciseById" INTEGER;`);
  }
  if (!names.has("convertedToPreciseAt")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "DispatchOrder" ADD COLUMN "convertedToPreciseAt" DATETIME;`);
  }
}

export async function ensureStoreTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Store" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "managerUserId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
