"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  enabled: boolean;
};

const RUN_GUARD_KEY = "mobile_auto_location_refresh_at";
const RUN_GUARD_MS = 8000;

export function MobileAutoLocationRefresh({ enabled }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) {
      return;
    }

    const now = Date.now();
    const lastRunAt = Number(window.sessionStorage.getItem(RUN_GUARD_KEY) ?? "0");
    if (now - lastRunAt < RUN_GUARD_MS) {
      return;
    }
    window.sessionStorage.setItem(RUN_GUARD_KEY, String(now));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await fetch("/api/users/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              longitude: position.coords.longitude,
              latitude: position.coords.latitude,
            }),
          });
        } finally {
          router.refresh();
        }
      },
      () => {
        // Ignore when user denies geolocation.
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, [enabled, router]);

  return null;
}
