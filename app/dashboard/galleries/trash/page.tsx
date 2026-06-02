"use client";

import { DashboardPage } from "@/components/photographer/dashboard-page";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Clock, FileImage, FolderOpen, Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  FoldersApiError,
  formatRestoreBeforeLabel,
  folderCoverObjectPositionStyle,
  getFolderClientName,
  getFolderCoverUrl,
  isRestoreDeadlinePassed,
  listFoldersMediaTrash,
  listFoldersTrash,
  purgeFoldersTrash,
  restoreFolderFromTrash,
  restoreFolderTrashedMedia,
  type ListFoldersTrashResponse,
  type TrashFolderRow,
  type TrashMediaRow,
} from "@/lib/folders-api";
import { listClients } from "@/lib/clients-api";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-trash/1200/800";

function trashMediaKey(row: TrashMediaRow): string {
  return `${row.folderId}:${row.mediaId}`;
}

export default function GalleriesTrashPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<ListFoldersTrashResponse | null>(null);
  const [extraMediaRows, setExtraMediaRows] = useState<TrashMediaRow[]>([]);
  const [mediaNextPage, setMediaNextPage] = useState<number | null>(null);
  const [mediaLoadingMore, setMediaLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientNameById, setClientNameById] = useState<Map<string, string>>(new Map());
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoringMediaKey, setRestoringMediaKey] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  /** Gallery folder ids selected for permanent purge (`folder._id`). */
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  /** Keys `folderId:mediaId` for file-level trash selected for purge. */
  const [selectedMediaKeys, setSelectedMediaKeys] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFoldersTrash();
      setData(res);
      setExtraMediaRows([]);
      setMediaNextPage(
        res.deletedMediaTotal > res.deletedMedia.length
          ? res.deletedMedia.length === 0
            ? 1
            : 2
          : null,
      );
    } catch (e) {
      setData(null);
      setExtraMediaRows([]);
      setMediaNextPage(null);
      setError(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load trash.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    listClients()
      .then(({ clients }) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const c of clients) map.set(c._id, c.name);
        setClientNameById(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const allTrashedMedia = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, TrashMediaRow>();
    for (const m of data.deletedMedia) {
      map.set(trashMediaKey(m), m);
    }
    for (const m of extraMediaRows) {
      map.set(trashMediaKey(m), m);
    }
    return [...map.values()];
  }, [data, extraMediaRows]);

  const selectedCount = selectedFolderIds.length + selectedMediaKeys.length;

  const allFoldersSelected = useMemo(() => {
    if (!data?.folders.length) return false;
    return data.folders.every((r) => selectedFolderIds.includes(r.folder._id));
  }, [data?.folders, selectedFolderIds]);

  const allMediaSelected = useMemo(() => {
    if (!allTrashedMedia.length) return false;
    return allTrashedMedia.every((r) => selectedMediaKeys.includes(trashMediaKey(r)));
  }, [allTrashedMedia, selectedMediaKeys]);

  const mediaPageLimit = useMemo(() => {
    if (!data) return 50;
    if (data.deletedMediaPreviewLimit > 0) {
      return Math.min(500, data.deletedMediaPreviewLimit);
    }
    return Math.max(50, data.deletedMedia.length || 50);
  }, [data]);

  const loadMoreMedia = useCallback(async () => {
    if (!data || mediaNextPage === null || mediaLoadingMore) return;
    setMediaLoadingMore(true);
    try {
      const res = await listFoldersMediaTrash({
        page: mediaNextPage,
        limit: mediaPageLimit,
      });

      setExtraMediaRows((prev) => {
        const seen = new Set<string>();
        for (const m of data.deletedMedia) seen.add(trashMediaKey(m));
        for (const m of prev) seen.add(trashMediaKey(m));
        const next = [...prev];
        for (const item of res.items) {
          const k = trashMediaKey(item);
          if (!seen.has(k)) {
            seen.add(k);
            next.push(item);
          }
        }
        return next;
      });

      const seen = new Set<string>();
      for (const m of data.deletedMedia) seen.add(trashMediaKey(m));
      for (const m of extraMediaRows) seen.add(trashMediaKey(m));
      for (const item of res.items) {
        seen.add(trashMediaKey(item));
      }
      const totalAfter = seen.size;

      if (res.items.length === 0 || totalAfter >= data.deletedMediaTotal) {
        setMediaNextPage(null);
      } else {
        setMediaNextPage((p) => (p == null ? 2 : p + 1));
      }
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load more files.",
        "error",
      );
    } finally {
      setMediaLoadingMore(false);
    }
  }, [data, extraMediaRows, mediaLoadingMore, mediaNextPage, mediaPageLimit, showToast]);

  async function onRestore(row: TrashFolderRow) {
    const id = row.folder._id;
    if (restoringId || isRestoreDeadlinePassed(row.restoreBefore)) return;
    setRestoringId(id);
    try {
      await restoreFolderFromTrash(id);
      showToast("Gallery restored.", "success");
      setData((prev) =>
        prev
          ? {
              ...prev,
              folders: prev.folders.filter((f) => f.folder._id !== id),
              count: Math.max(0, prev.count - 1),
            }
          : prev,
      );
      router.push(`/dashboard/folder/${id}`);
    } catch (e) {
      const msg =
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not restore gallery.";
      showToast(msg, "error");
      if (e instanceof FoldersApiError && e.status === 410) {
        void load();
      }
    } finally {
      setRestoringId(null);
    }
  }

  async function onRestoreMedia(row: TrashMediaRow) {
    const key = trashMediaKey(row);
    if (restoringMediaKey || isRestoreDeadlinePassed(row.restoreBefore)) return;
    setRestoringMediaKey(key);
    try {
      await restoreFolderTrashedMedia(row.folderId, row.mediaId);
      showToast("File restored.", "success");
      setData((prev) =>
        prev
          ? {
              ...prev,
              deletedMedia: prev.deletedMedia.filter(
                (m) => !(m.folderId === row.folderId && m.mediaId === row.mediaId),
              ),
              deletedMediaTotal: Math.max(0, prev.deletedMediaTotal - 1),
            }
          : prev,
      );
      setExtraMediaRows((prev) =>
        prev.filter((m) => !(m.folderId === row.folderId && m.mediaId === row.mediaId)),
      );
    } catch (e) {
      const msg =
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not restore file.";
      showToast(msg, "error");
      if (e instanceof FoldersApiError && e.status === 410) {
        void load();
      }
    } finally {
      setRestoringMediaKey(null);
    }
  }

  function toggleFolderForPurge(id: string) {
    setSelectedFolderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleMediaKeyForPurge(key: string) {
    setSelectedMediaKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  function toggleSelectAllFolders() {
    if (!data?.folders.length) return;
    if (allFoldersSelected) {
      setSelectedFolderIds([]);
    } else {
      setSelectedFolderIds(data.folders.map((r) => r.folder._id));
    }
  }

  function toggleSelectAllMedia() {
    if (!allTrashedMedia.length) return;
    if (allMediaSelected) {
      setSelectedMediaKeys([]);
    } else {
      setSelectedMediaKeys(allTrashedMedia.map(trashMediaKey));
    }
  }

  function clearPurgeSelection() {
    setSelectedFolderIds([]);
    setSelectedMediaKeys([]);
  }

  async function onPurgeAllTrash() {
    if (purging || !data) return;
    const confirmed = window.confirm(
      "Permanently delete everything in trash?\n\nThis cannot be undone. All trashed galleries and files are removed from the server immediately. The restore window does not apply.\n\nOnly choose OK if you are certain.",
    );
    if (!confirmed) return;
    setPurging(true);
    try {
      const result = await purgeFoldersTrash({ all: true });
      let msg = result.message;
      if (result.purgedFolderCount > 0 || result.purgedMediaCount > 0) {
        msg += ` (${result.purgedFolderCount} galleries, ${result.purgedMediaCount} files.)`;
      }
      if (result.skipped?.length) {
        msg += ` ${result.skipped.length} item(s) skipped.`;
      }
      showToast(msg, result.skipped?.length ? "info" : "success");
      clearPurgeSelection();
      await load();
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not empty trash.",
        "error",
      );
    } finally {
      setPurging(false);
    }
  }

  async function onPurgeSelectedTrash() {
    if (purging) return;
    const nFolders = selectedFolderIds.length;
    const nMedia = selectedMediaKeys.length;
    if (nFolders === 0 && nMedia === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${nFolders} gallery/galleries and ${nMedia} file(s)?\n\nThis cannot be undone. These items are removed from the server immediately.`,
    );
    if (!confirmed) return;
    setPurging(true);
    try {
      const mediaIds = selectedMediaKeys.map((key) => {
        const i = key.indexOf(":");
        return i >= 0 ? key.slice(i + 1) : key;
      });
      const payload: { folderIds?: string[]; mediaIds?: string[] } = {};
      if (nFolders) payload.folderIds = [...selectedFolderIds];
      if (nMedia) payload.mediaIds = mediaIds;
      const result = await purgeFoldersTrash(payload);
      let msg = result.message;
      if (result.purgedFolderCount > 0 || result.purgedMediaCount > 0) {
        msg += ` Removed ${result.purgedFolderCount} galleries, ${result.purgedMediaCount} files.`;
      }
      if (result.skipped?.length) {
        const first = result.skipped[0]?.reason ?? "";
        msg += ` ${result.skipped.length} skipped.${first ? ` (${first})` : ""}`;
      }
      showToast(msg, result.skipped?.length ? "info" : "success");
      clearPurgeSelection();
      await load();
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not purge selected items.",
        "error",
      );
    } finally {
      setPurging(false);
    }
  }

  const hasFolderTrash = (data?.folders.length ?? 0) > 0;
  const hasMediaTrash = (data?.deletedMediaTotal ?? 0) > 0;
  const fullyEmpty = data && !hasFolderTrash && !hasMediaTrash;

  return (
    <DashboardPage className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard/galleries"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to galleries
        </Link>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <Trash2 className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Trash
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Trashed galleries and files can be restored until each row’s deadline.
              {data != null && data.retentionDays > 0 ? (
                <span className="mt-1 block text-xs text-zinc-400 dark:text-zinc-500">
                  Default window: {data.retentionDays} days — each row shows the exact cutoff.
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      {data && !fullyEmpty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200/85 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            disabled={purging || restoringId !== null || restoringMediaKey !== null}
            onClick={() => void onPurgeAllTrash()}
            className={cn(
              "inline-flex min-h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 transition",
              "hover:bg-red-100 dark:border-red-900/55 dark:bg-red-950/45 dark:text-red-100 dark:hover:bg-red-950/70",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            {purging ? "Purging…" : "Empty trash"}
          </button>
          {selectedCount > 0 ? (
            <button
              type="button"
              disabled={purging || restoringId !== null || restoringMediaKey !== null}
              onClick={() => void onPurgeSelectedTrash()}
              className={cn(
                "inline-flex min-h-9 items-center justify-center rounded-lg border border-red-300/90 bg-white px-3 py-2 text-xs font-semibold text-red-800 transition",
                "hover:bg-red-50 dark:border-red-800/60 dark:bg-zinc-900 dark:text-red-200 dark:hover:bg-red-950/35",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            >
              Purge selected ({selectedCount})
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <button
              type="button"
              disabled={purging}
              onClick={clearPurgeSelection}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 disabled:opacity-45"
            >
              Clear selection
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Selected items will be permanently deleted, not moved to another folder.
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading trash…</p>
      ) : null}

      {!loading && fullyEmpty ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Trash is empty.</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Deleted galleries and removed files will appear here when you move them to trash.
          </p>
        </div>
      ) : null}

      {data && hasFolderTrash ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Galleries in trash</h2>
            <button
              type="button"
              disabled={purging || data.folders.length === 0}
              onClick={toggleSelectAllFolders}
              className="text-xs font-semibold text-brand-ink hover:text-brand dark:text-brand-on-dark dark:hover:text-brand disabled:opacity-40"
            >
              {allFoldersSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.folders.map((row) => {
              const folder = row.folder;
              const clientName = getFolderClientName(folder, clientNameById);
              const cover = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
              const title = folder.eventName?.trim() || clientName;
              const expired = isRestoreDeadlinePassed(row.restoreBefore);
              const deadlineLabel = formatRestoreBeforeLabel(row.restoreBefore);
              const busy = restoringId === folder._id;
              const checked = selectedFolderIds.includes(folder._id);

              return (
                <li
                  key={folder._id}
                  className="flex flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="relative aspect-[5/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/50">
                    <label className="absolute right-2 top-2 z-10 flex cursor-pointer items-center justify-center rounded-md bg-white/95 p-1 shadow dark:bg-zinc-900/95">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={purging}
                        onChange={() => toggleFolderForPurge(folder._id)}
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-brand focus:ring-brand"
                        aria-label={`Select gallery for permanent deletion: ${title}`}
                      />
                    </label>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt=""
                      className="h-full w-full object-cover"
                      style={folderCoverObjectPositionStyle(folder)}
                    />
                    {expired ? (
                      <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        Expired
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {title}
                      </h3>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{clientName}</p>
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {deadlineLabel ? (
                        <>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">Restore by:</span>{" "}
                          {deadlineLabel}
                        </>
                      ) : (
                        "Restore deadline not provided."
                      )}
                    </p>
                    {expired ? (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200/90">
                        The retention window has passed. This gallery can no longer be restored from the app.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={expired || busy || purging}
                      onClick={() => void onRestore(row)}
                      className={cn(
                        "mt-auto inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition",
                        expired || busy || purging
                          ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                          : "bg-brand text-white hover:bg-brand-hover",
                      )}
                    >
                      {busy ? "Restoring…" : "Restore gallery"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {data && hasMediaTrash ? (
        <section className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)] dark:border-zinc-800/90 dark:bg-zinc-950 dark:shadow-[0_2px_32px_-8px_rgba(0,0,0,0.4)]">
          <div className="relative border-b border-zinc-100/90 bg-gradient-to-br from-brand-soft/55 via-white to-white px-5 py-5 dark:border-zinc-800 dark:from-brand/10 dark:via-zinc-950 dark:to-zinc-950 sm:px-6 sm:py-6">
            <div className="pointer-events-none absolute -right-20 -top-16 h-40 w-40 rounded-full bg-brand/[0.12] blur-3xl dark:bg-brand/10" aria-hidden />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-ink dark:text-brand-on-dark">
                  Media
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
                  Files in trash
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Restore until each deadline — files go back to their gallery.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={purging || allTrashedMedia.length === 0}
                    onClick={toggleSelectAllMedia}
                    className="text-xs font-semibold text-brand-ink hover:text-brand dark:text-brand-on-dark dark:hover:text-brand disabled:opacity-40"
                  >
                    {allMediaSelected ? "Deselect all files" : "Select all files"}
                  </button>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border border-brand/20 bg-brand-soft/80 px-3 py-1 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm",
                      "text-brand-ink dark:border-brand/35 dark:bg-brand/15 dark:text-brand-on-dark",
                    )}
                  >
                    {allTrashedMedia.length}
                    <span className="mx-1 font-normal text-brand/45 dark:text-brand-on-dark/45">/</span>
                    {data.deletedMediaTotal}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">items</span>
              </div>
            </div>
            {data.deletedMediaPagingHint && mediaNextPage !== null ? (
              <p className="relative mt-3 text-xs text-zinc-500 dark:text-zinc-400">{data.deletedMediaPagingHint}</p>
            ) : null}
          </div>

          <div className="bg-zinc-50/80 px-3 py-4 dark:bg-zinc-900/50 sm:px-5 sm:py-5">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allTrashedMedia.map((row) => {
                const folder = row.folder;
                const clientName = folder ? getFolderClientName(folder, clientNameById) : "";
                const galleryTitle =
                  folder?.eventName?.trim() ||
                  clientName ||
                  `Gallery ${row.folderId.slice(-6)}`;
                const previewSrc =
                  row.thumbUrl ??
                  row.url ??
                  (folder ? getFolderCoverUrl(folder) : null) ??
                  "";
                const label = row.originalFilename?.trim() || row.mediaId;
                const expired = isRestoreDeadlinePassed(row.restoreBefore);
                const deadlineLabel = formatRestoreBeforeLabel(row.restoreBefore);
                const busy = restoringMediaKey === trashMediaKey(row);
                const kindRaw = (row.kind || "file").toLowerCase().trim();
                const isFinalKind = /^finals?$/.test(kindRaw);
                const isOriginalKind =
                  kindRaw === "raw" ||
                  kindRaw === "original" ||
                  kindRaw === "originals" ||
                  kindRaw === "upload" ||
                  kindRaw === "uploads";
                const kindLabel = isOriginalKind
                  ? "Original"
                  : isFinalKind
                    ? "Final"
                    : row.kind
                      ? row.kind.charAt(0).toUpperCase() + row.kind.slice(1)
                      : "File";
                const kindBadgeClass = isFinalKind
                  ? "border-brand bg-brand text-brand-foreground shadow-sm dark:border-brand dark:bg-brand dark:text-brand-foreground"
                  : isOriginalKind
                    ? "border-brand/35 bg-brand-soft/95 text-brand-ink dark:border-brand/45 dark:bg-brand/14 dark:text-brand-on-dark"
                    : "border-zinc-200/90 bg-white/90 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-200";
                const mkey = trashMediaKey(row);
                const mediaChecked = selectedMediaKeys.includes(mkey);

                return (
                  <li key={mkey} className="group/card h-full list-none">
                    <div
                      className={cn(
                        "flex h-full flex-col overflow-hidden rounded-xl border bg-white transition-all duration-300 dark:bg-zinc-950",
                        "border-zinc-200/85 shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
                        "hover:border-brand/30 hover:shadow-lg hover:shadow-brand/20 dark:border-zinc-800 dark:hover:border-brand/35 dark:hover:shadow-brand/15",
                        expired && "opacity-80 grayscale-[0.35]",
                      )}
                    >
                      <div
                        className={cn(
                          "relative aspect-video w-full overflow-hidden bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-800",
                        )}
                      >
                        <label className="absolute right-2 top-2 z-20 flex cursor-pointer items-center justify-center rounded-md bg-white/95 p-1 shadow dark:bg-zinc-900/95">
                          <input
                            type="checkbox"
                            checked={mediaChecked}
                            disabled={purging}
                            onChange={() => toggleMediaKeyForPurge(mkey)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-brand focus:ring-brand"
                            aria-label={`Select file for permanent deletion: ${label}`}
                          />
                        </label>
                        {previewSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewSrc}
                            alt=""
                            className={cn(
                              "h-full w-full object-cover transition duration-500 ease-out",
                              "group-hover/card:scale-[1.02]",
                            )}
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FileImage
                              className="h-7 w-7 text-zinc-300 transition group-hover/card:text-zinc-400 dark:text-zinc-600 dark:group-hover/card:text-zinc-500"
                              aria-hidden
                            />
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/25 via-transparent to-zinc-950/[0.07] opacity-80 dark:from-zinc-950/50" />
                        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide shadow-sm",
                              kindBadgeClass,
                            )}
                          >
                            {kindLabel}
                          </span>
                          {expired ? (
                            <span className="rounded-md border border-red-200/90 bg-red-600/95 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white shadow-sm dark:border-red-500/40">
                              Expired
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col gap-2 p-3">
                        <p
                          className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                          title={label}
                        >
                          {label}
                        </p>
                        <Link
                          href={`/dashboard/folder/${row.folderId}`}
                          className="group/link inline-flex max-w-full items-center gap-1 text-[11px] font-semibold text-brand-ink transition hover:text-brand dark:text-brand-on-dark dark:hover:text-brand"
                        >
                          <FolderOpen className="h-3 w-3 shrink-0 opacity-80 group-hover/link:opacity-100" aria-hidden />
                          <span className="min-w-0 truncate">{galleryTitle}</span>
                        </Link>
                        <div className="flex items-start gap-1.5 rounded-lg border border-brand/10 bg-brand-soft/45 px-2 py-1.5 dark:border-brand/20 dark:bg-brand/10">
                          <Clock className="mt-px h-3 w-3 shrink-0 text-brand/55 dark:text-brand-on-dark/70" aria-hidden />
                          <div className="min-w-0 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {deadlineLabel ? (
                              <>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">Restore by </span>
                                <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{deadlineLabel}</span>
                              </>
                            ) : (
                              "Restore deadline not provided."
                            )}
                            {expired ? (
                              <span className="mt-0.5 block text-[10px] text-amber-700 dark:text-amber-300/95">
                                This file can no longer be restored.
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={expired || busy || purging}
                          onClick={() => void onRestoreMedia(row)}
                          className={cn(
                            "mt-auto flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition",
                            expired || busy || purging
                              ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                              : "bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-hover",
                          )}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {busy ? "Restoring…" : "Restore"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {mediaNextPage !== null && allTrashedMedia.length < data.deletedMediaTotal ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={mediaLoadingMore || purging}
                  onClick={() => void loadMoreMedia()}
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 text-xs font-semibold text-zinc-800 shadow-sm transition",
                    "hover:border-brand/35 hover:bg-brand-soft/60 hover:text-brand-ink dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
                    "disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand/18 dark:hover:text-brand-on-dark",
                  )}
                >
                  {mediaLoadingMore ? (
                    "Loading…"
                  ) : (
                    <>
                      <span>Load more</span>
                      <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </DashboardPage>
  );
}
