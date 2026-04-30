"use client";

import Link from "next/link";
import { Pencil, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  apiFolderStatusToUi,
  getFolderClientName,
  getFolderCoverUrl,
  getFolderShareUrl,
  type ApiFolder,
} from "@/lib/folders-api";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

function statusPill(folder: ApiFolder) {
  const s = apiFolderStatusToUi(folder.status);
  if (s === "COMPLETED") {
    return (
      <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
        Done
      </span>
    );
  }
  if (s === "SELECTION_PENDING") {
    return (
      <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
        Selecting
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ring-1 ring-white/25 backdrop-blur-sm">
      Draft
    </span>
  );
}

export function FolderCard({
  folder,
  shareBaseUrl,
  clientNameById,
  onEdit,
  onDelete,
  busy,
}: {
  folder: ApiFolder;
  shareBaseUrl: string;
  clientNameById?: Map<string, string>;
  onEdit?: (folder: ApiFolder) => void;
  onDelete?: (folder: ApiFolder) => void | Promise<void>;
  busy?: boolean;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const clientName = getFolderClientName(folder, clientNameById);
  const cover = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
  const created = folder.createdAt
    ? new Date(folder.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const sharePath = getFolderShareUrl(folder);
  const shareEnabled = folder.share?.enabled !== false && Boolean(sharePath);
  const link =
    sharePath && shareBaseUrl
      ? `${shareBaseUrl.replace(/\/$/, "")}${sharePath}`
      : `${shareBaseUrl}/g/${folder._id}`;

  const eventTitle = folder.eventName?.trim() || clientName;
  const subline = folder.eventName?.trim() ? clientName : folder.description || "—";

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      showToast("Could not copy link.", "error");
    }
  }

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-zinc-900/[0.03] transition-shadow duration-200 hover:shadow-md hover:ring-zinc-900/[0.06] dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/[0.04]",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <div className="relative">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          className="relative block aspect-[5/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
          <span className="pointer-events-auto">{statusPill(folder)}</span>
        </div>

        {copied ? (
          <div className="absolute right-3 top-3 z-20 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-emerald-300 dark:ring-zinc-700">
            Copied
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-end gap-1 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-2 pb-2.5 pt-10">
          {shareEnabled ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white shadow-sm backdrop-blur-sm transition hover:bg-white/35"
              aria-label="Copy share link"
              title="Copy share link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void copyLink();
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}

          {onEdit ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white shadow-sm backdrop-blur-sm transition hover:bg-white/35"
              aria-label="Edit gallery"
              title="Edit"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(folder);
              }}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-red-200 shadow-sm backdrop-blur-sm transition hover:bg-red-500/90 hover:text-white"
              aria-label="Delete gallery"
              title="Delete"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (busy) return;
                if (!window.confirm(`Delete gallery "${eventTitle}"?`)) return;
                void onDelete(folder);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col border-t border-zinc-100 p-4 dark:border-zinc-800/80">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          className="block min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
        >
          <h2 className="truncate text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            {eventTitle}
          </h2>
          <p className="mt-1 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{subline}</p>
        </Link>
        <p className="mt-3 text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
          {created}
        </p>
      </div>
    </article>
  );
}
