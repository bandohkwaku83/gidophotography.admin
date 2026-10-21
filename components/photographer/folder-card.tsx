"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import {
  apiFolderStatusToUi,
  folderCoverObjectPositionStyle,
  getFolderClientName,
  getFolderCoverUrl,
  type ApiFolder,
} from "@/lib/folders-api";
import { cn } from "@/lib/utils";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShootDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

function statusMeta(folder: ApiFolder): { label: string; dot: string; text: string } {
  const s = apiFolderStatusToUi(folder.status);
  if (s === "COMPLETED") {
    return { label: "Delivered", dot: "bg-studio-sage", text: "text-[#3E5C46]" };
  }
  if (s === "SELECTION_PENDING") {
    return { label: "Selecting", dot: "bg-studio-gold", text: "text-[#8A6A2F]" };
  }
  return { label: "Draft", dot: "bg-studio-taupe", text: "text-studio-taupe" };
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
  const cover = getFolderCoverUrl(folder);
  const title = folder.eventName?.trim() || "Untitled gallery";
  const shoot = formatShootDate(folder.eventDate || folder.createdAt || "");
  const frames = folder.totalRawMediaCount;
  const status = statusMeta(folder);

  return (
    <article className={cn("group", busy && "pointer-events-none opacity-60")}>
      <div className="relative">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          aria-label={`Open gallery ${title}`}
          className="relative block overflow-hidden rounded-[22px] bg-[#e6ddd0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-ink/30"
        >
          <div className="relative aspect-[3/4]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
                style={folderCoverObjectPositionStyle(folder)}
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,#f8f3ea,transparent_42%),linear-gradient(165deg,#cfc3b0_0%,#efe6d8_46%,#b7ab9a_100%)]" />
            )}
            <span className="pointer-events-none absolute top-3.5 left-3.5 h-3.5 w-3.5 border-t border-l border-white/90 drop-shadow-[0_1px_1px_rgba(26,22,18,0.45)]" />
            <span className="pointer-events-none absolute top-3.5 right-3.5 h-3.5 w-3.5 border-t border-r border-white/90 drop-shadow-[0_1px_1px_rgba(26,22,18,0.45)]" />
            <span className="pointer-events-none absolute bottom-16 left-3.5 h-3.5 w-3.5 border-b border-l border-white/90 drop-shadow-[0_1px_1px_rgba(26,22,18,0.45)]" />
            <span className="pointer-events-none absolute right-3.5 bottom-16 h-3.5 w-3.5 border-r border-b border-white/90 drop-shadow-[0_1px_1px_rgba(26,22,18,0.45)]" />
          </div>
        </Link>

        {onEdit || onDelete ? (
          <div className="absolute top-12 right-3 z-10 flex flex-col items-center gap-1 sm:opacity-0 sm:transition sm:duration-200 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {onEdit ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-studio-ink shadow-sm backdrop-blur-sm transition hover:bg-white"
                aria-label="Edit gallery"
                title="Edit"
                onClick={() => onEdit(folder)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-studio-burgundy shadow-sm backdrop-blur-sm transition hover:bg-[#F3E4E4]"
                aria-label="Move gallery to trash"
                title="Move to trash"
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  if (
                    !window.confirm(
                      `Move gallery "${title}" to trash? You can restore it from Trash before the deadline.`,
                    )
                  ) {
                    return;
                  }
                  void onDelete(folder);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 -mt-11 mx-3.5 rounded-2xl border border-white/70 bg-white/95 px-4 py-3.5 shadow-[0_14px_34px_rgba(26,22,18,0.1)] backdrop-blur-md transition duration-300 group-hover:-translate-y-0.5">
        <Link
          href={`/dashboard/folder/${folder._id}`}
          className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-ink/25"
        >
          <p className={cn("flex items-center gap-2 text-[10px] font-medium tracking-[0.22em] uppercase", status.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden />
            {status.label}
          </p>
          <h2 className="font-display mt-1 line-clamp-2 text-[1.2rem] leading-tight tracking-tight text-studio-ink">
            {title}
          </h2>
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-studio-line pt-2.5">
            <p className="min-w-0 truncate text-[13px] text-studio-charcoal">{clientName}</p>
            <p className="shrink-0 text-[11px] tracking-[0.14em] text-studio-taupe uppercase">
              {shoot}
              {typeof frames === "number" && frames > 0 ? ` · ${frames} photos` : ""}
            </p>
          </div>
        </Link>
      </div>
    </article>
  );
}
