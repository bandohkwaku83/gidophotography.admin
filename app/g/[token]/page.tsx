"use client";

import { useParams } from "next/navigation";
import { ClientGalleryApp } from "@/components/client/client-gallery-app";

export default function ClientGalleryPage() {
  const params = useParams();
  const raw = params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || typeof token !== "string") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-center dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">This gallery link is invalid.</p>
      </div>
    );
  }
  let safeToken = token;
  try {
    safeToken = decodeURIComponent(token);
  } catch {
    safeToken = token;
  }
  return <ClientGalleryApp key={safeToken} token={safeToken} />;
}
