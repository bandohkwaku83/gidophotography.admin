import Link from "next/link";
import {
  getFolderClientName,
  getFolderCoverUrl,
  type ApiFolder,
} from "@/lib/folders-api";
import { cn } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-[#F3E6C8] text-[#8A6A2F]",
  "bg-[#F3E4E4] text-[#6B1E2F]",
  "bg-[#E5EEE6] text-[#3E5C46]",
  "bg-[#EFE8DC] text-[#5C5146]",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0]!;
}

function formatCompactAge(iso: string, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return formatShortDate(iso);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function RecentGalleryCard({
  folder,
  clientNameById,
}: {
  folder: ApiFolder;
  clientNameById?: Map<string, string>;
}) {
  const cover = getFolderCoverUrl(folder);
  const client = getFolderClientName(folder, clientNameById);
  const title = folder.eventName?.trim() || "Untitled gallery";
  const when = folder.updatedAt ?? folder.createdAt ?? "";
  const opened = folder.createdAt ?? folder.eventDate ?? "";

  return (
    <Link
      href={`/dashboard/folder/${folder._id}`}
      aria-label={`Open gallery ${title}`}
      className="group @container block overflow-hidden rounded-xl bg-[#f5f5f5] transition duration-300 hover:bg-[#efefef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-ink/25"
    >
      <div className="relative h-[188px] overflow-hidden bg-[#d5ddd2] @md:h-[220px]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full origin-top object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,#b7c4b4_0%,#d7e0d2_42%,#e8e2d8_100%)]" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(26,22,18,0.1)_0%,rgba(245,245,245,0)_46%,rgba(245,245,245,0.45)_74%,#f5f5f5_100%)]" />
      </div>

      <div className="relative -mt-7 px-3.5 pb-3.5 @md:-mt-8 @md:px-5 @md:pb-4">
        <span
          className={cn(
            "inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#f5f5f5] text-[13px] font-semibold",
            avatarTone(client),
          )}
        >
          {initials(client)}
        </span>
        <h3 className="mt-2.5 truncate text-[15px] font-semibold tracking-tight text-studio-ink @md:mt-3 @md:text-[17px]">{title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-[#6d645c]">{client}</p>

        <p className="mt-3 text-[12px] text-studio-taupe" suppressHydrationWarning>
          Updated {formatCompactAge(when)} · Opened {formatShortDate(opened)}
        </p>
      </div>
    </Link>
  );
}
