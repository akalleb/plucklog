import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@": "./src",
    },
  },
  async rewrites() {
    const isProd = process.env.NODE_ENV === "production";
    const backendHostport = process.env.ALMOX_FASTAPI_HOSTPORT || (isProd ? "127.0.0.1:10000" : "");
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
