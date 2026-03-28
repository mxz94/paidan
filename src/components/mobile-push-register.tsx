"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";

async function postToken(token: string) {
  await fetch("/api/mobile/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      platform: "android",
    }),
  }).catch(() => null);
}

export function MobilePushRegister() {
  const router = useRouter();
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const init = async () => {
      const check = await PushNotifications.checkPermissions();
      let receive = check.receive;
      if (receive !== "granted") {
        const req = await PushNotifications.requestPermissions();
        receive = req.receive;
      }
      if (receive !== "granted") {
        return;
      }

      await PushNotifications.removeAllListeners();

      await PushNotifications.addListener("registration", (token) => {
        void postToken(token.value);
      });

      await PushNotifications.addListener("registrationError", (error) => {
        console.error("push registration error", error);
      });

      await PushNotifications.addListener("pushNotificationReceived", (_notification: PushNotificationSchema) => {
        // Keep native tray behavior; no in-app banner needed now.
      });

      await PushNotifications.addListener("pushNotificationActionPerformed", (event: ActionPerformed) => {
        const tab = String(event.notification.data?.tab ?? "new");
        const orderId = String(event.notification.data?.orderId ?? "").trim();
        if (orderId) {
          router.push(`/mobile?tab=${encodeURIComponent(tab)}&orderId=${encodeURIComponent(orderId)}`);
          return;
        }
        router.push(`/mobile?tab=${encodeURIComponent(tab)}`);
      });

      await PushNotifications.register();
    };

    void init();
  }, [router]);

  return null;
}
