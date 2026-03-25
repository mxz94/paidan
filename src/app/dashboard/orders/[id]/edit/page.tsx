import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderEditForm } from "@/components/order-edit-form";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LUOYANG_REGION_TREE } from "@/lib/regions";
import { getSessionUserWithTenant, hasTenantDataScope } from "@/lib/tenant";
import { updateDispatchOrder } from "../../actions";

type Params = Promise<{ id: string }>;

export default async function EditOrderPage({ params }: { params: Params }) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const me = await getSessionUserWithTenant();
  if (!me.tenantId && me.role.code !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const routeParams = await params;
  const orderId = Number(routeParams.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    notFound();
  }

  const canAll = hasTenantDataScope(me.role.code, me.role.dataScope);
  const where =
    canAll
      ? { id: orderId, isDeleted: false, ...(me.tenantId ? { tenantId: me.tenantId } : {}) }
      : { id: orderId, tenantId: Number(me.tenantId), createdById: Number(session.user.id), isDeleted: false };

  const [order, packages] = await Promise.all([
    prisma.dispatchOrder.findFirst({
      where,
      select: {
        id: true,
        packageId: true,
        region: true,
        address: true,
        longitude: true,
        latitude: true,
        phone: true,
        customerType: true,
        remark: true,
        status: true,
      },
    }),
    prisma.package.findMany({
      where: { isActive: true, ...(me.tenantId ? { tenantId: me.tenantId } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (!order) {
    notFound();
  }

  if (order.status !== "PENDING") {
    redirect(`/dashboard/orders/${order.id}`);
  }

  if (packages.length === 0) {
    redirect("/dashboard/orders?err=invalid");
  }

  const selectedPackageId = order.packageId ?? packages[0].id;
  const customerTypes = ["精准", "客服"];
  const regionTree = [...LUOYANG_REGION_TREE];

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">编辑单据</h1>
            <p className="mt-2 text-sm text-slate-600">仅未领取单据可编辑。</p>
          </div>
          <Link
            href={`/dashboard/orders/${order.id}`}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            返回详情
          </Link>
        </div>
      </header>

      <OrderEditForm
        orderId={order.id}
        detailHref={`/dashboard/orders/${order.id}`}
        selectedPackageId={selectedPackageId}
        phone={order.phone}
        customerType={order.customerType || ""}
        region={order.region || ""}
        address={order.address || ""}
        longitude={order.longitude}
        latitude={order.latitude}
        remark={order.remark || ""}
        packages={packages}
        customerTypes={customerTypes}
        regionTree={regionTree}
        action={updateDispatchOrder}
      />
    </section>
  );
}

