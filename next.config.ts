import type { NextConfig } from "next";

const BACKEND_API_URL = (
  process.env.BACKEND_API_URL ?? "https://api.gidophotography.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    // Force module resolution to the current app directory.
    root: process.cwd(),
  },
  /** LAN / alternate hostnames that may load the dev server (HMR, dev endpoints). */
  allowedDevOrigins: [
    "192.168.100.20",
    "192.168.100.3",
    "192.168.100.22",

    // Accessing dev server from another device on LAN.
    "192.168.100.89",
    "192.168.100.89:3000",
    "192.168.100.89:3001",
    "http://192.168.100.89:3000",
    "http://192.168.100.89:3001",

    "192.168.100.25",
    "192.168.100.25:3000",
    "http://192.168.100.25:3000",
    "http://192.168.100.25:3001",

    "192.168.100.109",
    "192.168.100.109:3000",
    "192.168.100.109:3001",
    "http://192.168.100.109:3000",
    "http://192.168.100.109:3001",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_API_URL}/api/:path*`,
      },
      // `/uploads/*` is proxied by `app/uploads/[...path]/route.ts` (prefers filesystem over this rewrite).
    ];
  },
};

export default nextConfig;
