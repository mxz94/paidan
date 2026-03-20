"use client";

import { useEffect } from "react";

const SYNC_KEY = "user-location-sync-at";
const SYNC_INTERVAL = 5 * 60 * 1000;

function isMobileDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) || window.innerWidth <= 768;
}

export function MobileLocationSync() {
  useEffect(() => {
    if (!isMobileDevice() || !("geolocation" in navigator)) {
      return;
    }

    const lastSyncAt = Number(localStorage.getItem(SYNC_KEY) ?? "0");
    if (Date.now() - lastSyncAt < SYNC_INTERVAL) {
      return;
    }

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

          localStorage.setItem(SYNC_KEY, String(Date.now()));
        } catch {
          // Ignore sync failure to avoid blocking the UI.
        }
      },
      () => {
        // Ignore when user denies geolocation.
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  return null;
}
