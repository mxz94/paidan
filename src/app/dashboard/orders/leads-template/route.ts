import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id || session.user.roleCode !== "ADMIN") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rows = [
    ["邀约日期", "邀约客服", "客户电话", "客户地址", "邀约见面时间", "号码类型"],
    ["3月12日", "王琪", "13849908623", "涧西武汉路", "三天内", "领手机（移动）"],
    ["3月13日", "杨小娟", "13837992362", "涧西武汉路", "三天后", "领手机（联通）"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "客资导入模板");
  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="order-lead-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
