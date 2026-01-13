import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@": "./src",
    },
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
  async rewrites() {
    const backendHostport = process.env.ALMOX_FASTAPI_HOSTPORT || "";
    if (!backendHostport) return [];

    return [
      {
        source: "/api/:path*",
        destination: `http://${backendHostport}/api/:path*`,
      },
      {
        source: "/docs",
        destination: `http://${backendHostport}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `http://${backendHostport}/openapi.json`,
      },
      {
        source: "/redoc",
        destination: `http://${backendHostport}/redoc`,
      },
    ];
  },
};

export default nextConfig;
