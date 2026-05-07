import type { Metadata } from "next";
import { buildClientGalleryLinkMetadata } from "@/lib/client-gallery-link-metadata";

/**
 * Legacy `/share/:code` links redirect to `/g/:token`, but bots may scrape this URL first.
 * Emit the same Open Graph payload (canonical still points at `/g/...`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code: rawToken } = await params;
  return buildClientGalleryLinkMetadata(rawToken ?? "");
}

export default function LegacyShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
