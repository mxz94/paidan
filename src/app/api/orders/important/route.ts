import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  orderId: z.number().int().positive(),
  isImportant: z.boolean(),
});

export async function POST(request: Request) {
  await ensureDispatchOrderBusinessColumns();
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid payload" }, { status: 400 });
  }

  const operatorId = Number(session.user.id);
  const me = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { tenantId: true, isDeleted: true, isDisabled: true },
  });
  if (!me || me.isDeleted || me.isDisabled || !me.tenantId) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.dispatchOrder.updateMany({
    where: {
      id: parsed.data.orderId,
      tenantId: Number(me.tenantId),
      isDeleted: false,
      status: "CLAIMED",
      claimedById: operatorId,
    },
    data: {
      isImportant: parsed.data.isImportant,
    },
  });

  if (updated.count <= 0) {
    return NextResponse.json({ ok: false, message: "Order not found or not allowed" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

