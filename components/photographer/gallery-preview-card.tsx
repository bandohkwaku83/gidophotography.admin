"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  folderCoverObjectPositionStyle,
  getFolderClientName,
  getFolderCoverUrl,
  type ApiFolder,
} from "@/lib/folders-api";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

export function GalleryPreviewCard({
  folder,
  clientNameById,
}: {
  folder: ApiFolder;
  clientNameById?: Map<string, string>;
}) {
  const cover = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
  const clientName = getFolderClientName(folder, clientNameById);
  const updated = folder.updatedAt ?? folder.createdAt;
  const dateLabel = updated
    ? new Date(updated).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";

  const title = folder.eventName?.trim() || clientName;
  const sub = folder.eventName?.trim() ? clientName : folder.description || "—";

  return (
    <Link
      href={`/dashboard/folder/${folder._id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-zinc-900/[0.03] transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-900/[0.06] dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/[0.04]"
    >
      <div className="relative aspect-[5/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          style={folderCoverObjectPositionStyle(folder)}
        />
        <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-zinc-700 opacity-0 shadow-sm backdrop-blur-sm transition group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-200">
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-1 flex-col border-t border-zinc-100 p-3.5 dark:border-zinc-800/80">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </p>
          <p className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400">{dateLabel}</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
      </div>
    </Link>
  );
}
