import type { NextConfig } from "next";

// Fully static export: every page and data asset is prepared ahead of time, so the demo does not
// depend on live archive queries (only the SPHEREx HiPS tiles stream from IRSA in Explore).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
