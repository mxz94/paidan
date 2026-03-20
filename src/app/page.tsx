import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { accessMode: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.accessMode === "MOBILE") {
    redirect("/mobile");
  }

  redirect("/dashboard");
}
