import { prisma } from "@/lib/prisma";
import { ensureUserManageColumns } from "@/lib/db-ensure";

export type UserAutoDisableSummary = {
  disabledCount: number;
  thresholdAt: string;
};

const INACTIVE_DAYS = 3;

export async function runInactiveUserAutoDisable(): Promise<UserAutoDisableSummary> {
  await ensureUserManageColumns();
  const threshold = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.user.updateMany({
    where: {
      isDeleted: false,
      isDisabled: false,
      accessMode: { in: ["SERVICE", "SALE"] },
      lastLoginAt: { not: null, lte: threshold },
    },
    data: {
      isDisabled: true,
    },
  });

  return {
    disabledCount: result.count,
    thresholdAt: threshold.toISOString(),
  };
}
