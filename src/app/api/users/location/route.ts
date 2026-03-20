import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const locationSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

export async function POST(request: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = locationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid location" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: Number(session.user.id) },
    data: {
      longitude: parsed.data.longitude,
      latitude: parsed.data.latitude,
      locationAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
