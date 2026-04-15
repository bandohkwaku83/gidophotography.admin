"use client";

import Link from "next/link";
import { use } from "react";
import { ClientGalleryApp } from "@/components/client/client-gallery-app";
import { loadProjectByShareToken } from "@/lib/demo-data";

export default function ClientGalleryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const exists = loadProjectByShareToken(token);

  if (!exists) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Gallery not found</p>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          This link is not in the demo dataset. Try a sample link from the photographer dashboard.
        </p>
        <Link href="/" className="mt-6 text-sm font-semibold text-zinc-900 underline dark:text-zinc-100">
          Back to home
        </Link>
      </div>
    );
  }

  return <ClientGalleryApp key={token} token={token} />;
}
