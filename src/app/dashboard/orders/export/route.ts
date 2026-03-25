import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<string, string> = {
  PENDING: "未领取",
  CLAIMED: "已领取",
  DONE: "已完结",
  ENDED: "结束",
};

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      tenantId: true,
      role: {
        select: {
          roleMenus: {
            where: { menu: { key: "dispatch-order" } },
            select: { menuId: true },
          },
        },
      },
    },
  });
  if (!me || !me.tenantId || me.role.roleMenus.length === 0) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = String(searchParams.get("keyword") ?? "").trim();
  const status = String(searchParams.get("status") ?? "").trim();
  const format = String(searchParams.get("format") ?? "csv").toLowerCase();
  const packageId = Number(searchParams.get("packageId") ?? 0);

  const where: {
    tenantId?: number;
    isDeleted: boolean;
    AND?: Array<Record<string, unknown>>;
  } = { isDeleted: false, ...(me.tenantId ? { tenantId: me.tenantId } : {}) };
  const andConditions: Array<Record<string, unknown>> = [];

  if (keyword) {
    andConditions.push({
      OR: [{ title: { contains: keyword } }, { address: { contains: keyword } }, { phone: { contains: keyword } }],
    });
  }
  if (status) {
    andConditions.push({ status });
  }
  if (Number.isInteger(packageId) && packageId > 0) {
    andConditions.push({ packageId });
  }
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }
  const queryWhere = Object.keys(where).length > 0 ? where : undefined;

  const orders = await prisma.dispatchOrder.findMany({
    where: queryWhere,
    include: {
      createdBy: { select: { username: true, displayName: true } },
      claimedBy: { select: { username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = ["标题", "地址", "经度", "纬度", "单据状态", "照片/附件", "领取人", "领取时间", "创建人", "创建时间"];

  const rows = orders.map((item) => [
    item.title,
    item.address || "",
    item.longitude ?? "",
    item.latitude ?? "",
    statusLabel[item.status] ?? item.status,
    item.photoUrl || "",
    item.claimedBy ? `${item.claimedBy.displayName}(${item.claimedBy.username})` : "",
    item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : "",
    `${item.createdBy.displayName}(${item.createdBy.username})`,
    new Date(item.createdAt).toLocaleString("zh-CN"),
  ]);

  if (format === "xlsx") {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "单据列表");
    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(xlsxBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dispatch-orders-${Date.now()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = [headers, ...rows].map((line) => line.map(escapeCsv).join(",")).join("\n");
  const csvWithBom = `\uFEFF${csv}`;

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dispatch-orders-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
