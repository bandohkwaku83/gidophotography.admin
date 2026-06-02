"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Plus, Search, Sparkles, X } from "lucide-react";
import { DashboardPage } from "@/components/photographer/dashboard-page";
import { FolderCard } from "@/components/photographer/folder-card";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { CreateFolderModal } from "@/components/photographer/create-folder-modal";
import { useToast } from "@/components/toast-provider";
import {
  apiFolderStatusToUi,
  deleteFolder,
  listFolders,
  FoldersApiError,
  formatRestoreBeforeLabel,
  type ApiFolder,
} from "@/lib/folders-api";
import { listClients } from "@/lib/clients-api";
import { GalleryCardSkeleton, ListRefreshSkeleton } from "@/components/ui/skeletons";
import type { FolderStatus } from "@/lib/demo-data";

type GalleryStatusFilter = "all" | FolderStatus;

const STATUS_FILTERS: { key: GalleryStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SELECTION_PENDING", label: "Selecting" },
  { key: "COMPLETED", label: "Done" },
];

export default function GalleriesPage() {
  const { query, setQuery } = useFolderListSearch();
  const { showToast } = useToast();

  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GalleryStatusFilter>("all");

  const [clientNameById, setClientNameById] = useState<Map<string, string>>(
    new Map(),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiFolder | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchFolders = useCallback(
    async (search: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const list = await listFolders({ search });
        if (signal?.aborted) return;
        setFolders(list);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load folders.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetchFolders(query.trim(), controller.signal);
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, fetchFolders]);

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

  const handleSaved = useCallback((saved: ApiFolder) => {
    setFolders((prev) => {
      const exists = prev.some((f) => f._id === saved._id);
      return exists
        ? prev.map((f) => (f._id === saved._id ? saved : f))
        : [saved, ...prev];
    });
  }, []);

  const handleDelete = useCallback(
    async (folder: ApiFolder) => {
      if (pendingDeleteId) return;
      setPendingDeleteId(folder._id);
      try {
        const result = await deleteFolder(folder._id);
        setFolders((prev) => prev.filter((f) => f._id !== folder._id));
        const deadline = formatRestoreBeforeLabel(result.restoreBefore);
        showToast(
          deadline
            ? `Gallery moved to trash. Restore by ${deadline} (${result.retentionDays}-day window). Open Trash in the sidebar to restore.`
            : result.message,
          "success",
        );
      } catch (err) {
        showToast(
          err instanceof FoldersApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to move gallery to trash.",
          "error",
        );
      } finally {
        setPendingDeleteId(null);
      }
    },
    [pendingDeleteId, showToast],
  );

  const visibleFolders = useMemo(
    () =>
      statusFilter === "all"
        ? folders
        : folders.filter((folder) => apiFolderStatusToUi(folder.status) === statusFilter),
    [folders, statusFilter],
  );

  const showEmpty = !loading && visibleFolders.length === 0;
  const showSpinner = loading && folders.length === 0;
  const trimmed = useMemo(() => query.trim(), [query]);

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  return (
    <DashboardPage className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-12 h-48 w-48 rounded-full bg-brand/[0.12] blur-3xl dark:bg-brand/10"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/25">
              <FolderOpen className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.65rem] sm:leading-tight">
                Galleries
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                Open a gallery to upload raws, track client selection, and deliver finals all in one
                place.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            New gallery
          </button>
        </div>
      </section>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchFolders(trimmed)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            id="gallery-page-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search galleries"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-10 text-sm text-zinc-900 outline-none ring-brand/35 transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-brand/40 dark:placeholder:text-zinc-500"
            aria-label="Search galleries"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Clear gallery search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter galleries by status">
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(filter.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-brand text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      {showSpinner ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <GalleryCardSkeleton key={i} />
          ))}
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-gradient-to-b from-zinc-50/80 to-white px-6 py-16 text-center dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950 sm:px-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand dark:bg-brand/25 dark:text-brand-on-dark">
            <FolderOpen className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {trimmed || statusFilter !== "all" ? "No matches" : "Create your first gallery"}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {trimmed
              ? "Try another search, or clear the search box to see all galleries."
              : statusFilter !== "all"
                ? "No galleries match this status filter yet."
              : "Galleries hold raws, client picks, and finals. Add one to get started."}
          </p>
          {!trimmed && statusFilter === "all" ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New gallery
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleFolders.map((g) => (
            <FolderCard
              key={g._id}
              folder={g}
              clientNameById={clientNameById}
              busy={pendingDeleteId === g._id}
              onEdit={(f) => {
                setEditing(f);
                setCreateOpen(true);
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {loading && folders.length > 0 ? <ListRefreshSkeleton /> : null}

      <CreateFolderModal
        open={createOpen}
        folder={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </DashboardPage>
  );
}
