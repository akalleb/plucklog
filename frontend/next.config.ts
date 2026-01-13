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
    const raw =
      process.env.ALMOX_FASTAPI_HOSTPORT ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "";

    const destBase = (() => {
      const base = String(raw || "").trim();
      if (!base) return "http://localhost:8000";
      if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
      return `http://${base.replace(/\/+$/, "")}`;
    })();

    return [
      {
        source: "/api/:path*",
        destination: `${destBase}/api/:path*`,
      },
      {
        source: "/docs",
        destination: `${destBase}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${destBase}/openapi.json`,
      },
      {
        source: "/redoc",
        destination: `${destBase}/redoc`,
      },
    ];
  },
};

export default nextConfig;
