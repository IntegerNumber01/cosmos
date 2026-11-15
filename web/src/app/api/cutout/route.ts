import { NextRequest, NextResponse } from "next/server";
import { fetchCutout } from "@/lib/engine/cutout";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const url = p.get("url") ?? "";
  const ra = Number(p.get("ra"));
  const dec = Number(p.get("dec"));
  const size = Math.min(0.3, Math.max(0.02, Number(p.get("size") ?? 0.1)));
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  try {
    const buf = await fetchCutout(url, ra, dec, size);
    return new NextResponse(buf, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, s-maxage=2592000, immutable" },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
