import "dotenv/config";
import { ensureSchema, prisma } from "../prisma/seed.mjs";

async function main() {
  console.log("[db:sync] start");
  await ensureSchema();
  console.log("[db:sync] done");
}

main()
  .catch((error) => {
    console.error("[db:sync] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
