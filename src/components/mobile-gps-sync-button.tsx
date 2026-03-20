"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function MobileGpsSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const syncLocation = () => {
    if (!("geolocation" in navigator)) {
      return;
    }

    startTransition(() => {
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
          router.refresh();
        },
        { timeout: 10000, maximumAge: 30000 },
      );
    });
  };

  return (
    <button
      type="button"
      onClick={syncLocation}
      disabled={pending}
      className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
    >
      {pending ? "定位中..." : "刷新定位"}
    </button>
  );
}
