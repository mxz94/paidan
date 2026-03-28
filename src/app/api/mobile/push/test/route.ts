import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push-notify";
import { canAccessMobile } from "@/lib/user-access";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { id: true, tenantId: true, isDeleted: true, isDisabled: true, accessMode: true },
  });
  if (!user || user.isDeleted || user.isDisabled || !user.tenantId || !canAccessMobile(user.accessMode)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const result = await sendPushToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "测试通知",
    body: "推送链路已打通",
    data: {
      kind: "test",
      tab: "new",
    },
  });
  return NextResponse.json(result);
}
