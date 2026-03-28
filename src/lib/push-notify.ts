import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { ensurePushDeviceTable } from "@/lib/db-ensure";

type PushTarget = {
  id: number;
  token: string;
  userId: number;
};

type SendPushInput = {
  tenantId: number;
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedServiceAccount: ServiceAccount | null = null;
let cachedAuthClient: GoogleAuth | null = null;

function toSafeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function loadServiceAccountFromEnv() {
  if (cachedServiceAccount) return cachedServiceAccount;

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const jsonPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "firebase-service-account.json");

  let raw = "";
  if (inlineJson) {
    raw = inlineJson;
  } else {
    try {
      raw = await readFile(jsonPath, "utf8");
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    const projectId = toSafeString(parsed.project_id).trim();
    const clientEmail = toSafeString(parsed.client_email).trim();
    const privateKey = toSafeString(parsed.private_key).trim();
    if (!projectId || !clientEmail || !privateKey) return null;
    cachedServiceAccount = {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
    return cachedServiceAccount;
  } catch {
    return null;
  }
}

async function getFcmAccessToken() {
  const serviceAccount = await loadServiceAccountFromEnv();
  if (!serviceAccount) return null;

  if (!cachedAuthClient) {
    cachedAuthClient = new GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }

  const client = await cachedAuthClient.getClient();
  const token = await client.getAccessToken();
  return token.token ?? null;
}

function isUnregisteredError(payload: unknown) {
  const text = JSON.stringify(payload ?? {});
  return text.includes("UNREGISTERED") || text.includes("registration-token-not-registered");
}

async function deactivateTokensByIds(ids: number[]) {
  if (ids.length <= 0) return;
  await ensurePushDeviceTable();
  const inClause = ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .join(",");
  if (!inClause) return;
  await prisma.$executeRawUnsafe(
    `UPDATE "PushDevice" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" IN (${inClause});`,
  );
}

async function listTargetsByUsers(tenantId: number, userIds: number[]) {
  if (userIds.length <= 0) return [] as PushTarget[];
  await ensurePushDeviceTable();
  const rows = (await prisma.$queryRaw`
    SELECT "id", "token", "userId"
    FROM "PushDevice"
    WHERE "tenantId" = ${tenantId}
      AND "isActive" = true
  `) as Array<{ id: number; token: string; userId: number }>;
  const userSet = new Set(userIds);
  return rows.filter((item) => userSet.has(item.userId));
}

export async function registerPushToken(input: {
  tenantId: number;
  userId: number;
  token: string;
  platform?: string;
}) {
  await ensurePushDeviceTable();
  const token = input.token.trim();
  if (!token) return;

  const existing = (await prisma.$queryRaw`
    SELECT "id"
    FROM "PushDevice"
    WHERE "token" = ${token}
    LIMIT 1
  `) as Array<{ id: number }>;

  if (existing.length > 0) {
    await prisma.$executeRaw`
      UPDATE "PushDevice"
      SET "tenantId" = ${input.tenantId},
          "userId" = ${input.userId},
          "platform" = ${input.platform ?? null},
          "isActive" = true,
          "updatedAt" = CURRENT_TIMESTAMP,
          "lastSeenAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing[0].id}
    `;
    return;
  }

  await prisma.$executeRaw`
    INSERT INTO "PushDevice"("tenantId", "userId", "token", "platform", "isActive", "createdAt", "updatedAt", "lastSeenAt")
    VALUES(${input.tenantId}, ${input.userId}, ${token}, ${input.platform ?? null}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
}

export async function sendPushToUsers(input: SendPushInput) {
  const serviceAccount = await loadServiceAccountFromEnv();
  if (!serviceAccount) {
    return { ok: false as const, reason: "missing_firebase_service_account" };
  }
  const accessToken = await getFcmAccessToken();
  if (!accessToken) {
    return { ok: false as const, reason: "missing_firebase_access_token" };
  }

  const targets = await listTargetsByUsers(input.tenantId, Array.from(new Set(input.userIds)));
  if (targets.length <= 0) {
    return { ok: true as const, sent: 0 };
  }

  const invalidTokenIds: number[] = [];
  let sent = 0;

  for (const target of targets) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: target.token,
            notification: {
              title: input.title,
              body: input.body,
            },
            data: input.data ?? {},
            android: {
              priority: "high",
              notification: {
                channel_id: "default",
                sound: "default",
              },
            },
          },
        }),
        cache: "no-store",
      },
    );

    if (response.ok) {
      sent += 1;
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (isUnregisteredError(payload)) {
      invalidTokenIds.push(target.id);
    }
  }

  await deactivateTokensByIds(invalidTokenIds);
  return { ok: true as const, sent };
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function notifyNearbyMobileUsersForOrder(input: {
  tenantId: number;
  orderId: number;
  title: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
  radiusKm?: number;
}) {
  const radiusKm = input.radiusKm ?? 5;
  const users = await prisma.user.findMany({
    where: {
      tenantId: input.tenantId,
      isDeleted: false,
      isDisabled: false,
      accessMode: { in: ["SALE", "SUPERVISOR"] },
    },
    select: {
      id: true,
      longitude: true,
      latitude: true,
    },
  });

  const targetIds =
    input.longitude == null || input.latitude == null
      ? users.map((u) => u.id)
      : users
          .filter((u) => u.longitude != null && u.latitude != null)
          .filter((u) => distanceKm(input.latitude!, input.longitude!, u.latitude!, u.longitude!) <= radiusKm)
          .map((u) => u.id);

  if (targetIds.length <= 0) return;

  await sendPushToUsers({
    tenantId: input.tenantId,
    userIds: targetIds,
    title: "附近有新单",
    body: `${input.title} · ${input.address}`,
    data: {
      kind: "new_order",
      orderId: String(input.orderId),
      tab: "new",
    },
  });
}
