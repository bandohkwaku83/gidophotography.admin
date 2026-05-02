import type { Metadata } from "next";
import { headers } from "next/headers";
import { shareCoverOpenGraphAbsoluteUrl } from "@/lib/api";
import { getShareGallery, ShareGalleryError } from "@/lib/share-gallery-api";

/** Link preview description for shared client galleries (WhatsApp, iMessage, etc.). */
const CLIENT_GALLERY_OG_DESCRIPTION = "Photo collection by Gidophotography";

function decodeToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Public site origin for absolute URLs (OG image, canonical). Env wins so crawlers get a stable URL even when `Host` headers differ. */
async function publicSiteOrigin(): Promise<string> {
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token: rawToken } = await params;
  const token = rawToken ? decodeToken(rawToken) : "";
  const siteOrigin = await publicSiteOrigin();

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
        console.warn("[g/metadata] share fetch failed", e);
      }
    }
  }

  const description = CLIENT_GALLERY_OG_DESCRIPTION;
  const images = coverForOg
    ? [{ url: coverForOg, width: 1200, height: 630, alt: title }]
    : undefined;
  const baseNoSlash = siteOrigin.replace(/\/$/, "");
  const canonicalPath = rawToken ? `/g/${encodeURIComponent(rawToken)}` : "/g";

  return {
    title,
    description,
    alternates: { canonical: `${baseNoSlash}${canonicalPath}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseNoSlash}${canonicalPath}`,
      siteName: "Gidophotography",
      images,
    },
    twitter: {
      card: coverForOg ? "summary_large_image" : "summary",
      title,
      description,
      images: coverForOg ? [coverForOg] : undefined,
    },
  };
}

export default function ClientGalleryTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
