import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @carelink/shared ships untranspiled TypeScript source; Next.js needs to
  // be told to run it through its own compiler like the app's own code.
  transpilePackages: ["@carelink/shared"],

  // Every /staff/* page is authenticated, per-caregiver content — it must
  // never be cached by Vercel's shared CDN. Without this, a page with no
  // server-side data fetching (like /staff, prerendered as a static
  // asset) is eligible for the same edge cache a public marketing page
  // would get. If cache invalidation for one edge region ever lagged
  // behind a fresh deploy, a caregiver routed through that region could
  // keep being served an old build indefinitely, even though every other
  // region — and every direct server check — already shows the current
  // one. `private, no-store` means every request goes to origin fresh:
  // never shared-cached, always the live deployment.
  async headers() {
    return [
      {
        source: "/staff/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
