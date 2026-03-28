import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePushDeviceTable } from "@/lib/db-ensure";
import { registerPushToken } from "@/lib/push-notify";
import { canAccessMobile } from "@/lib/user-access";

const registerSchema = z.object({
  token: z.string().trim().min(10).max(512),
  platform: z.string().trim().max(32).optional(),
});

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, tenantId: true, isDeleted: true, isDisabled: true, accessMode: true },
  });
  if (!user || user.isDeleted || user.isDisabled || !user.tenantId || !canAccessMobile(user.accessMode)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await ensurePushDeviceTable();
  await registerPushToken({
    tenantId: user.tenantId,
    userId: user.id,
    token: parsed.data.token,
    platform: parsed.data.platform,
  });

  return NextResponse.json({ ok: true });
}
