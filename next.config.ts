import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/models/\\[id\\]/import-research": ["./research/**"],
  },
};

export default nextConfig;
