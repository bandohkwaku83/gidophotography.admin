import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Force module resolution to the current app directory.
    root: process.cwd(),
  },
  /** LAN / alternate hostnames that may load the dev server (HMR, dev endpoints). */
  allowedDevOrigins: ["192.168.100.20", "192.168.100.3"],
};

export default nextConfig;
