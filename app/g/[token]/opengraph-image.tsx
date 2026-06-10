import {
  galleryOpenGraphImageResponse,
  OG_HEIGHT,
  OG_WIDTH,
} from "@/lib/gallery-opengraph-image";

export const runtime = "nodejs";
export const alt = "Gallery cover";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return galleryOpenGraphImageResponse(token ?? "");
}
