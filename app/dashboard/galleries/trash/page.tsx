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

function describeTrashSelection(folders: number, files: number): string {
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} ${folders === 1 ? "gallery" : "galleries"}`);
  if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
  return parts.join(" and ");
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]!);
    }
  });
  await Promise.all(workers);
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
  const [restoringSelected, setRestoringSelected] = useState(false);
  /** Gallery folder ids checked in the list (`folder._id`). */
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  /** Keys `folderId:mediaId` for checked file-level trash rows. */
  const [selectedMediaKeys, setSelectedMediaKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"galleries" | "files">("galleries");
  const [deletePrompt, setDeletePrompt] = useState<null | "all" | "selected">(null);

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
  const actionsBusy =
    purging || restoringSelected || restoringId !== null || restoringMediaKey !== null;

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

  function clearSelection() {
    setSelectedFolderIds([]);
    setSelectedMediaKeys([]);
  }

  async function onRestoreSelected() {
    if (actionsBusy || !data) return;
    const folderRows = data.folders.filter(
      (row) =>
        selectedFolderIds.includes(row.folder._id) && !isRestoreDeadlinePassed(row.restoreBefore),
    );
    const mediaRows = allTrashedMedia.filter(
      (row) =>
        selectedMediaKeys.includes(trashMediaKey(row)) && !isRestoreDeadlinePassed(row.restoreBefore),
    );
    const expiredSkipped =
      data.folders.filter(
        (row) =>
          selectedFolderIds.includes(row.folder._id) && isRestoreDeadlinePassed(row.restoreBefore),
      ).length +
      allTrashedMedia.filter(
        (row) =>
          selectedMediaKeys.includes(trashMediaKey(row)) && isRestoreDeadlinePassed(row.restoreBefore),
      ).length;

    if (folderRows.length === 0 && mediaRows.length === 0) {
      showToast(
        expiredSkipped > 0
          ? "Those items are past the restore deadline and cannot be restored."
          : "Select at least one item to restore.",
        "error",
      );
      return;
    }

    setRestoringSelected(true);
    const restoredFolderIds = new Set<string>();
    const restoredMediaKeys = new Set<string>();
    let failed = 0;
    let saw410 = false;

    try {
      await mapPool(
        [
          ...folderRows.map((row) => ({ kind: "folder" as const, row })),
          ...mediaRows.map((row) => ({ kind: "media" as const, row })),
        ],
        4,
        async (item) => {
          try {
            if (item.kind === "folder") {
              await restoreFolderFromTrash(item.row.folder._id);
              restoredFolderIds.add(item.row.folder._id);
            } else {
              await restoreFolderTrashedMedia(item.row.folderId, item.row.mediaId);
              restoredMediaKeys.add(trashMediaKey(item.row));
            }
          } catch (e) {
            failed += 1;
            if (e instanceof FoldersApiError && e.status === 410) saw410 = true;
          }
        },
      );

      if (restoredFolderIds.size > 0 || restoredMediaKeys.size > 0) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                folders: prev.folders.filter((f) => !restoredFolderIds.has(f.folder._id)),
                count: Math.max(0, prev.count - restoredFolderIds.size),
                deletedMedia: prev.deletedMedia.filter((m) => !restoredMediaKeys.has(trashMediaKey(m))),
                deletedMediaTotal: Math.max(0, prev.deletedMediaTotal - restoredMediaKeys.size),
              }
            : prev,
        );
        setExtraMediaRows((prev) => prev.filter((m) => !restoredMediaKeys.has(trashMediaKey(m))));
        setSelectedFolderIds((prev) => prev.filter((id) => !restoredFolderIds.has(id)));
        setSelectedMediaKeys((prev) => prev.filter((key) => !restoredMediaKeys.has(key)));
      }

      const restoredBits: string[] = [];
      if (restoredFolderIds.size > 0) {
        restoredBits.push(
          `${restoredFolderIds.size} ${restoredFolderIds.size === 1 ? "gallery" : "galleries"}`,
        );
      }
      if (restoredMediaKeys.size > 0) {
        restoredBits.push(
          `${restoredMediaKeys.size} ${restoredMediaKeys.size === 1 ? "file" : "files"}`,
        );
      }

      if (restoredBits.length === 0) {
        showToast("Could not restore the selected items.", "error");
      } else {
        let msg = `Restored ${restoredBits.join(" and ")}.`;
        if (failed > 0) msg += ` ${failed} could not be restored.`;
        if (expiredSkipped > 0) {
          msg += ` ${expiredSkipped} past the deadline ${expiredSkipped === 1 ? "was" : "were"} left in trash.`;
        }
        showToast(msg, failed > 0 || expiredSkipped > 0 ? "info" : "success");
      }

      if (saw410) void load();
    } finally {
      setRestoringSelected(false);
    }
  }

  async function runPurgeAll() {
    if (purging || !data) return;
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
      clearSelection();
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

  async function runPurgeSelected() {
    if (purging) return;
    const nFolders = selectedFolderIds.length;
    const nMedia = selectedMediaKeys.length;
    if (nFolders === 0 && nMedia === 0) return;
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
      clearSelection();
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

  async function onConfirmDelete() {
    if (!deletePrompt || purging) return;
    if (deletePrompt === "all") await runPurgeAll();
    else await runPurgeSelected();
    setDeletePrompt(null);
  }

  useEffect(() => {
    if (!deletePrompt || purging) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDeletePrompt(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deletePrompt, purging]);

  const hasFolderTrash = (data?.folders.length ?? 0) > 0;
  const hasMediaTrash = (data?.deletedMediaTotal ?? 0) > 0;
  const fullyEmpty = data && !hasFolderTrash && !hasMediaTrash;
  const showTabs = hasFolderTrash && hasMediaTrash;
  const visibleTab: "galleries" | "files" =
    showTabs ? activeTab : hasFolderTrash ? "galleries" : "files";

  return (
    <DashboardPage className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-12 h-48 w-48 rounded-full bg-amber-500/[0.08] blur-3xl dark:bg-amber-500/10"
          aria-hidden
        />
        <div className="relative space-y-5">
          <Link
            href="/dashboard/galleries"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Galleries
          </Link>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 shadow-sm dark:bg-amber-950/50 dark:text-amber-300">
                <Trash2 className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.65rem] sm:leading-tight">
                  Trash
                </h1>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Restore galleries and files before their deadline.
                  {data != null && data.retentionDays > 0 ? (
                    <span className="mt-1 block text-xs text-zinc-400 dark:text-zinc-500">
                      Default retention: {data.retentionDays} days
                    </span>
                  ) : null}
                </p>
                {data && !fullyEmpty ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hasFolderTrash ? (
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {data.folders.length} {data.folders.length === 1 ? "gallery" : "galleries"}
                      </span>
                    ) : null}
                    {hasMediaTrash ? (
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {data.deletedMediaTotal} {data.deletedMediaTotal === 1 ? "file" : "files"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {data && !fullyEmpty ? (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    disabled={actionsBusy}
                    onClick={() => void onRestoreSelected()}
                    className={cn(
                      "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-studio-ink px-3.5 py-2 text-xs font-semibold text-white transition",
                      "hover:bg-studio-charcoal disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                  >
                    {restoringSelected ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {restoringSelected ? "Restoring…" : `Restore selected (${selectedCount})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={actionsBusy}
                  onClick={() => setDeletePrompt("all")}
                  className={cn(
                    "inline-flex min-h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 transition",
                    "hover:bg-red-100 dark:border-red-900/55 dark:bg-red-950/45 dark:text-red-100 dark:hover:bg-red-950/70",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                  )}
                >
                  {purging && deletePrompt === "all" ? "Deleting…" : "Empty trash"}
                </button>
                {selectedCount > 0 ? (
                  <>
                    <button
                      type="button"
                      disabled={actionsBusy}
                      onClick={() => setDeletePrompt("selected")}
                      className={cn(
                        "inline-flex min-h-9 items-center justify-center rounded-xl border border-red-300/90 bg-white px-3.5 py-2 text-xs font-semibold text-red-800 transition",
                        "hover:bg-red-50 dark:border-red-800/60 dark:bg-zinc-900 dark:text-red-200 dark:hover:bg-red-950/35",
                        "disabled:cursor-not-allowed disabled:opacity-45",
                      )}
                    >
                      {purging && deletePrompt === "selected"
                        ? "Deleting…"
                        : `Delete selected (${selectedCount})`}
                    </button>
                    <button
                      type="button"
                      disabled={actionsBusy}
                      onClick={clearSelection}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 disabled:opacity-45"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {selectedCount > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {selectedCount} selected. Restore them together, or permanently delete them.
        </p>
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
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-gradient-to-b from-zinc-50/80 to-white px-6 py-16 text-center dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950 sm:px-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <Trash2 className="h-7 w-7" aria-hidden />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Trash is empty</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Deleted galleries and removed files will appear here when you move them to trash.
          </p>
          <Link
            href="/dashboard/galleries"
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to galleries
          </Link>
        </div>
      ) : null}

      {data && !fullyEmpty ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {showTabs ? (
            <div
              className="flex border-b border-zinc-100 dark:border-zinc-800"
              role="tablist"
              aria-label="Trash sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === "galleries"}
                onClick={() => setActiveTab("galleries")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition sm:flex-none sm:px-6",
                  visibleTab === "galleries"
                    ? "border-b-2 border-studio-ink text-studio-ink"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                <FolderOpen className="h-4 w-4 opacity-70" aria-hidden />
                Galleries
                <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[11px] tabular-nums dark:bg-zinc-800">
                  {data.folders.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === "files"}
                onClick={() => setActiveTab("files")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition sm:flex-none sm:px-6",
                  visibleTab === "files"
                    ? "border-b-2 border-studio-ink text-studio-ink"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                <FileImage className="h-4 w-4 opacity-70" aria-hidden />
                Files
                <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[11px] tabular-nums dark:bg-zinc-800">
                  {data.deletedMediaTotal}
                </span>
              </button>
            </div>
          ) : null}

          {visibleTab === "galleries" && hasFolderTrash ? (
            <div>
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800 sm:px-5">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {data.folders.length} trashed {data.folders.length === 1 ? "gallery" : "galleries"}
                </p>
                <button
                  type="button"
                  disabled={actionsBusy || data.folders.length === 0}
                  onClick={toggleSelectAllFolders}
                  className="text-xs font-semibold text-studio-ink hover:underline disabled:opacity-40"
                >
                  {allFoldersSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/80 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <th className="w-10 px-3 py-2.5 sm:px-4" />
                      <th className="px-3 py-2.5 sm:px-4">Gallery</th>
                      <th className="hidden px-3 py-2.5 sm:table-cell sm:px-4">Client</th>
                      <th className="px-3 py-2.5 sm:px-4">Restore by</th>
                      <th className="px-3 py-2.5 text-right sm:px-4" />
                    </tr>
                  </thead>
                  <tbody>
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
                        <tr
                          key={folder._id}
                          className={cn(
                            "border-b border-zinc-100 transition last:border-0 dark:border-zinc-800",
                            "hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30",
                            expired && "opacity-60",
                          )}
                        >
                          <td className="px-3 py-2.5 sm:px-4">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={actionsBusy}
                              onChange={() => toggleFolderForPurge(folder._id)}
                              className="h-3.5 w-3.5 rounded border-zinc-300 text-brand focus:ring-brand"
                              aria-label={`Select ${title}`}
                            />
                          </td>
                          <td className="px-3 py-2.5 sm:px-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={cover}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  style={folderCoverObjectPositionStyle(folder)}
                                />
                                {expired ? (
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[8px] font-bold uppercase text-white">
                                    Expired
                                  </span>
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
                                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 sm:hidden">
                                  {clientName}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-3 py-2.5 text-zinc-600 dark:text-zinc-400 sm:table-cell sm:px-4">
                            <span className="block max-w-[160px] truncate">{clientName}</span>
                          </td>
                          <td className="px-3 py-2.5 sm:px-4">
                            <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                              <span className="tabular-nums">{deadlineLabel ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right sm:px-4">
                            <button
                              type="button"
                              disabled={expired || busy || actionsBusy}
                              onClick={() => void onRestore(row)}
                              className={cn(
                                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                                expired || busy || actionsBusy
                                  ? "cursor-not-allowed text-zinc-400 dark:text-zinc-600"
                                  : "bg-studio-ink text-white hover:bg-studio-charcoal",
                              )}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {busy ? "Restoring…" : "Restore"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {visibleTab === "files" && hasMediaTrash ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800 sm:px-5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Showing {allTrashedMedia.length} of {data.deletedMediaTotal} files
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actionsBusy || allTrashedMedia.length === 0}
                  onClick={toggleSelectAllMedia}
                  className="text-xs font-semibold text-studio-ink hover:underline disabled:opacity-40"
                >
                  {allMediaSelected ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="bg-zinc-50/50 p-2 dark:bg-zinc-900/30 sm:p-3">
                <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
                      ? "Raw"
                      : isFinalKind
                        ? "Final"
                        : row.kind
                          ? row.kind.charAt(0).toUpperCase() + row.kind.slice(1)
                          : "File";
                    const mkey = trashMediaKey(row);
                    const mediaChecked = selectedMediaKeys.includes(mkey);

                    return (
                      <li key={mkey} className="group/tile list-none">
                        <div
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800",
                            expired && "opacity-70",
                            mediaChecked && "ring-2 ring-brand ring-offset-1 ring-offset-zinc-50 dark:ring-offset-zinc-900",
                          )}
                        >
                          {previewSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={previewSrc}
                              alt=""
                              className="h-full w-full object-cover transition duration-300 group-hover/tile:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <FileImage className="h-6 w-6 text-zinc-400 dark:text-zinc-600" aria-hidden />
                            </div>
                          )}

                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                            {kindLabel}
                          </span>

                          <label className="absolute right-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-white/90 p-0.5 shadow-sm dark:bg-zinc-900/90">
                            <input
                              type="checkbox"
                              checked={mediaChecked}
                              disabled={actionsBusy}
                              onChange={() => toggleMediaKeyForPurge(mkey)}
                              className="h-3 w-3 rounded border-zinc-300 text-brand focus:ring-brand"
                              aria-label={`Select ${label}`}
                            />
                          </label>

                          {expired ? (
                            <span className="absolute bottom-1 left-1 rounded bg-red-600/90 px-1 py-px text-[8px] font-bold uppercase text-white">
                              Expired
                            </span>
                          ) : null}

                          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
                            <p className="line-clamp-2 text-[10px] font-medium leading-tight text-white" title={label}>
                              {label}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] text-white/75">{galleryTitle}</p>
                            {deadlineLabel ? (
                              <p className="mt-0.5 text-[9px] tabular-nums text-white/60">Until {deadlineLabel}</p>
                            ) : null}
                            <button
                              type="button"
                              disabled={expired || busy || actionsBusy}
                              onClick={() => void onRestoreMedia(row)}
                              className={cn(
                                "mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-semibold transition",
                                expired || busy || actionsBusy
                                  ? "cursor-not-allowed bg-white/20 text-white/50"
                                  : "bg-white text-zinc-900 hover:bg-zinc-100",
                              )}
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                              ) : (
                                <RotateCcw className="h-3 w-3" aria-hidden />
                              )}
                              {busy ? "…" : "Restore"}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {mediaNextPage !== null && allTrashedMedia.length < data.deletedMediaTotal ? (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      disabled={mediaLoadingMore || actionsBusy}
                      onClick={() => void loadMoreMedia()}
                      className={cn(
                        "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 transition hover:border-studio-ink hover:bg-[#f5f5f5] hover:text-studio-ink",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {mediaLoadingMore ? (
                        "Loading…"
                      ) : (
                        <>
                          <span>Load more</span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {deletePrompt ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="trash-delete-title"
          aria-describedby="trash-delete-body"
          onClick={() => {
            if (!purging) setDeletePrompt(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="trash-delete-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {deletePrompt === "all" ? "Empty trash?" : "Delete selected items?"}
            </h2>
            <p id="trash-delete-body" className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {deletePrompt === "all"
                ? "Permanently delete everything in trash? This cannot be undone. Galleries and files are removed immediately."
                : `Permanently delete ${describeTrashSelection(selectedFolderIds.length, selectedMediaKeys.length) || "the selected items"}? This cannot be undone.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                disabled={purging}
                onClick={() => setDeletePrompt(null)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-45 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                No
              </button>
              <button
                type="button"
                disabled={purging}
                onClick={() => void onConfirmDelete()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-45"
              >
                {purging ? "Deleting…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPage>
  );
}
