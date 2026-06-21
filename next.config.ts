import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Mapbox GL JS worker — avoids the "worker" import error in Next.js
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Stub out the Mapbox worker in SSR (it runs only in browser)
      "mapbox-gl": "mapbox-gl/dist/mapbox-gl.js",
    };
    return config;
  },
};

export default nextConfig;
