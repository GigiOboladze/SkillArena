import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB - too small for a bug report with 2 screenshots
      // (capped at 3MB each server-side in src/lib/bug-reports.ts).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
