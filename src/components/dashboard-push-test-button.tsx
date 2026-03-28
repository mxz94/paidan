"use client";

import { useState } from "react";

type ApiResult = {
  ok?: boolean;
  sent?: number;
  reason?: string;
  message?: string;
};

export function DashboardPushTestButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const resp = await fetch("/api/mobile/push/test", {
        method: "POST",
      });
      const data = (await resp.json().catch(() => ({}))) as ApiResult;
      if (!resp.ok) {
        setMessage(data.message || "测试失败");
        return;
      }
      if (data.ok) {
        setMessage(`测试已发送（${data.sent ?? 0}）`);
      } else {
        setMessage(data.reason || "测试失败");
      }
    } catch {
      setMessage("网络异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="cursor-pointer rounded-xl border border-emerald-300/60 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "发送中..." : "测试通知"}
      </button>
      {message ? <span className="text-xs text-cyan-100">{message}</span> : null}
    </div>
  );
}
