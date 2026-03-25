import { runDispatchAutoTransfer } from "@/lib/dispatch-auto-transfer";

const HOUR_MS = 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __dispatch_auto_transfer_timer__: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __dispatch_auto_transfer_running__: boolean | undefined;
}

async function runOnce() {
  if (globalThis.__dispatch_auto_transfer_running__) {
    return;
  }
  globalThis.__dispatch_auto_transfer_running__ = true;
  try {
    const result = await runDispatchAutoTransfer("cron");
    console.log(
      `[dispatch-auto-transfer] done pending24h=${result.pendingToSupervisorCount} sales72h=${result.salesOverdueToSupervisorCount} sales72hNoop=${result.salesNoopOverdueToSupervisorCount} skipped=${result.skippedNoSupervisorCount} notifyOK=${result.notifySentCount} notifyFail=${result.notifyFailedCount}`,
    );
  } catch (error) {
    console.error("[dispatch-auto-transfer] failed", error);
  } finally {
    globalThis.__dispatch_auto_transfer_running__ = false;
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (globalThis.__dispatch_auto_transfer_timer__) {
    return;
  }

  // Start once shortly after boot, then execute hourly.
  setTimeout(() => {
    void runOnce();
  }, 20_000);

  globalThis.__dispatch_auto_transfer_timer__ = setInterval(() => {
    void runOnce();
  }, HOUR_MS);

  console.log("[dispatch-auto-transfer] scheduler started (every 1 hour)");
}
