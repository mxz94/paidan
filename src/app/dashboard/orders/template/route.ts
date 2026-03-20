import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { isTenantAdminRole } from "@/lib/tenant";

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id || !isTenantAdminRole(session.user.roleCode)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rows = [
    ["标题", "手机号", "区域", "地址", "经度", "纬度", "客户类型", "备注"],
    ["基础套餐", "13800138000", "洛龙区", "洛阳市洛龙区开元大道", "112.4540", "34.6197", "精准", "导入示例"],
    ["专业套餐", "13900139000", "西工区", "洛阳市西工区中州中路", "", "", "客服", "经纬度可留空自动编码"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "单据导入模板");
  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="order-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}


