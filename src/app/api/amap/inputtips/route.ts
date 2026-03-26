import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

type TipItem = { name: string; address: string; longitude?: number; latitude?: number };
type CacheEntry = { at: number; tips: TipItem[] };

const CACHE_TTL_MS = 60 * 1000;
const MIN_INTERVAL_MS = 1200;

const globalStore = globalThis as unknown as {
  __amapInputTipsCache?: Map<string, CacheEntry>;
  __amapInputTipsRate?: Map<string, number>;
};
const tipsCache = globalStore.__amapInputTipsCache ?? new Map<string, CacheEntry>();
const rateCache = globalStore.__amapInputTipsRate ?? new Map<string, number>();
globalStore.__amapInputTipsCache = tipsCache;
globalStore.__amapInputTipsRate = rateCache;

function resolveAmapWebKey() {
  return (
    process.env.AMAP_WEB_SERVICE_KEY ||
    process.env.AMAP_WEB_KEY ||
    process.env.NEXT_PUBLIC_AMAP_KEY ||
    process.env.VUE_APP_AMAP_KEY ||
    ""
  );
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const keyword = String(url.searchParams.get("keyword") ?? "").trim();
  if (keyword.length < 3) {
    return NextResponse.json({ ok: true, tips: [] as TipItem[] });
  }

  const userKey = String(session.user.id);
  const now = Date.now();

  const lastAt = rateCache.get(userKey) ?? 0;
  if (now - lastAt < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, tips: [] as TipItem[], throttled: true });
  }
  rateCache.set(userKey, now);

  const cacheKey = `${userKey}:${keyword}`;
  const cached = tipsCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, tips: cached.tips, cached: true });
  }

  const key = resolveAmapWebKey();
  const sig = process.env.AMAP_WEB_SERVICE_SIG || process.env.AMAP_WEB_SIG || "";
  if (!key) {
    return NextResponse.json({ ok: true, tips: [] as TipItem[] });
  }

  try {
    const query = new URLSearchParams({
      key,
      keywords: keyword,
      city: "洛阳",
      citylimit: "true",
      datatype: "all",
    });
    if (sig) {
      query.set("sig", sig);
    }
    const resp = await fetch(`https://restapi.amap.com/v3/assistant/inputtips?${query.toString()}`, {
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ ok: true, tips: [] as TipItem[] });
    }
    const json = (await resp.json()) as {
      status?: string;
      tips?: Array<{ name?: string; district?: string; address?: string; location?: string }>;
    };
    if (json.status !== "1") {
      return NextResponse.json({ ok: true, tips: [] as TipItem[] });
    }

    const tips: TipItem[] = (json.tips ?? [])
      .filter((tip) => (tip.name || "").trim())
      .slice(0, 8)
      .map((tip) => {
        const locationText = String(tip.location ?? "");
        const [lngText, latText] = locationText.split(",");
        const lng = Number(lngText);
        const lat = Number(latText);
        return {
          name: String(tip.name ?? "").trim(),
          address: `${String(tip.district ?? "").trim()}${String(tip.address ?? "").trim()}`.trim(),
          longitude: Number.isFinite(lng) ? lng : undefined,
          latitude: Number.isFinite(lat) ? lat : undefined,
        };
      });

    tipsCache.set(cacheKey, { at: now, tips });
    return NextResponse.json({ ok: true, tips });
  } catch {
    return NextResponse.json({ ok: true, tips: [] as TipItem[] });
  }
}
