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
          role: { select: { roleMenus: { where: { menu: { key: "user-manage" } }, select: { menuId: true } } } },
        },
      })
    : null;
  if (!me || !me.tenantId || me.role.roleMenus.length === 0) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rows = [
    ["用户名", "姓名", "密码", "角色", "用户类型", "门店"],
    ["admin2", "管理员2", "123456", "管理员", "主管", "总部店"],
    ["mobile01", "业务员1", "123456", "业务员", "业务员", "总部店"],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "用户导入模板");
  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="user-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
