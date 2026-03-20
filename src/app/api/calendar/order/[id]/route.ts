import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { isTenantAdminRole } from "@/lib/tenant";
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
    where: {
      id: orderId,
      isDeleted: false,
      ...(session.user.tenantId ? { tenantId: Number(session.user.tenantId) } : {}),
    },
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
  const isAdmin = isTenantAdminRole(session.user.roleCode);
  const canAccess = isAdmin || order.createdById === meId || order.claimedById === meId;
  if (!canAccess) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const summary = escapeIcsText(`${order.title || `鍗曟嵁#${order.id}`} - 鏀圭害鎻愰啋`);
  const description = escapeIcsText(
    `鍗曟嵁ID锛?{order.id}\n鍦板潃锛?{order.address || "-"}\n鎵嬫満鍙凤細${order.phone || "-"}`,
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
    "DESCRIPTION:鏀圭害鎻愰啋",
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

