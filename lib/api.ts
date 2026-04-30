export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

function uploadsProxyHostSet(): Set<string> {
  const set = new Set<string>(["api.gidophotography.com"]);
  const extra = process.env.NEXT_PUBLIC_UPLOADS_PROXY_HOSTS;
  if (extra) {
    for (const h of extra.split(",")) {
      const t = h.trim().toLowerCase();
      if (t) set.add(t);
    }
  }
  return set;
}

/**
 * If the URL points at an API host under `/uploads`, return same-origin `/uploads/...`
 * so Next.js can proxy to `BACKEND_API_URL` (see `app/uploads/[...path]/route.ts`).
 * Leaves other absolute URLs unchanged.
 */
export function sameOriginUploadsUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  if (raw.startsWith("/uploads/")) return raw;
  if (raw === "/uploads") return raw;
  const noProto = raw.replace(/^\.?\/*/, "");
  if (/^uploads\//i.test(noProto) && !raw.includes("://")) {
    return `/${noProto}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  const host = parsed.hostname.toLowerCase();
  if (uploadsProxyHostSet().has(host) && parsed.pathname.startsWith("/uploads")) {
    return `${parsed.pathname}${parsed.search}`;
  }
  return raw;
}

/**
 * Build API URLs for fetch(). Default empty base = same-origin `/api/...` so Next.js
 * rewrites proxy to BACKEND_API_URL (see next.config.ts) — avoids browser CORS when
 * developing on localhost. Set NEXT_PUBLIC_API_URL only if you intentionally call the
 * API host directly (requires API CORS).
 */
export function apiUrl(path: string) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}
