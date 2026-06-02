import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { ShareReceivePlugin, ShareReceivedPayload } from "@/lib/capacitor/share-receive.web";

export type { ShareReceivedPayload };

export const ShareReceive = registerPlugin<ShareReceivePlugin>("ShareReceive", {
  web: () => import("@/lib/capacitor/share-receive.web").then((module) => new module.ShareReceiveWeb()),
});

export function isCapacitorNativeApp() {
  if (typeof window === "undefined") {
    return false;
  }
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export async function lockShareReceiveOrder(orderId: number) {
  if (!isCapacitorNativeApp()) {
    return;
  }
  await ShareReceive.setPendingOrderId({ orderId });
}

export async function clearShareReceiveOrderLock() {
  if (!isCapacitorNativeApp()) {
    return;
  }
  await ShareReceive.clearPendingOrderId();
}

export async function loadSharedAudioFile(payload: ShareReceivedPayload) {
  const result = await ShareReceive.readSharedFile({
    path: payload.path,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
  });
  const { base64ToFile } = await import("@/lib/audio-file");
  return base64ToFile(result.base64, result.fileName, result.mimeType);
}

export async function subscribeShareReceived(
  listener: (payload: ShareReceivedPayload) => void,
): Promise<PluginListenerHandle> {
  return ShareReceive.addListener("shareReceived", listener);
}

export async function consumePendingSharedAudio() {
  if (!isCapacitorNativeApp()) {
    return null;
  }
  const payload = await ShareReceive.consumePendingShare();
  if (!payload?.path) {
    return null;
  }
  const file = await loadSharedAudioFile(payload);
  return { payload, file };
}
