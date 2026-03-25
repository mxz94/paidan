import { prisma } from "@/lib/prisma";
import { getSystemConfigValues, SYSTEM_CONFIG_KEYS } from "@/lib/system-config";

type TriggerSource = "cron" | "manual";
type Scenario = "pending_24h" | "sales_72h_overdue" | "sales_72h_noop";

type AutoTransferSummary = {
  source: TriggerSource;
  now: string;
  pendingToSupervisorCount: number;
  salesOverdueToSupervisorCount: number;
  salesNoopOverdueToSupervisorCount: number;
  skippedNoSupervisorCount: number;
  notifySentCount: number;
  notifyFailedCount: number;
  details: Array<{ orderId: number; scenario: Scenario; supervisorId: number }>;
};

type DingNotifyPayload = {
  title: string;
  lines: string[];
  atMobile?: string;
};

function isPhoneLike(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().replace(/^(\+?86)/, "");
  return /^1\d{10}$/.test(normalized);
}

function normalizePhone(value: string) {
  return value.trim().replace(/^(\+?86)/, "");
}

function resolveBaseUrl(fallbackOrigin?: string) {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    fallbackOrigin ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

async function sendDingTalkWebhook(webhookUrl: string, payload: DingNotifyPayload) {
  const text = payload.lines.join("\n");
  const atMobiles = payload.atMobile && isPhoneLike(payload.atMobile) ? [normalizePhone(payload.atMobile)] : [];
  const body = {
    msgtype: "markdown",
    markdown: {
      title: payload.title,
      text,
    },
    at: {
      atMobiles,
      isAtAll: false,
    },
  };

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`webhook http ${resp.status}`);
  }
}

async function transferToSupervisor(params: {
  orderId: number;
  tenantId: number;
  fromClaimedById: number | null;
  supervisorId: number;
  remark: string;
}) {
  const { orderId, tenantId, fromClaimedById, supervisorId, remark } = params;
  const where =
    fromClaimedById == null
      ? {
          id: orderId,
          tenantId,
          isDeleted: false,
          status: "PENDING" as const,
          claimedById: null,
        }
      : {
          id: orderId,
          tenantId,
          isDeleted: false,
          status: "CLAIMED" as const,
          claimedById: fromClaimedById,
        };

  const updated = await prisma.dispatchOrder.updateMany({
    where,
    data: {
      status: "CLAIMED",
      claimedById: supervisorId,
      claimedAt: new Date(),
    },
  });

  if (updated.count > 0) {
    await prisma.dispatchOrderRecord.create({
      data: {
        orderId,
        operatorId: supervisorId,
        tenantId,
        actionType: "AUTO_TRANSFER",
        remark,
      },
    });
  }

  return updated.count > 0;
}

export async function runDispatchAutoTransfer(source: TriggerSource, baseOrigin?: string): Promise<AutoTransferSummary> {
  const now = new Date();
  const before24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const before72h = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const baseUrl = resolveBaseUrl(baseOrigin);

  const summary: AutoTransferSummary = {
    source,
    now: now.toISOString(),
    pendingToSupervisorCount: 0,
    salesOverdueToSupervisorCount: 0,
    salesNoopOverdueToSupervisorCount: 0,
    skippedNoSupervisorCount: 0,
    notifySentCount: 0,
    notifyFailedCount: 0,
    details: [],
  };

  const config = await getSystemConfigValues([SYSTEM_CONFIG_KEYS.webhookUrl]);
  const webhookUrl = (config.get(SYSTEM_CONFIG_KEYS.webhookUrl) ?? "").trim();

  const pendingOrders = await prisma.dispatchOrder.findMany({
    where: {
      isDeleted: false,
      status: "PENDING",
      claimedById: null,
      createdAt: { lte: before24h },
    },
    select: {
      id: true,
      tenantId: true,
      title: true,
      region: true,
      address: true,
      createdBy: {
        select: { storeId: true, displayName: true, username: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });

  const salesClaimedOverdue = await prisma.dispatchOrder.findMany({
    where: {
      isDeleted: false,
      status: "CLAIMED",
      appointmentAt: { not: null, lt: now },
      claimedAt: { lte: before72h },
      claimedBy: {
        is: {
          accessMode: "SALE",
          isDeleted: false,
          isDisabled: false,
        },
      },
    },
    select: {
      id: true,
      tenantId: true,
      title: true,
      region: true,
      address: true,
      appointmentAt: true,
      claimedBy: {
        select: {
          id: true,
          storeId: true,
          displayName: true,
          username: true,
        },
      },
      records: {
        where: { actionType: { not: "CLAIM" } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { appointmentAt: "asc" },
    take: 1000,
  });

  const allStorePairs = new Map<string, { tenantId: number; storeId: number }>();
  for (const item of pendingOrders) {
    if (item.createdBy.storeId) {
      allStorePairs.set(`${item.tenantId}_${item.createdBy.storeId}`, {
        tenantId: item.tenantId,
        storeId: item.createdBy.storeId,
      });
    }
  }
  for (const item of salesClaimedOverdue) {
    if (item.claimedBy?.storeId) {
      allStorePairs.set(`${item.tenantId}_${item.claimedBy.storeId}`, {
        tenantId: item.tenantId,
        storeId: item.claimedBy.storeId,
      });
    }
  }

  const pairs = Array.from(allStorePairs.values());
  const supervisors = pairs.length
    ? await prisma.user.findMany({
        where: {
          OR: pairs.map((x) => ({ tenantId: x.tenantId, storeId: x.storeId })),
          accessMode: "SUPERVISOR",
          isDeleted: false,
          isDisabled: false,
        },
        select: { id: true, tenantId: true, storeId: true, displayName: true, username: true },
        orderBy: { id: "asc" },
      })
    : [];

  const supervisorByStore = new Map<string, (typeof supervisors)[number]>();
  for (const item of supervisors) {
    if (!item.storeId) continue;
    const key = `${item.tenantId}_${item.storeId}`;
    if (!supervisorByStore.has(key)) {
      supervisorByStore.set(key, item);
    }
  }

  const doNotify = async (payload: DingNotifyPayload) => {
    if (!webhookUrl) return;
    try {
      await sendDingTalkWebhook(webhookUrl, payload);
      summary.notifySentCount += 1;
    } catch {
      summary.notifyFailedCount += 1;
    }
  };

  for (const order of pendingOrders) {
    const storeId = order.createdBy.storeId;
    if (!storeId) {
      summary.skippedNoSupervisorCount += 1;
      continue;
    }
    const supervisor = supervisorByStore.get(`${order.tenantId}_${storeId}`);
    if (!supervisor) {
      summary.skippedNoSupervisorCount += 1;
      continue;
    }

    const ok = await transferToSupervisor({
      orderId: order.id,
      tenantId: order.tenantId,
      fromClaimedById: null,
      supervisorId: supervisor.id,
      remark: `系统自动转单A：未领取超24小时，转交门店主管 ${supervisor.displayName || supervisor.username}`,
    });
    if (!ok) continue;

    summary.pendingToSupervisorCount += 1;
    summary.details.push({ orderId: order.id, scenario: "pending_24h", supervisorId: supervisor.id });

    const detailUrl = `${baseUrl}/dashboard/orders/${order.id}`;
    await doNotify({
      title: "自动转单A：未领取超24小时",
      atMobile: supervisor.username,
      lines: [
        "### 自动转单A通知",
        "- 规则：未领取超过24小时",
        `- 单据ID：${order.id}`,
        `- 标题：${order.title || "-"}`,
        `- 区域/地址：${(order.region || "-") + " " + (order.address || "")}`.trim(),
        `- 原创建人：${order.createdBy.displayName || order.createdBy.username}`,
        `- 接收主管：${supervisor.displayName || supervisor.username}`,
        `- 详情：[查看单据#${order.id}](${detailUrl})`,
      ],
    });
  }

  for (const order of salesClaimedOverdue) {
    const sale = order.claimedBy;
    const storeId = sale?.storeId;
    if (!sale || !storeId) {
      summary.skippedNoSupervisorCount += 1;
      continue;
    }

    const supervisor = supervisorByStore.get(`${order.tenantId}_${storeId}`);
    if (!supervisor) {
      summary.skippedNoSupervisorCount += 1;
      continue;
    }

    const noOperation = order.records.length === 0;
    const scenario: Scenario = noOperation ? "sales_72h_noop" : "sales_72h_overdue";
    const remark = noOperation
      ? `系统自动转单C：业务员领取后超72小时未操作且已过约定日期，转交门店主管 ${supervisor.displayName || supervisor.username}`
      : `系统自动转单B：业务员进行中单子过约定日期且超72小时，转交门店主管 ${supervisor.displayName || supervisor.username}`;

    const ok = await transferToSupervisor({
      orderId: order.id,
      tenantId: order.tenantId,
      fromClaimedById: sale.id,
      supervisorId: supervisor.id,
      remark,
    });
    if (!ok) continue;

    if (noOperation) {
      summary.salesNoopOverdueToSupervisorCount += 1;
    } else {
      summary.salesOverdueToSupervisorCount += 1;
    }
    summary.details.push({ orderId: order.id, scenario, supervisorId: supervisor.id });

    const detailUrl = `${baseUrl}/dashboard/orders/${order.id}`;
    const appointmentText = order.appointmentAt ? new Date(order.appointmentAt).toLocaleString("zh-CN") : "-";
    await doNotify({
      title: noOperation ? "自动转单C：领取后72小时未操作" : "自动转单B：进行中超时",
      atMobile: supervisor.username,
      lines: [
        noOperation ? "### 自动转单C通知" : "### 自动转单B通知",
        noOperation
          ? "- 规则：业务员领取后超过72小时未操作，且已过约定日期"
          : "- 规则：业务员进行中单子，过约定日期且超过72小时",
        `- 单据ID：${order.id}`,
        `- 标题：${order.title || "-"}`,
        `- 约定时间：${appointmentText}`,
        `- 原领取业务员：${sale.displayName || sale.username}`,
        `- 接收主管：${supervisor.displayName || supervisor.username}`,
        `- 详情：[查看单据#${order.id}](${detailUrl})`,
      ],
    });
  }

  return summary;
}
