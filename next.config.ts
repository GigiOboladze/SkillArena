import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB - too small for a bug report with 2 screenshots
      // (capped at 3MB each server-side in src/lib/bug-reports.ts).
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Don't leak the current URL to third parties. This matters here
          // beyond the usual reasons: admin URLs embed student ids, and a
          // same-origin-only referrer keeps those out of any external request
          // made from an admin page.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app is never meant to be framed; this blocks clickjacking of
          // the admin surface and the live-game controls.
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers from MIME-sniffing. Relevant for
          // /attachments/[id], which streams user-uploaded image bytes with a
          // server-determined Content-Type (magic-byte sniffed, see
          // src/lib/bug-reports.ts) - sniffing could otherwise reinterpret
          // one of those as something executable.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No feature of this app uses these.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
