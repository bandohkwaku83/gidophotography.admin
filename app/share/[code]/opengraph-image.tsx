import {
  galleryOpenGraphImageResponse,
  OG_HEIGHT,
  OG_WIDTH,
} from "@/lib/gallery-opengraph-image";

export const runtime = "nodejs";
export const alt = "Gallery cover";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };

/** Same optimized JPEG as `/g/:token` so legacy `/share/:code` links get a workable preview asset. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return galleryOpenGraphImageResponse(code ?? "");
}
