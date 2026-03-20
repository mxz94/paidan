import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toUtcIcsDate(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ message: "Invalid order id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const at = String(url.searchParams.get("at") ?? "").trim();
  const startAt = at ? new Date(at) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ message: "Invalid schedule time" }, { status: 400 });
  }
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  const order = await prisma.dispatchOrder.findFirst({
    where: { id: orderId, isDeleted: false },
    select: {
      id: true,
      title: true,
      address: true,
      phone: true,
      createdById: true,
      claimedById: true,
    },
  });
  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  const meId = Number(session.user.id);
  const isAdmin = session.user.roleCode === "ADMIN";
  const canAccess = isAdmin || order.createdById === meId || order.claimedById === meId;
  if (!canAccess) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const summary = escapeIcsText(`${order.title || `单据#${order.id}`} - 改约提醒`);
  const description = escapeIcsText(
    `单据ID：${order.id}\n地址：${order.address || "-"}\n手机号：${order.phone || "-"}`,
  );
  const location = escapeIcsText(order.address || "");
  const uid = `order-${order.id}-${startAt.getTime()}@paidan.local`;
  const now = new Date();

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//paidan//dispatch-calendar//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toUtcIcsDate(now)}`,
    `DTSTART:${toUtcIcsDate(startAt)}`,
    `DTEND:${toUtcIcsDate(endAt)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:改约提醒",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="order-${order.id}-calendar.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

