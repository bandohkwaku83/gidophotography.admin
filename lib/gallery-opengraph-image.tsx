import { ImageResponse } from "next/og";
import sharp from "sharp";
import { decodeGalleryToken, publicSiteOrigin } from "@/lib/client-gallery-link-metadata";
import { getShareGallery, ShareGalleryError } from "@/lib/share-gallery-api";

/** Portrait 3:4 — matches how gallery covers read on mobile link previews. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 1600;

function fallbackOgPng(title: string): Response {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0c0f",
          color: "#fafafa",
          fontSize: 54,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          padding: 72,
          textAlign: "center",
        }}
      >
        {title.slice(0, 120)}
      </div>
    ),
    { width: OG_WIDTH, height: OG_HEIGHT },
  );
}

async function jpegFromRemoteCover(
  imageUrl: string,
  focal?: { x: number; y: number },
): Promise<Buffer | null> {
  const ctl = AbortSignal.timeout(12_000);
  const res = await fetch(imageUrl, { signal: ctl, cache: "no-store" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    const position =
      focal != null
        ? { left: Math.min(1, Math.max(0, focal.x / 100)), top: Math.min(1, Math.max(0, focal.y / 100)) }
        : sharp.strategy.attention;
    return await sharp(buf)
      .rotate()
      .resize(OG_WIDTH, OG_HEIGHT, {
        fit: "cover",
        position,
      })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * ~1200×1600 portrait JPEG for WhatsApp/iMessage/facebook crawlers — raw covers are often huge and
 * time out peer fetches → apps fall back to the web logo (`icon.png`).
 */
export async function galleryOpenGraphImageResponse(rawToken: string): Promise<Response> {
  const token = rawToken ? decodeGalleryToken(rawToken) : "";

  let coverUrl = "";
  let title = "Client gallery";
  let focal: { x: number; y: number } | undefined;

  if (token) {
    try {
      const origin = await publicSiteOrigin();
      const gallery = await getShareGallery(token, undefined, { baseOrigin: origin });
      title = gallery.eventName?.trim() || title;
      coverUrl = gallery.coverImageUrl?.trim() ?? "";
      if (gallery.coverFocalX != null || gallery.coverFocalY != null) {
        focal = {
          x: gallery.coverFocalX ?? 50,
          y: gallery.coverFocalY ?? 50,
        };
      }
    } catch (e) {
      if (!(e instanceof ShareGalleryError)) {
        console.warn("[gallery-opengraph-image] gallery load failed", e);
      }
    }
  }

  if (!coverUrl) return fallbackOgPng(title);

  const jpeg = await jpegFromRemoteCover(coverUrl, focal);
  if (!jpeg) return fallbackOgPng(title);

  const out = jpeg;
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
