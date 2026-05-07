import type { Metadata } from "next";
import { headers } from "next/headers";
import { shareCoverOpenGraphAbsoluteUrl } from "@/lib/api";
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

/** Public site origin for absolute URLs (OG image, canonical). Env wins so crawlers get a stable URL even when `Host` headers differ. */
export async function publicSiteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Open Graph / Twitter metadata for a client gallery. Always uses the canonical `/g/:token` URL
 * for `og:url` / canonical so previews match the primary gallery link even for legacy `/share/:code` routes.
 */
export async function buildClientGalleryLinkMetadata(rawToken: string): Promise<Metadata> {
  const token = rawToken ? decodeGalleryToken(rawToken) : "";
  const siteOrigin = await publicSiteOrigin();
  const baseNoSlash = siteOrigin.replace(/\/$/, "");

  let title = "Client gallery";
  let coverForOg: string | undefined;

  if (token) {
    try {
      const gallery = await getShareGallery(token, undefined, { baseOrigin: siteOrigin });
      const name = gallery.eventName?.trim();
      if (name) title = name;
      coverForOg = shareCoverOpenGraphAbsoluteUrl(gallery.coverImageUrl, siteOrigin);
    } catch (e) {
      if (!(e instanceof ShareGalleryError)) {
        console.warn("[gallery-link-metadata] share fetch failed", e);
      }
    }
  }

  const description = CLIENT_GALLERY_OG_DESCRIPTION;
  const canonicalPath = rawToken ? `/g/${encodeURIComponent(rawToken)}` : "/g";
  const canonical = `${baseNoSlash}${canonicalPath}`;

  const ogImageDef =
    coverForOg != null
      ? {
          url: coverForOg,
          secureUrl: coverForOg.startsWith("https://") ? coverForOg : undefined,
          width: 1200,
          height: 630,
          alt: title,
        }
      : undefined;

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
      images: ogImageDef ? [ogImageDef] : undefined,
    },
    twitter: {
      card: coverForOg ? "summary_large_image" : "summary",
      title,
      description,
      images: coverForOg ? [coverForOg] : undefined,
    },
  };
}
