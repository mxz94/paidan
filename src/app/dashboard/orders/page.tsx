import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import { ensureDispatchOrderBusinessColumns } from "@/lib/db-ensure";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithTenant, hasStoreDataScope, hasTenantDataScope, isTenantAdminRole } from "@/lib/tenant";
import { LUOYANG_REGION_TREE, getLuoyangTowns } from "@/lib/regions";
import { batchOperateDispatchOrders, deleteDispatchOrder } from "./actions";
import { OrderCreateModal } from "@/components/order-create-modal";
import { OrderListMapModal } from "@/components/order-list-map-modal";
import { OrderLocationMapButton } from "@/components/order-location-map-button";
import { OrderPhotoLightbox } from "@/components/order-photo-lightbox";
import { BatchSelectAllCheckbox } from "@/components/batch-select-all-checkbox";

type SearchParams = Promise<{
  created?: string;
  imported?: string;
  assigned?: string;
  assignedBatch?: string;
  deleted?: string;
  deletedBatch?: string;
  err?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
  district?: string;
  town?: string;
  createdById?: string;
  claimedById?: string;
  convertedById?: string;
  sortBy?: string;
  sortDir?: string;
  timeRange?: string;
  timeStart?: string;
  timeEnd?: string;
  timeout?: string;
}>;

const customerTypes = ["精准", "客服"];
const regionTree = [...LUOYANG_REGION_TREE];

const errorText: Record<string, string> = {
  invalid: "提交失败：请检查必填项（备注、约定时间可不填）及手机号格式。",
  file: "上传失败：单据照片不能超过 10MB。",
  edit_state: "仅未领取单据可编辑。",
  import_file: "请选择要导入的文件。",
  import_invalid: "导入失败：文件格式或数据内容不正确，请检查后重试。",
  import_limit: "导入失败：单次最多导入 500 条。",
  phone_once: "录入失败：同一手机号在当天只允许录入一次。",
  assign_perm: "无派单权限，请在角色管理中勾选“单据管理-派单按钮”。",
  assign_invalid: "派单失败：参数无效。",
  assign_user: "派单失败：请选择有效的移动端用户。",
  assign_state: "派单失败：仅未领取单据可派单。",
  delete_perm: "无删除权限，请在角色管理中勾选“单据管理-删除按钮”。",
  delete_state: "仅未领取单据可删除。",
};
const statusLabel: Record<string, string> = {
  PENDING: "未领取",
  CLAIMED: "已领取",
  DONE: "已办理",
  ENDED: "不办理",
};

function parseDateTime(value: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateBoundary(value: string, boundary: "start" | "end") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = parseDateTime(raw);
  if (!parsed) return null;
  if (raw.includes("T") || raw.includes(" ")) {
    return parsed;
  }
  const withBoundary = new Date(parsed);
  if (boundary === "start") {
    withBoundary.setHours(0, 0, 0, 0);
  } else {
    withBoundary.setHours(23, 59, 59, 999);
  }
  return withBoundary;
}

function parseTimeRangeInput(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return { start: null as Date | null, end: null as Date | null };
  const parts = raw.split(/\s*(?:~|～|至|到)\s*/).map((item) => item.trim()).filter(Boolean);
  const start = parseDateTime(parts[0] ?? "");
  const end = parseDateTime(parts[1] ?? "");
  return { start, end };
}

function formatDateTimeLocal(value: Date | null) {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatDateInput(value: Date | null) {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function customerTypeBadge(customerType: string, isImportant = false) {
  const text = (customerType || "").trim();
  if (!text) {
    return <span className="text-slate-400">-</span>;
  }
  if (text.includes("精准")) {
    const className = isImportant
      ? "inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-rose-500"
      : "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200";
    return (
      <span className={className}>
        <span className={`h-1.5 w-1.5 rounded-full ${isImportant ? "bg-white" : "bg-emerald-500"}`} />
        <span>精准</span>
      </span>
    );
  }
  if (text.includes("客服")) {
    const className = isImportant
      ? "inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-rose-500"
      : "inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200";
    return (
      <span className={className}>
        <span className={`h-1.5 w-1.5 rounded-full ${isImportant ? "bg-white" : "bg-blue-500"}`} />
        <span>客服</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      {text}
    </span>
  );
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

function buildPageItems(currentPage: number, totalPages: number) {
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i >= 1 && i <= totalPages) {
      pages.add(i);
    }
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i];
    if (i > 0 && value - sorted[i - 1] > 1) {
      items.push("ellipsis");
    }
    items.push(value);
  }
  return items;
}

type SortDir = "asc" | "desc";
type SortBy =
  | "id"
  | "title"
  | "address"
  | "customerType"
  | "location"
  | "status"
  | "photoUrl"
  | "storeName"
  | "createdBy"
  | "createdAt"
  | "claimedBy"
  | "claimedAt"
  | "convertedBy"
  | "convertedAt";

const ORDER_SORT_FIELDS: SortBy[] = [
  "id",
  "title",
  "address",
  "customerType",
  "location",
  "status",
  "photoUrl",
  "storeName",
  "createdBy",
  "createdAt",
  "claimedBy",
  "claimedAt",
  "convertedBy",
  "convertedAt",
];

function isSortBy(value: string): value is SortBy {
  return ORDER_SORT_FIELDS.includes(value as SortBy);
}

function getSortIcon(activeSortBy: SortBy, activeSortDir: SortDir, field: SortBy) {
  if (activeSortBy !== field) {
    return "↕";
  }
  return activeSortDir === "asc" ? "↑" : "↓";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await ensureDispatchOrderBusinessColumns();
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const me = await getSessionUserWithTenant();
  if (!me.tenantId) {
    redirect("/dashboard");
  }
  const isAdmin = isTenantAdminRole(me.role.code);
  const canViewTenantAll = hasTenantDataScope(me.role.code, me.role.dataScope);
  const keyword = String(params.keyword ?? "").trim();
  const status = String(params.status ?? "").trim();
  const timeout = String(params.timeout ?? "").trim();
  const district = String(params.district ?? "").trim();
  const town = String(params.town ?? "").trim();
  const createdByIdRaw = String(params.createdById ?? "").trim();
  const claimedByIdRaw = String(params.claimedById ?? "").trim();
  const convertedByIdRaw = String(params.convertedById ?? "").trim();
  const createdByFilter = Number(createdByIdRaw);
  const claimedByFilter = Number(claimedByIdRaw);
  const convertedByFilter = Number(convertedByIdRaw);
  const rawSortBy = String(params.sortBy ?? "").trim();
  const rawSortDir = String(params.sortDir ?? "").trim().toLowerCase();
  const timeRangeRaw = String(params.timeRange ?? "").trim();
  const timeStartRaw = String(params.timeStart ?? "").trim();
  const timeEndRaw = String(params.timeEnd ?? "").trim();
  const parsedTimeRange = parseTimeRangeInput(timeRangeRaw);
  const timeStart = parseDateBoundary(timeStartRaw, "start") ?? parsedTimeRange.start;
  const timeEnd = parseDateBoundary(timeEndRaw, "end") ?? parsedTimeRange.end;
  const timeStartValue = formatDateInput(timeStart);
  const timeEndValue = formatDateInput(timeEnd);
  const sortBy: SortBy = isSortBy(rawSortBy) ? rawSortBy : "createdAt";
  const sortDir: SortDir = rawSortDir === "asc" ? "asc" : "desc";
  const townOptions = district ? getLuoyangTowns(district) : [];

  const pageSize = Math.min(Math.max(Number(params.pageSize ?? 10), 10), 100);
  const page = Math.max(Number(params.page ?? 1), 1);

  const where: Prisma.DispatchOrderWhereInput = { tenantId: me.tenantId, isDeleted: false };
  if (!canViewTenantAll) {
    if (hasStoreDataScope(me.role.code, me.role.dataScope) && me.storeId) {
      where.OR = [
        { createdBy: { storeId: Number(me.storeId) } },
        { convertedToPreciseById: Number(session.user.id) },
      ];
    } else {
      where.createdById = Number(session.user.id);
    }
  }
  const andConditions: Array<Record<string, unknown>> = [];

  if (keyword) {
    andConditions.push({
      OR: [
        { title: { contains: keyword } },
        { address: { contains: keyword } },
        { phone: { contains: keyword } },
        {
          createdBy: {
            OR: [{ displayName: { contains: keyword } }, { username: { contains: keyword } }],
          },
        },
        {
          claimedBy: {
            is: {
              OR: [{ displayName: { contains: keyword } }, { username: { contains: keyword } }],
            },
          },
        },
        {
          convertedToPreciseBy: {
            is: {
              OR: [{ displayName: { contains: keyword } }, { username: { contains: keyword } }],
            },
          },
        },
      ],
    });
  }
  if (status) {
    andConditions.push({ status });
  }
  if (district || town) {
    const locationKeywords = [district, town].filter(Boolean);
    andConditions.push({
      OR: locationKeywords.flatMap((item) => [
        { region: { contains: item } },
        { address: { contains: item } },
      ]),
    });
  }
  if (Number.isInteger(createdByFilter) && createdByFilter > 0) {
    andConditions.push({ createdById: createdByFilter });
  }
  if (Number.isInteger(claimedByFilter) && claimedByFilter > 0) {
    andConditions.push({ claimedById: claimedByFilter });
  }
  if (Number.isInteger(convertedByFilter) && convertedByFilter > 0) {
    andConditions.push({ convertedToPreciseById: convertedByFilter });
  }
  if (timeout === "1") {
    andConditions.push({
      records: {
        some: {
          actionType: "AUTO_TRANSFER",
        },
      },
    });
  } else if (timeout === "0") {
    andConditions.push({
      records: {
        none: {
          actionType: "AUTO_TRANSFER",
        },
      },
    });
  }
  if (timeStart || timeEnd) {
    const timeRange = {
      ...(timeStart ? { gte: timeStart } : {}),
      ...(timeEnd ? { lte: timeEnd } : {}),
    };
    andConditions.push({
      OR: [
        { createdAt: timeRange },
        { claimedAt: timeRange },
        { convertedToPreciseAt: timeRange },
      ],
    });
  }
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const queryWhere = Object.keys(where).length > 0 ? where : undefined;
  const total = await prisma.dispatchOrder.count({ where: queryWhere });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const userWhere: Prisma.UserWhereInput = {
    tenantId: me.tenantId,
    isDeleted: false,
    isDisabled: false,
  };
  if (!canViewTenantAll) {
    if (hasStoreDataScope(me.role.code, me.role.dataScope) && me.storeId) {
      userWhere.storeId = Number(me.storeId);
    } else {
      userWhere.id = Number(session.user.id);
    }
  }
  const filterUsers = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, displayName: true, username: true },
    orderBy: [{ displayName: "asc" }, { username: "asc" }],
  });

  const packages = await prisma.package.findMany({
    where: { tenantId: me.tenantId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const orderBy: Prisma.DispatchOrderOrderByWithRelationInput[] = (() => {
    switch (sortBy) {
      case "id":
        return [{ id: sortDir }];
      case "title":
        return [{ title: sortDir }, { id: "desc" }];
      case "address":
        return [{ address: sortDir }, { id: "desc" }];
      case "customerType":
        return [{ customerType: sortDir }, { id: "desc" }];
      case "location":
        return [{ longitude: sortDir }, { latitude: sortDir }, { id: "desc" }];
      case "status":
        return [{ status: sortDir }, { id: "desc" }];
      case "photoUrl":
        return [{ photoUrl: sortDir }, { id: "desc" }];
      case "storeName":
        return [{ createdBy: { store: { name: sortDir } } }, { id: "desc" }];
      case "createdBy":
        return [{ createdBy: { displayName: sortDir } }, { id: "desc" }];
      case "claimedBy":
        return [{ claimedBy: { displayName: sortDir } }, { id: "desc" }];
      case "claimedAt":
        return [{ claimedAt: sortDir }, { id: "desc" }];
      case "convertedBy":
        return [{ convertedToPreciseBy: { displayName: sortDir } }, { id: "desc" }];
      case "convertedAt":
        return [{ convertedToPreciseAt: sortDir }, { id: "desc" }];
      case "createdAt":
      default:
        return [{ createdAt: sortDir }, { id: "desc" }];
    }
  })();

  const orders = await prisma.dispatchOrder.findMany({
    where: queryWhere,
    include: {
      createdBy: { select: { displayName: true, username: true, store: { select: { name: true } } } },
      claimedBy: { select: { displayName: true, username: true } },
      convertedToPreciseBy: { select: { displayName: true, username: true } },
      package: { select: { name: true, code: true } },
    },
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const mapOrders = await prisma.dispatchOrder.findMany({
    where: queryWhere,
    select: {
      id: true,
      title: true,
      address: true,
      longitude: true,
      latitude: true,
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const currentUser = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      role: {
        select: {
          code: true,
          roleMenus: {
            select: { menu: { select: { key: true } } },
          },
        },
      },
    },
  });
  const canAssign =
    false;
  const canDelete =
    (currentUser?.role.code ? isTenantAdminRole(currentUser.role.code) : false) ||
    currentUser?.role.roleMenus.some((item) => item.menu.key === "perm-order-delete-btn") ||
    false;

  const commonQuery = {
    page: currentPage,
    pageSize,
    keyword,
    status,
    timeout,
    district,
    town,
    createdById: createdByIdRaw,
    claimedById: claimedByIdRaw,
    convertedById: convertedByIdRaw,
    timeStart: timeStartValue,
    timeEnd: timeEndValue,
    sortBy,
    sortDir,
  };
  const sortQueryBase = {
    pageSize,
    keyword,
    status,
    timeout,
    district,
    town,
    createdById: createdByIdRaw,
    claimedById: claimedByIdRaw,
    convertedById: convertedByIdRaw,
    timeStart: timeStartValue,
    timeEnd: timeEndValue,
  };
  const getSortHref = (field: SortBy) =>
    `/dashboard/orders?${buildQuery({
      ...sortQueryBase,
      page: 1,
      sortBy: field,
      sortDir: sortBy === field && sortDir === "desc" ? "asc" : "desc",
    })}`;
  const pageItems = buildPageItems(currentPage, totalPages);
  const photoItems = orders
    .filter((item) => Boolean(item.photoUrl))
    .map((item) => ({ url: item.photoUrl as string, title: item.title || `单据#${item.id}` }));

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div>
          <h1 className="text-2xl font-bold">单据管理</h1>
        </div>

        {params.created === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">单据创建成功</p>
        ) : null}
        {Number(params.imported ?? 0) > 0 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            单据导入成功，共 {Number(params.imported)} 条
          </p>
        ) : null}
        {params.assigned === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            派单成功{Number(params.assignedBatch ?? 0) > 0 ? `，本次派单 ${Number(params.assignedBatch)} 条` : ""}
          </p>
        ) : null}
        {params.deleted === "1" ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            单据删除成功{Number(params.deletedBatch ?? 0) > 0 ? `，本次删除 ${Number(params.deletedBatch)} 条` : ""}
          </p>
        ) : null}
        {params.err ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorText[params.err] ?? "操作失败"}</p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <form className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
          <input type="hidden" name="pageSize" value={pageSize} />
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="sortDir" value={sortDir} />
          <input
            name="keyword"
            defaultValue={keyword}
            placeholder="关键字：标题/地址/手机号/创建人/领取人/转精准人"
            className="h-8 w-56 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          />
          <div className="flex h-8 w-[300px] shrink-0 items-center rounded-md border border-slate-300 bg-white px-1">
            <input
              name="timeStart"
              type="date"
              defaultValue={timeStartValue}
              className="h-6 w-[130px] rounded px-1 text-[11px] outline-none"
              aria-label="开始时间"
            />
            <span className="px-1 text-[11px] text-slate-400">~</span>
            <input
              name="timeEnd"
              type="date"
              defaultValue={timeEndValue}
              className="h-6 w-[130px] rounded px-1 text-[11px] outline-none"
              aria-label="结束时间"
            />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部状态</option>
            <option value="PENDING">未领取</option>
            <option value="CLAIMED">已领取</option>
            <option value="DONE">已办理</option>
            <option value="ENDED">不办理</option>
          </select>
          <select
            name="timeout"
            defaultValue={timeout}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">超时全部</option>
            <option value="1">超时过</option>
            <option value="0">未超时过</option>
          </select>
          <select
            name="district"
            defaultValue={district}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部区/县</option>
            {regionTree.map((item) => (
              <option key={item.district} value={item.district}>
                {item.district}
              </option>
            ))}
          </select>
          <select
            name="town"
            defaultValue={town}
            className="h-8 w-36 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">全部镇/街道</option>
            {townOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            name="createdById"
            defaultValue={createdByIdRaw}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">创建人</option>
            {filterUsers.map((user) => (
              <option key={`created-${user.id}`} value={user.id}>
                {user.displayName || user.username}
              </option>
            ))}
          </select>
          <select
            name="claimedById"
            defaultValue={claimedByIdRaw}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">领取人</option>
            {filterUsers.map((user) => (
              <option key={`claimed-${user.id}`} value={user.id}>
                {user.displayName || user.username}
              </option>
            ))}
          </select>
          <select
            name="convertedById"
            defaultValue={convertedByIdRaw}
            className="h-8 w-28 shrink-0 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          >
            <option value="">转精准人</option>
            {filterUsers.map((user) => (
              <option key={`converted-${user.id}`} value={user.id}>
                {user.displayName || user.username}
              </option>
            ))}
          </select>
          <input type="hidden" name="page" value="1" />
          <button
            type="submit"
            className="h-8 shrink-0 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
          >
            筛选
          </button>
          <Link
            href={`/dashboard/orders?${buildQuery({ pageSize, sortBy, sortDir })}`}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold leading-none text-slate-700 transition hover:bg-slate-50"
          >
            重置
          </Link>
        </form>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <OrderListMapModal
              orders={mapOrders.map((item) => ({
                id: item.id,
                title: item.title,
                address: item.address || "",
                longitude: item.longitude,
                latitude: item.latitude,
              }))}
            />
          </div>
          <div className="ml-auto">
            <OrderCreateModal
              packages={packages}
              customerTypes={customerTypes}
              regionTree={regionTree}
              currentAccessMode={me.accessMode}
              action={async (formData) => {
                "use server";
                const { createDispatchOrder } = await import("./actions");
                await createDispatchOrder(formData);
              }}
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            共 {total} 条，当前第 {currentPage}/{totalPages} 页
          </div>
          <div className="text-xs text-slate-500">附件固定为缩略图展示（点击可查看原图）</div>
        </div>

        <form
          id="batch-operate-form"
          action={batchOperateDispatchOrders}
          className="mb-2 flex flex-wrap items-center gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="keyword" value={keyword} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="district" value={district} />
            <input type="hidden" name="town" value={town} />
            <input type="hidden" name="createdById" value={createdByIdRaw} />
            <input type="hidden" name="claimedById" value={claimedByIdRaw} />
            <input type="hidden" name="convertedById" value={convertedByIdRaw} />
            <input type="hidden" name="timeStart" value={timeStartValue} />
            <input type="hidden" name="timeEnd" value={timeEndValue} />
            <input type="hidden" name="pageSize" value={pageSize} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />
            {canAssign ? (
              null
            ) : null}
            {canDelete ? (
              <button
                type="submit"
                name="intent"
                value="delete"
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                批量删除
              </button>
            ) : null}
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="w-[64px] px-3 py-2 font-semibold">
                  <div className="flex items-center justify-center">
                    <BatchSelectAllCheckbox targetSelector=".batch-order-checkbox" />
                  </div>
                </th>
                <th className="w-[72px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("id")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    ID <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "id")}</span>
                  </Link>
                </th>
                <th className="w-[180px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("title")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    标题 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "title")}</span>
                  </Link>
                </th>
                <th className="w-[120px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("address")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    地址 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "address")}</span>
                  </Link>
                </th>
                <th className="w-[88px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("customerType")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    客户类型 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "customerType")}</span>
                  </Link>
                </th>
                <th className="w-[84px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("location")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    位置 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "location")}</span>
                  </Link>
                </th>
                <th className="w-[96px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("status")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    单据状态 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "status")}</span>
                  </Link>
                </th>
                <th className="w-[92px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("photoUrl")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    照片/附件 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "photoUrl")}</span>
                  </Link>
                </th>
                <th className="w-[110px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("storeName")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    门店 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "storeName")}</span>
                  </Link>
                </th>
                <th className="w-[100px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("createdBy")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    创建人 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "createdBy")}</span>
                  </Link>
                </th>
                <th className="w-[165px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("createdAt")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    创建时间 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "createdAt")}</span>
                  </Link>
                </th>
                <th className="w-[100px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("claimedBy")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    领取人 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "claimedBy")}</span>
                  </Link>
                </th>
                <th className="w-[165px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("claimedAt")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    领取时间 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "claimedAt")}</span>
                  </Link>
                </th>
                <th className="w-[100px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("convertedBy")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    转精准人 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "convertedBy")}</span>
                  </Link>
                </th>
                <th className="w-[165px] px-3 py-2 font-semibold">
                  <Link href={getSortHref("convertedAt")} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900">
                    转精准时间 <span className="text-xs text-slate-400">{getSortIcon(sortBy, sortDir, "convertedAt")}</span>
                  </Link>
                </th>
                <th className="w-[160px] px-3 py-2 font-semibold">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 text-center">
                    {(canDelete || canAssign) && item.status === "PENDING" ? (
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={item.id}
                        form="batch-operate-form"
                        className="batch-order-checkbox h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                      />
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{item.id}</td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.title}>
                      {item.title}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.address || "-"}>
                      {item.address || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{customerTypeBadge(item.customerType || "", item.isImportant)}</td>
                  <td className="px-3 py-3">
                    <OrderLocationMapButton
                      title={item.title}
                      address={item.address || ""}
                      longitude={item.longitude}
                      latitude={item.latitude}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {statusLabel[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.photoUrl ? (
                      <OrderPhotoLightbox
                        currentUrl={item.photoUrl}
                        currentTitle={item.title || `单据#${item.id}`}
                        photos={photoItems}
                      />
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.createdBy.store?.name || "-"}>
                      {item.createdBy.store?.name || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.createdBy.displayName || item.createdBy.username}>
                      {item.createdBy.displayName || item.createdBy.username}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate" title={new Date(item.createdAt).toLocaleString("zh-CN")}>
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.claimedBy ? item.claimedBy.displayName : ""}>
                      {item.claimedBy ? item.claimedBy.displayName : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate" title={item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : ""}>
                      {item.claimedAt ? new Date(item.claimedAt).toLocaleString("zh-CN") : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="truncate" title={item.convertedToPreciseBy?.displayName || "-"}>
                      {item.convertedToPreciseBy?.displayName || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div
                      className="truncate"
                      title={item.convertedToPreciseAt ? new Date(item.convertedToPreciseAt).toLocaleString("zh-CN") : "-"}
                    >
                      {item.convertedToPreciseAt ? new Date(item.convertedToPreciseAt).toLocaleString("zh-CN") : "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2 text-blue-600">
                      <Link href={`/dashboard/orders/${item.id}`}>详情</Link>
                      {item.status === "PENDING" && (isAdmin || item.createdById === Number(session.user.id)) ? (
                        <Link href={`/dashboard/orders/${item.id}/edit`}>编辑</Link>
                      ) : null}
                      {canDelete && item.status === "PENDING" ? (
                        <form action={deleteDispatchOrder}>
                          <input type="hidden" name="orderId" value={item.id} />
                          <button type="submit" className="text-rose-600">
                            删除
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-6 text-center text-slate-500">
                    暂无单据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <span>每页</span>
            <form className="inline-flex items-center gap-2">
              <input type="hidden" name="keyword" value={keyword} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="district" value={district} />
              <input type="hidden" name="town" value={town} />
              <input type="hidden" name="createdById" value={createdByIdRaw} />
              <input type="hidden" name="claimedById" value={claimedByIdRaw} />
              <input type="hidden" name="convertedById" value={convertedByIdRaw} />
              <input type="hidden" name="timeStart" value={timeStartValue} />
              <input type="hidden" name="timeEnd" value={timeEndValue} />
              <input type="hidden" name="sortBy" value={sortBy} />
              <input type="hidden" name="sortDir" value={sortDir} />
              <input type="hidden" name="page" value="1" />
              <select
                name="pageSize"
                defaultValue={String(pageSize)}
                className="h-8 w-24 rounded-md border border-slate-300 px-2 text-[11px] outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
              >
                <option value="10">10 条</option>
                <option value="20">20 条</option>
                <option value="30">30 条</option>
                <option value="50">50 条</option>
                <option value="100">100 条</option>
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                应用
              </button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: Math.max(1, currentPage - 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              上一页
            </Link>
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
                  ...
                </span>
              ) : (
                <Link
                  key={`page-${item}`}
                  href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: item })}`}
                  className={`rounded-lg border px-3 py-1.5 ${
                    item === currentPage
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item}
                </Link>
              ),
            )}
            <Link
              href={`/dashboard/orders?${buildQuery({ ...commonQuery, page: Math.min(totalPages, currentPage + 1) })}`}
              className={`rounded-lg border px-3 py-1.5 ${currentPage >= totalPages ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`}
            >
              下一页
            </Link>
          </div>
        </div>
      </article>
    </section>
  );
}

