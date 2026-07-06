"use client";

import Link from "next/link";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import {
  apiFolderStatusToUi,
  getFolderClientName,
  getFolderCoverUrl,
  folderCoverObjectPositionStyle,
  type ApiFolder,
} from "@/lib/folders-api";
import { cn } from "@/lib/utils";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

function statusPill(folder: ApiFolder) {
  const s = apiFolderStatusToUi(folder.status);
  if (s === "COMPLETED") {
    return (
      <span className="rounded-md bg-emerald-500/95 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
        Done
      </span>
    );
  }
  if (s === "SELECTION_PENDING") {
    return (
      <span className="rounded-md bg-amber-500/95 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
        Selecting
      </span>
    );
  }
  return (
    <span className="rounded-md border border-white/30 bg-black/35 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
      Draft
    </span>
  );
}

export function FolderCard({
  folder,
  clientNameById,
  onEdit,
  onDelete,
  busy,
}: {
  folder: ApiFolder;
  clientNameById?: Map<string, string>;
  onEdit?: (folder: ApiFolder) => void;
  onDelete?: (folder: ApiFolder) => void | Promise<void>;
  busy?: boolean;
}) {
  const clientName = getFolderClientName(folder, clientNameById);
  const cover = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
  const created = folder.createdAt
    ? new Date(folder.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const eventTitle = folder.eventName?.trim() || clientName;
  const subline = folder.eventName?.trim() ? clientName : folder.description || "—";

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-zinc-900/[0.02] transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-zinc-300/80 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] hover:ring-zinc-900/[0.05]",
        "dark:border-zinc-800/80 dark:bg-zinc-950 dark:ring-white/[0.03] dark:hover:border-zinc-700 dark:hover:shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)]",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <div className="relative">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          className="relative block aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
            style={folderCoverObjectPositionStyle(folder)}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/50 via-zinc-950/5 to-transparent opacity-70 transition-opacity duration-200 group-hover:opacity-90" />
        </Link>

        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10">
          <span className="pointer-events-auto">{statusPill(folder)}</span>
        </div>

        <div className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-zinc-600 opacity-0 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-200">
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </div>

        {(onEdit || onDelete) ? (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
            {onEdit ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-zinc-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Edit gallery"
                title="Edit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit(folder);
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}

            {onDelete ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow-sm backdrop-blur-sm transition hover:bg-red-50 dark:bg-zinc-900/90 dark:text-red-400 dark:hover:bg-red-950/60"
                aria-label="Move gallery to trash"
                title="Move to trash"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (busy) return;
                  if (!window.confirm(`Move gallery "${eventTitle}" to trash? You can restore it from Trash before the deadline.`)) return;
                  void onDelete(folder);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-3 py-2.5">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          className="block min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
              {eventTitle}
            </h2>
            <span className="shrink-0 text-[10px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
              {created}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p>
        </Link>
      </div>
    </article>
  );
}
