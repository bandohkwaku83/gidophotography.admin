"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageIcon,
  Layers,
  Link2,
  Images,
  Package,
  Share2,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";
import { UploadDragger } from "@/components/photographer/upload-dragger";
import {
  FolderDetailPageSkeleton,
  InlineActionSkeleton,
  InlineStatusSkeleton,
  UploadIndeterminateBarSkeleton,
} from "@/components/ui/skeletons";
import type { FolderStatus } from "@/lib/demo-data";
import {
  apiFolderMediaToDemoAsset,
  apiFolderMediaToFinal,
  apiFolderStatusToUi,
  extractFinalMediaList,
  extractRawMediaList,
  extractSelectionMediaList,
  getFolder,
  getFolderClientName,
  getFolderCoverUrl,
  FALLBACK_SHARE_EXPIRY_PRESETS,
  getFolderShareAbsoluteUrl,
  getShareLinkExpiryPresets,
  patchFolderStatus,
  deleteFolderFinalMedia,
  deleteFolderRawMedia,
  regenerateFolderShare,
  uploadFolderFinalMedia,
  uploadFolderRawMedia,
  type ApiFolder,
  type ShareLinkExpiryPreset,
} from "@/lib/folders-api";

type Tab = "uploads" | "selection" | "finals";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

function statusLabel(s: FolderStatus) {
  switch (s) {
    case "DRAFT":
      return "Draft";
    case "SELECTION_PENDING":
      return "Selection pending";
    case "COMPLETED":
      return "Completed";
    default:
      return s;
  }
}

function statusStyles(s: FolderStatus) {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40";
    case "SELECTION_PENDING":
      return "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40";
    default:
      return "bg-white/15 text-white ring-1 ring-white/25";
  }
}

function UploadProgressBanner({
  kind,
  computable,
  percent,
}: {
  kind: "raw" | "final";
  computable: boolean;
  percent: number;
}) {
  const label = kind === "raw" ? "Uploading raw photos…" : "Uploading finals…";
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-brand/25 bg-brand-soft/95 p-4 shadow-sm dark:border-brand/35 dark:bg-brand/20"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-brand-ink dark:text-zinc-100">
          <InlineStatusSkeleton size={16} />
          <span className="truncate">{label}</span>
        </div>
        {computable ? (
          <span className="shrink-0 tabular-nums text-sm font-semibold text-brand-ink dark:text-brand-on-dark">
            {percent}%
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-brand-ink/85 dark:text-brand-on-dark/90">
            Sending…
          </span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand/25 dark:bg-brand/35">
        {computable ? (
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-150 ease-out dark:bg-brand-on-dark"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <UploadIndeterminateBarSkeleton />
        )}
      </div>
    </div>
  );
}

export function FolderDetailView({ folderId }: { folderId: string }) {
  const { showToast } = useToast();
  const [origin, setOrigin] = useState("");
  const [folder, setFolder] = useState<ApiFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("uploads");
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    kind: "raw" | "final";
    computable: boolean;
    percent: number;
  } | null>(null);
  const [expiryPresets, setExpiryPresets] = useState<ShareLinkExpiryPreset[]>([]);
  const [linkExpiry, setLinkExpiry] = useState("30d");
  /** `"raw:${id}"` | `"final:${id}"` while a delete request is in flight */
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setOrigin(typeof window !== "undefined" ? window.location.origin : ""));
  }, []);

  const refreshFolder = useCallback(async () => {
    const f = await getFolder(folderId);
    setFolder(f);
    return f;
  }, [folderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [f, presets] = await Promise.all([
          getFolder(folderId),
          getShareLinkExpiryPresets().catch(() => [] as ShareLinkExpiryPreset[]),
        ]);
        if (cancelled) return;
        setFolder(f);
        const list = presets.length > 0 ? presets : FALLBACK_SHARE_EXPIRY_PRESETS;
        setExpiryPresets(list);
        const ids = list.map((p) => p.id);
        const fromShare = f.share?.linkExpiryPreset ?? undefined;
        setLinkExpiry((prev) => {
          if (fromShare && ids.includes(fromShare)) return fromShare;
          if (ids.includes(prev)) return prev;
          if (ids.includes("30d")) return "30d";
          return list[0]?.id ?? "30d";
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Folder not found.");
        setFolder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const shareUrl = useMemo(
    () =>
      folder && origin ? getFolderShareAbsoluteUrl(folder, origin) ?? "" : "",
    [folder, origin],
  );
  const shareActive = Boolean(
    folder && folder.share?.enabled !== false && shareUrl,
  );

  const folderStatus = useMemo(
    () => (folder ? apiFolderStatusToUi(folder.status) : "DRAFT" satisfies FolderStatus),
    [folder],
  );

  const rawAssets = useMemo(
    () => (folder ? extractRawMediaList(folder).map(apiFolderMediaToDemoAsset) : []),
    [folder],
  );

  const finalAssets = useMemo(
    () => (folder ? extractFinalMediaList(folder).map(apiFolderMediaToFinal) : []),
    [folder],
  );

  const selectionRows = useMemo(
    () => (folder ? extractSelectionMediaList(folder).map(apiFolderMediaToDemoAsset) : []),
    [folder],
  );

  const clientSelectedAssets = useMemo(() => {
    const picked = selectionRows.filter((a) => a.selection === "SELECTED");
    return picked.length > 0 ? picked : selectionRows;
  }, [selectionRows]);

  async function onRawUpload(files: File[]) {
    if (!folder || busy || files.length === 0) return;
    setBusy(true);
    setUploadProgress({ kind: "raw", computable: false, percent: 0 });
    try {
      await uploadFolderRawMedia(folder._id, files, (loaded, total, lengthComputable) => {
        const computable = lengthComputable && total > 0;
        setUploadProgress({
          kind: "raw",
          computable,
          percent: computable ? Math.min(100, Math.round((100 * loaded) / total)) : 0,
        });
      });
      await refreshFolder();
      showToast(`${files.length} file(s) uploaded.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  async function onFinalUpload(files: File[]) {
    if (!folder || busy || files.length === 0) return;
    setBusy(true);
    setUploadProgress({ kind: "final", computable: false, percent: 0 });
    try {
      await uploadFolderFinalMedia(folder._id, files, undefined, (loaded, total, lengthComputable) => {
        const computable = lengthComputable && total > 0;
        setUploadProgress({
          kind: "final",
          computable,
          percent: computable ? Math.min(100, Math.round((100 * loaded) / total)) : 0,
        });
      });
      await refreshFolder();
      showToast(`${files.length} final(s) uploaded.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  async function onRegenerateLink() {
    if (!folder || busy) return;
    setBusy(true);
    try {
      const updated = await regenerateFolderShare(folder._id, {
        clearSlug: false,
        linkExpiry: linkExpiry || undefined,
      });
      setFolder(updated);
      showToast("Share link regenerated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not regenerate link.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function markCompleted() {
    if (!folder || busy || folderStatus === "COMPLETED") return;
    setBusy(true);
    try {
      const updated = await patchFolderStatus(folder._id, "completed");
      setFolder(updated);
      showToast("Marked as completed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update status.", "error");
    } finally {
      setBusy(false);
    }
  }

  function mediaDeleteBlocked() {
    return busy || uploadProgress !== null || deletingKey !== null;
  }

  async function onDeleteRawAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (
      !confirm(
        "Remove this image from raw uploads? This cannot be undone for your client gallery.",
      )
    ) {
      return;
    }
    setDeletingKey(`raw:${mediaId}`);
    try {
      await deleteFolderRawMedia(folder._id, mediaId);
      await refreshFolder();
      showToast("Image removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete image.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteFinalAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (!confirm("Remove this file from finals? This cannot be undone.")) {
      return;
    }
    setDeletingKey(`final:${mediaId}`);
    try {
      await deleteFolderFinalMedia(folder._id, mediaId);
      await refreshFolder();
      showToast("Final removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete final.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  if (loading) {
    return <FolderDetailPageSkeleton />;
  }

  if (error || !folder) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-zinc-200 bg-white px-8 py-14 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <Layers className="h-7 w-7 text-zinc-400" aria-hidden />
        </div>
        <p className="mt-5 text-base font-medium text-zinc-900 dark:text-zinc-100">
          Couldn&apos;t open this gallery
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {error ?? "Folder not found."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/galleries"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All galleries
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const clientName = getFolderClientName(folder);
  const title = folder.eventName?.trim() || clientName;
  const coverSrc = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
  const eventDateLabel = new Date(folder.eventDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const tabItems = [
    {
      key: "uploads" as const,
      label: "Uploads",
      sub: "Raw files",
      icon: ImageIcon,
      count: rawAssets.length,
    },
    {
      key: "selection" as const,
      label: "Selection",
      sub: "Client picks",
      icon: Sparkles,
      count: clientSelectedAssets.length,
    },
    {
      key: "finals" as const,
      label: "Finals",
      sub: "Delivery",
      icon: Package,
      count: finalAssets.length,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Breadcrumb */}
      <nav
        className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500"
        aria-label="Breadcrumb"
      >
        <Link
          href="/dashboard"
          className="font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <Link
          href="/dashboard/galleries"
          className="font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Galleries
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <span className="max-w-[min(100%,16rem)] truncate font-medium text-zinc-800 dark:text-zinc-200">
          {title}
        </span>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200/60 bg-zinc-900 shadow-lg shadow-zinc-900/10 ring-1 ring-black/5 dark:border-zinc-800/80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/45 to-zinc-900/20"
          aria-hidden
        />
        <div className="relative flex min-h-[200px] flex-col justify-between gap-5 p-5 md:min-h-[240px] md:gap-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link
              href="/dashboard/galleries"
              className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/18"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to galleries
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusStyles(folderStatus)}`}
            >
              {statusLabel(folderStatus)}
            </span>
          </div>

          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[2rem] md:leading-tight">
              {title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <User className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
                {clientName}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
                {eventDateLabel}
              </span>
            </div>
            {folder.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                {folder.description}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={markCompleted}
                disabled={busy || folderStatus === "COMPLETED"}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-md shadow-black/10 ring-1 ring-black/5 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {folderStatus === "COMPLETED" ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                    Completed
                  </>
                ) : (
                  "Mark completed"
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Share */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm shadow-brand/25">
            <Share2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
              Client gallery link
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Share this read-only URL with your client so they can view and select photos.
            </p>
            {folder.share?.selectionSubmittedAt ? (
              <p className="mt-3 inline-flex flex-wrap items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                Client submitted picks on{" "}
                {new Date(folder.share.selectionSubmittedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Share URL
            </span>
            <div className="mt-1.5 flex overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/80 focus-within:ring-2 focus-within:ring-brand/25 dark:border-zinc-700 dark:bg-zinc-900/60">
              <div className="flex shrink-0 items-center border-r border-zinc-200/80 bg-zinc-100/60 px-2.5 dark:border-zinc-700 dark:bg-zinc-900/80">
                <Link2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
              </div>
              <input
                readOnly
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono text-[11px] leading-snug text-zinc-800 outline-none dark:text-zinc-100 sm:text-xs"
                value={shareActive ? shareUrl : "Sharing is not enabled for this gallery yet."}
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            <button
              type="button"
              disabled={!shareActive}
              onClick={async () => {
                if (!shareUrl) return;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1500);
                } catch {
                  showToast("Could not copy link.", "error");
                }
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {linkCopied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {linkCopied ? "Copied" : "Copy"}
            </button>
            {shareActive ? (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open
              </a>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerateLink}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Regenerate
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <label className="block max-w-md text-sm text-zinc-600 dark:text-zinc-300">
            <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-200">New link expiry</span>
            <select
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 outline-none transition focus:ring-2 focus:ring-brand/35 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              value={linkExpiry}
              disabled={busy}
              onChange={(e) => setLinkExpiry(e.target.value)}
            >
              {expiryPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Regenerate applies the expiry above. The current link may show a different expiry until you
          regenerate.
        </p>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Gallery sections"
        className="flex gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        {tabItems.map(({ key, label, sub, icon: Icon, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition md:gap-3 md:px-3.5 md:py-2.5",
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-700/80"
                  : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md md:h-9 md:w-9",
                  active
                    ? "bg-brand text-white shadow-sm shadow-brand/25"
                    : "bg-zinc-200/90 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                )}
              >
                <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm font-semibold">{label}</span>
                  {count > 0 ? (
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
                  {sub}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        {uploadProgress ? (
          <div className="mb-6">
            <UploadProgressBanner
              kind={uploadProgress.kind}
              computable={uploadProgress.computable}
              percent={uploadProgress.percent}
            />
          </div>
        ) : null}
        {tab === "uploads" ? (
          <div className="space-y-6">
            <div className="border-b border-zinc-100 pb-5 dark:border-zinc-800/80">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Raw uploads
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Upload raw files to this gallery. They are sent to the server immediately.
              </p>
            </div>
            <UploadDragger disabled={busy} onFiles={(files) => void onRawUpload(files)} />
            {rawAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <Images className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  No uploads yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  Drop files above or click to browse. Thumbnails will appear in a grid below.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {rawAssets.map((a) => (
                  <li
                    key={a.id}
                    className="group overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-50/30 shadow-sm ring-1 ring-zinc-900/[0.04] transition hover:border-zinc-300 hover:ring-zinc-900/[0.07] dark:border-zinc-700 dark:bg-zinc-900/40 dark:ring-white/[0.04] dark:hover:border-zinc-500"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1.5 border-t border-zinc-100/90 bg-white/95 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/90">
                      <span
                        className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200"
                        title={a.originalName}
                      >
                        {a.originalName}
                      </span>
                      <button
                        type="button"
                        disabled={mediaDeleteBlocked() || deletingKey === `raw:${a.id}`}
                        onClick={() => void onDeleteRawAsset(a.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600/90 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400/90 dark:hover:bg-red-950/50"
                        title="Delete image"
                      >
                        {deletingKey === `raw:${a.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "selection" ? (
          <div className="space-y-6">
            <div className="border-b border-zinc-100 pb-5 dark:border-zinc-800/80">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Client selection
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Only photos the client chose in the share gallery appear here.
              </p>
            </div>
            {clientSelectedAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  No client selections yet. When clients pick shots from the share link,
                  they will show up in this list.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clientSelectedAssets.map((a) => (
                  <li
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-rose-200/70 bg-white shadow-sm ring-1 ring-rose-100/60 dark:border-rose-900/50 dark:bg-zinc-950 dark:ring-rose-950/40"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-2 border-t border-zinc-100 p-3 text-xs dark:border-zinc-800">
                      <p className="font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                        {a.originalName}
                      </p>
                      <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                        Selected by client
                      </p>
                      {a.clientComment ? (
                        <p className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                          &ldquo;{a.clientComment}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "finals" ? (
          <div className="space-y-6">
            <div className="border-b border-zinc-100 pb-5 dark:border-zinc-800/80">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Final delivery
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Upload finished edits for client delivery. Files are stored on the server.
              </p>
            </div>
            <UploadDragger
              label="Drop edited finals here"
              hint="JPG, PNG, WebP, GIF — uploaded to this gallery."
              disabled={busy}
              onFiles={(files) => void onFinalUpload(files)}
            />
            {finalAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
                No finals uploaded yet.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {finalAssets.map((f) => (
                  <li
                    key={f.id}
                    className="group overflow-hidden rounded-lg border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-900/[0.04] transition hover:border-zinc-300 hover:ring-zinc-900/[0.07] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.04] dark:hover:border-zinc-500"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1.5 border-t border-zinc-100/90 bg-white/95 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/90">
                      <span
                        className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                      <button
                        type="button"
                        disabled={mediaDeleteBlocked() || deletingKey === `final:${f.id}`}
                        onClick={() => void onDeleteFinalAsset(f.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600/90 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400/90 dark:hover:bg-red-950/50"
                        title="Delete final"
                      >
                        {deletingKey === `final:${f.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
