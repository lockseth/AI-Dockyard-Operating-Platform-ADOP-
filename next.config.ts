import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Matches MAX_FILE_SIZE_BYTES in src/lib/cash-import/constants.ts (15MB)
    // with headroom — Next's 1MB server action default would otherwise
    // reject a valid cash-report upload before the parser ever sees it.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
