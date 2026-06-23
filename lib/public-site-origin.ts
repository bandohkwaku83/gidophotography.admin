/** Header sent on API calls so the backend can build client gallery / SMS links. */
export const GALLERY_PUBLIC_ORIGIN_HEADER = "X-Gallery-Public-Origin";

const LOCALHOST_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function normalizeOrigin(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/\/+$/, "");
}

export function isLocalSiteOrigin(origin: string): boolean {
  return LOCALHOST_RE.test(normalizeOrigin(origin));
}

/**
 * Public site origin for client gallery links (SMS, clipboard, Open Graph).
 * Prefers `NEXT_PUBLIC_SITE_URL` so local admin dev still emits live client URLs.
 */
export function clientPublicSiteOrigin(fallbackOrigin = ""): string {
  const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv) return fromEnv;
  const fallback = normalizeOrigin(fallbackOrigin);
  return fallback || "http://localhost:3000";
}

/** Value to attach on authenticated API requests (uploads, SMS, share). */
export function galleryPublicOriginHeaderValue(fallbackOrigin = ""): string | null {
  const origin = clientPublicSiteOrigin(
    typeof window !== "undefined" ? window.location.origin : fallbackOrigin,
  );
  if (!origin) return null;
  const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv) return fromEnv;
  if (!isLocalSiteOrigin(origin)) return origin;
  return null;
}

/**
 * Best origin for absolute share URLs in the admin UI.
 * Env wins, then non-local URL from API `shareUrl`, then the current browser origin.
 */
export function resolveFolderShareOrigin(
  folder: { shareUrl?: string | null } | null | undefined,
  windowOrigin: string,
): string {
  const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv) return fromEnv;

  const apiShare = folder?.shareUrl?.trim();
  if (apiShare && /^https?:\/\//i.test(apiShare)) {
    try {
      const parsed = new URL(apiShare);
      if (!isLocalSiteOrigin(parsed.origin)) return parsed.origin;
    } catch {
      /* ignore */
    }
  }

  return clientPublicSiteOrigin(windowOrigin);
}
