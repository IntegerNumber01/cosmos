import { NextRequest, NextResponse } from "next/server";
import { findObservations } from "@/lib/engine/observations";
import { CACHE_SCHEMA, ENGINE_VERSION, RELEASE, validCoordinates, validSize } from "@/lib/engine/releases";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ra = Number(p.get("ra") ?? NaN);
  const dec = Number(p.get("dec") ?? NaN);
  const size = Number(p.get("size") ?? 0.1);
  if (!validCoordinates(ra, dec) || !validSize(size)) {
    return NextResponse.json({ error: "Give RA and Dec in decimal degrees." }, { status: 400 });
  }
  try {
    const frames = await findObservations(ra, dec, 30, size);
    return NextResponse.json(
      {
        target: { ra, dec },
        schema: CACHE_SCHEMA,
        engine: ENGINE_VERSION,
        release: RELEASE.id,
        fieldSize: size,
        source: `IRSA SIA2, collection ${RELEASE.collection}`,
        queried: new Date().toISOString(),
        note: "Wavelength at the target is estimated from each frame's footprint and the detector's WCS-WAVE table (about ±0.001 µm). The exact value comes from each cutout's own header.",
        frames,
      },
      { headers: { "Cache-Control": p.get("refresh") === "1" ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
