import { NextRequest, NextResponse } from "next/server";
import { fetchCutout } from "@/lib/engine/cutout";
import { validCoordinates, validSize } from "@/lib/engine/releases";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const url = p.get("url") ?? "";
  const ra = Number(p.get("ra") ?? NaN);
  const dec = Number(p.get("dec") ?? NaN);
  const size = Number(p.get("size") ?? 0.1);
  if (!validCoordinates(ra, dec) || !validSize(size)) return NextResponse.json({ error: "Invalid coordinates or field size (0.02–0.3 degrees)." }, { status: 400 });
  try {
    const buf = await fetchCutout(url, ra, dec, size);
    return new NextResponse(buf, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, s-maxage=2592000, immutable" },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
