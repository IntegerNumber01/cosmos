import type { NextConfig } from "next";

// Pages are prerendered. The /api routes proxy and parse NASA/IPAC IRSA data (SIA2 + IBE cutouts) and
// catalogue lookups on the server, because those services don't send CORS headers.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;
