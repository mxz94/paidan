import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureUserManageColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await ensureUserManageColumns();

  const userId = Number(session.user.id);
  const now = new Date();
  const threshold = new Date(now.getTime() - HEARTBEAT_INTERVAL_MS);

  await prisma.user.updateMany({
    where: {
      id: userId,
      isDeleted: false,
      isDisabled: false,
      OR: [{ lastLoginAt: null }, { lastLoginAt: { lte: threshold } }],
    },
    data: { lastLoginAt: now },
  });

  return NextResponse.json({ ok: true, at: now.toISOString() });
}

