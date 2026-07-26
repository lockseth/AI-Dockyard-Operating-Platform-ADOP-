import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // supabase/config.toml pins local Supabase (site_url, redirect URLs) to
  // 127.0.0.1, not localhost, specifically so this stack never collides
  // with another local Supabase project sharing the default host — dev
  // mode's HMR/asset origin check needs the same host allow-listed or
  // client-side hydration silently breaks when the app is opened via
  // 127.0.0.1 (forms/links stop working with no console error).
  allowedDevOrigins: ["127.0.0.1"],
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
