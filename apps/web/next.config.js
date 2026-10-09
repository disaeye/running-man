/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // This host has 3.7GB RAM total. Keep build-time memory in check so
    // `next build` does not OOM: webpackMemoryOptimizations lowers peak
    // memory (slightly slower builds), memoryBasedWorkersCount scales
    // parallel workers with free memory.
    webpackMemoryOptimizations: true,
    memoryBasedWorkersCount: true,
  },
  async headers() {
    // HTML documents and RSC payloads are served from the same URL with
    // different Vary variants (rsc, next-router-prefetch, ...). CDNs that
    // ignore those Vary headers (e.g. EdgeOne) cache one variant and serve
    // it for the other, so a /login navigation can receive a RSC Flight
    // payload instead of HTML. Mark document responses uncacheable so the
    // CDN always revalidates against the origin. Static assets under
    // /_next/static keep their default immutable caching.
    return [
      {
        source: "/((?!_next/static|_next/image|favicon\\.ico).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    // Backend is reached via server-side rewrite (same-origin from the
    // browser's perspective), so prefer the private server-only API_URL and
    // avoid baking the backend address into the client bundle. NEXT_PUBLIC_API_URL
    // is kept as a fallback for the existing systemd deployment's .env.
    const backend = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:18000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/auth/:path*", destination: `${backend}/auth/:path*` },
      { source: "/webhooks/:path*", destination: `${backend}/webhooks/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: "/activities", destination: "/calendar?view=list", permanent: true },
      { source: "/plan", destination: "/calendar", permanent: true },
      { source: "/calendar/full", destination: "/calendar", permanent: true },
      { source: "/health", destination: "/analysis?tab=load", permanent: true },
      { source: "/trends", destination: "/analysis?tab=load", permanent: true },
      { source: "/data", destination: "/settings?section=data", permanent: true },
      { source: "/export", destination: "/settings?section=data", permanent: true },
      { source: "/strength", destination: "/calendar?view=strength", permanent: true },
      { source: "/strength/analytics", destination: "/calendar?view=strength", permanent: true },
      { source: "/performance", destination: "/analysis?tab=performance", permanent: true },
      { source: "/gear", destination: "/settings", permanent: true },
      { source: "/library", destination: "/settings", permanent: true },
    ];
  },
};

module.exports = nextConfig;
