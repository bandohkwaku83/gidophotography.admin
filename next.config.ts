import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

/**
 * Directory that contains this config file (`gidostorage/`).
 * If a parent folder (e.g. `$HOME`) also has a `package-lock.json`, Next can
 * mis-detect the workspace root and serve 404s or mis-resolve routes in dev.
 */
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_API_URL = (
  process.env.BACKEND_API_URL ?? "https://api.gidophotography.com"
).replace(/\/$/, "");

function buildImageRemotePatterns(): RemotePattern[] {
  const map = new Map<string, RemotePattern>();
  const add = (p: RemotePattern) => {
    const k = `${p.protocol}|${p.hostname}|${p.port ?? ""}|${p.pathname}`;
    if (!map.has(k)) map.set(k, p);
  };

  const fromFullUrl = (raw?: string) => {
    const s = raw?.trim();
    if (!s) return;
    try {
      const u = new URL(s);
      add({
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/**",
      });
    } catch {
      /* ignore invalid env URL */
    }
  };

  fromFullUrl(BACKEND_API_URL);
  fromFullUrl(process.env.NEXT_PUBLIC_API_URL);
  fromFullUrl(process.env.NEXT_PUBLIC_SITE_URL);

  const proxies = process.env.NEXT_PUBLIC_UPLOADS_PROXY_HOSTS;
  if (proxies) {
    for (const part of proxies.split(",")) {
      const t = part.trim();
      if (!t) continue;
      if (/:\/\//.test(t)) fromFullUrl(t);
      else {
        const host = t.toLowerCase();
        add({ protocol: "https", hostname: host, pathname: "/**" });
        if (host === "localhost" || host === "127.0.0.1") {
          add({ protocol: "http", hostname: host, pathname: "/**" });
        }
      }
    }
  }

  const hasGido = [...map.values()].some((p) => p.hostname === "api.gidophotography.com");
  if (!hasGido) {
    add({ protocol: "https", hostname: "api.gidophotography.com", pathname: "/**" });
  }

  /* Absolute image URLs from S3 / CDN (e.g. gallery cover on client share). */
  add({
    protocol: "https",
    hostname: "gidophotography-images.s3.us-east-1.amazonaws.com",
    pathname: "/**",
  });

  const imageHosts = process.env.NEXT_PUBLIC_IMAGE_REMOTE_HOSTS;
  if (imageHosts) {
    for (const part of imageHosts.split(",")) {
      const t = part.trim();
      if (!t) continue;
      if (/:\/\//.test(t)) fromFullUrl(t);
      else add({ protocol: "https", hostname: t.toLowerCase(), pathname: "/**" });
    }
  }

  return [...map.values()];
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: PROJECT_ROOT,
  turbopack: {
    root: PROJECT_ROOT,
  },
  images: {
    remotePatterns: buildImageRemotePatterns(),
    formats: ["image/avif", "image/webp"],
  },
  /** LAN / alternate hostnames that may load the dev server (HMR, dev endpoints). */
  allowedDevOrigins: [
    "192.168.100.133",
    "http://192.168.100.133:3000",
    "http://192.168.100.133:3001",
    "192.168.100.20",
    "192.168.100.3",
    "192.168.100.22",

    "192.168.100.27",
    "192.168.100.27:3000",
    "192.168.100.27:3001",
    "http://192.168.100.27:3000",
    "http://192.168.100.27:3001",

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
