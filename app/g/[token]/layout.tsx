import type { Metadata } from "next";
import { buildClientGalleryLinkMetadata } from "@/lib/client-gallery-link-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token: rawToken } = await params;
  return buildClientGalleryLinkMetadata(rawToken ?? "");
}

export default function ClientGalleryTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
