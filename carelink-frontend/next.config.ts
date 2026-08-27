import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @carelink/shared ships untranspiled TypeScript source; Next.js needs to
  // be told to run it through its own compiler like the app's own code.
  transpilePackages: ["@carelink/shared"],
};

export default nextConfig;
