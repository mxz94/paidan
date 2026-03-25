import { NextRequest, NextResponse } from "next/server";
import { runDispatchAutoTransfer } from "@/lib/dispatch-auto-transfer";

export const dynamic = "force-dynamic";

function isApiEnabled() {
  return (process.env.ENABLE_CRON_HTTP_API || "").trim() === "1";
}

function isAuthorized(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return false;
  }
  const bearer = req.headers.get("authorization") || "";
  return bearer === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isApiEnabled()) {
    return NextResponse.json({ ok: false, message: "disabled" }, { status: 403 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDispatchAutoTransfer("cron", req.nextUrl.origin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "auto transfer failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isApiEnabled()) {
    return NextResponse.json({ ok: false, message: "disabled" }, { status: 403 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    hint: "Use POST to execute auto-transfer job.",
    endpoint: "/api/cron/dispatch-auto-transfer",
  });
}
