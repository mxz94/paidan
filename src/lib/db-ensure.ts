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
