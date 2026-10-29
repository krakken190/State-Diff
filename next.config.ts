import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read a synchronous local SQLite database; cache components would
  // prerender those reads at build time, so data pages opt into request-time
  // rendering via connection() instead.
  cacheComponents: false,
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
