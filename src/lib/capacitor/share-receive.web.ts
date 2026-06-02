export type ShareReceivedPayload = {
  orderId: number;
  path: string;
  fileName: string;
  mimeType: string;
};

export interface ShareReceivePlugin {
  setPendingOrderId(options: { orderId: number }): Promise<void>;
  clearPendingOrderId(): Promise<void>;
  consumePendingShare(): Promise<ShareReceivedPayload | null>;
  readSharedFile(options: {
    path: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ base64: string; fileName: string; mimeType: string }>;
  addListener(
    eventName: "shareReceived",
    listenerFunc: (payload: ShareReceivedPayload) => void,
  ): Promise<{ remove: () => void }>;
}

export class ShareReceiveWeb implements ShareReceivePlugin {
  async setPendingOrderId() {}

  async clearPendingOrderId() {}

  async consumePendingShare() {
    return null;
  }

  async readSharedFile() {
    throw new Error("ShareReceive is only available in the Android app.");
  }

  async addListener() {
    return { remove: () => undefined };
  }
}
