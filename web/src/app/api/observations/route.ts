import { NextRequest, NextResponse } from "next/server";
import { findObservations } from "@/lib/engine/observations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ra = Number(req.nextUrl.searchParams.get("ra"));
  const dec = Number(req.nextUrl.searchParams.get("dec"));
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) {
    return NextResponse.json({ error: "Give RA and Dec in decimal degrees." }, { status: 400 });
  }
  try {
    const frames = await findObservations(((ra % 360) + 360) % 360, dec);
    return NextResponse.json(
      {
        target: { ra, dec },
        source: "IRSA SIA2, collection spherex_dr1",
        queried: new Date().toISOString(),
        note: "Wavelength at the target is estimated from each frame's footprint and the detector's WCS-WAVE table (about ±0.001 µm). The exact value comes from each cutout's own header.",
        frames,
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
