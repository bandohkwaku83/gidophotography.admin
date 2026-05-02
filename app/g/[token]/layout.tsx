import type { Metadata } from "next";
import { headers } from "next/headers";
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

/** Build `https://host` for server-side fetch and absolute `og:image` URLs. */
async function requestSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Open Graph / crawlers need an absolute image URL. */
function absoluteOgImageUrl(coverUrl: string | undefined, siteOrigin: string): string | undefined {
  if (!coverUrl?.trim()) return undefined;
  const c = coverUrl.trim();
  if (/^https?:\/\//i.test(c)) return c;
  const base = siteOrigin.replace(/\/$/, "");
  if (c.startsWith("/")) return `${base}${c}`;
  return `${base}/${c}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token: rawToken } = await params;
  const token = rawToken ? decodeToken(rawToken) : "";
  const siteOrigin = await requestSiteOrigin();

  let title = "Client gallery";
  let coverForOg: string | undefined;

  if (token) {
    try {
      const gallery = await getShareGallery(token, undefined, { baseOrigin: siteOrigin });
      const name = gallery.eventName?.trim();
      if (name) title = name;
      coverForOg = absoluteOgImageUrl(gallery.coverImageUrl, siteOrigin);
    } catch (e) {
      if (!(e instanceof ShareGalleryError)) {
        console.warn("[g/metadata] share fetch failed", e);
      }
    }
  }

  const description = CLIENT_GALLERY_OG_DESCRIPTION;
  const images = coverForOg ? [{ url: coverForOg, alt: title }] : undefined;

  return {
    metadataBase: new URL(siteOrigin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
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
