import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAuthSession();

  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: Number(session.user.id) },
        select: {
          tenantId: true,
          role: { select: { roleMenus: { where: { menu: { key: "package-manage" } }, select: { menuId: true } } } },
        },
      })
    : null;
  if (!me || !me.tenantId || me.role.roleMenus.length === 0) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rows = [
    ["代码", "名称", "价格", "说明", "状态", "默认"],
    ["BASIC_99", "基础套餐", "99", "入门版示例", "启用", "否"],
    ["PRO_199", "进阶套餐", "199", "进阶版示例", "启用", "是"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "套餐导入模板");
  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="package-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
