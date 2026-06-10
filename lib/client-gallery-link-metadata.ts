import type { Metadata } from "next";
import { headers } from "next/headers";
import { getShareGallery, ShareGalleryError } from "@/lib/share-gallery-api";

/** Link preview description for shared client galleries (WhatsApp, iMessage, etc.). */
export const CLIENT_GALLERY_OG_DESCRIPTION = "Photo collection by Gidophotography";

export function decodeGalleryToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.startsWith("127.") ||
    h.startsWith("192.168.") ||
    h.startsWith("10.")
  );
}

/**
 * Canonical public origin for link previews (`og:url`) and `/api/share` fetches.
 * Prefers **this request’s Host** (works for admin.* vs apex) while avoiding `http://` when the
 * public URL is effectively HTTPS (`x-forwarded-proto=http` edge → origin quirks).
 */
export async function publicSiteOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost =
    (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim().replace(/\/$/, "") ?? "";
  let origin: string | undefined;

  if (forwardedHost) {
    const rawProto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
    let proto =
      rawProto ||
      (isLocalHostname(forwardedHost) ? "http" : "https");
    // Edge/proxy occasionally forwards `proto=http` to the origin though the public URL is HTTPS.
    if (proto === "http" && !isLocalHostname(forwardedHost)) {
      proto = "https";
    }
    origin = `${proto}://${forwardedHost}`;
  }

  if (!origin) {
    const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    if (env) origin = env;
  }

  if (!origin && process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  if (!origin) origin = "http://localhost:3000";
  return origin;
}

/**
 * Open Graph / Twitter metadata for a client gallery. Canonical `/g/:token` stays on **this host**
 * (`admin.*` URLs keep `admin.*` in `og:url`). Actual preview **`og:image`** is served by
 * `opengraph-image.tsx` (JPEG, ~1200×1600 portrait, compact) — raw S3 covers are often multi‑MiB and
 * mobile link previews time out → fall back to the site logo.
 */
export async function buildClientGalleryLinkMetadata(rawToken: string): Promise<Metadata> {
  const token = rawToken ? decodeGalleryToken(rawToken) : "";
  const siteOrigin = await publicSiteOrigin();
  const baseNoSlash = siteOrigin.replace(/\/$/, "");

  let title = "Client gallery";
  let hasCoverArt = false;

  if (token) {
    try {
      const gallery = await getShareGallery(token, undefined, { baseOrigin: siteOrigin });
      const name = gallery.eventName?.trim();
      if (name) title = name;
      hasCoverArt = Boolean(gallery.coverImageUrl?.trim());
    } catch (e) {
      if (!(e instanceof ShareGalleryError)) {
        console.warn("[gallery-link-metadata] share fetch failed", e);
      }
    }
  }

  const description = CLIENT_GALLERY_OG_DESCRIPTION;
  const canonicalPath = rawToken ? `/g/${encodeURIComponent(rawToken)}` : "/g";
  const canonical = `${baseNoSlash}${canonicalPath}`;

  return {
    metadataBase: new URL(`${baseNoSlash}/`),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "Gidophotography",
    },
    twitter: {
      card: hasCoverArt ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}
