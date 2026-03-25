"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

function ping() {
  void fetch("/api/users/heartbeat", {
    method: "POST",
    keepalive: true,
    cache: "no-store",
  }).catch(() => {});
}

export function OnlineHeartbeat() {
  useEffect(() => {
    ping();

    const timer = window.setInterval(() => {
      ping();
    }, HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        ping();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

