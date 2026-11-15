import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Pages are prerendered. The /api routes proxy and parse NASA/IPAC IRSA data (SIA2 + IBE cutouts) and
// catalogue lookups on the server, because those services don't send CORS headers.
const nextConfig = (phase: string): NextConfig => ({
  images: { unoptimized: true },
  // lets a dev server and a production build run side by side without clobbering each other
  distDir: process.env.NEXT_DIST_DIR ?? (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-build"),
});

export default nextConfig;
