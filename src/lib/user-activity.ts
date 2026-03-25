import { prisma } from "@/lib/prisma";
import { ensureUserManageColumns } from "@/lib/db-ensure";

const SHANGHAI_TZ = "Asia/Shanghai";

let ensureColumnsPromise: Promise<void> | null = null;

async function ensureColumnsOnce() {
  if (!ensureColumnsPromise) {
    ensureColumnsPromise = ensureUserManageColumns().catch((error) => {
      ensureColumnsPromise = null;
      throw error;
    });
  }
  await ensureColumnsPromise;
}

function toShanghaiDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function touchUserDailyActive(userId: number, lastLoginAt: Date | null | undefined) {
  if (!Number.isInteger(userId) || userId <= 0) return;

  const todayKey = toShanghaiDayKey(new Date());
  const lastKey = lastLoginAt ? toShanghaiDayKey(lastLoginAt) : "";
  if (lastKey === todayKey) {
    return;
  }

  await ensureColumnsOnce();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

