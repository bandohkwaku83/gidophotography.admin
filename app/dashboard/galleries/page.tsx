"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { DashboardPage } from "@/components/photographer/dashboard-page";
import { FolderCard } from "@/components/photographer/folder-card";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { CreateFolderModal } from "@/components/photographer/create-folder-modal";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";
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

function GalleriesPageInner() {
  const { query, setQuery } = useFolderListSearch();
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get("client")?.trim() ?? "";
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
    async (search: string, clientId: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const list = await listFolders({
          search,
          clientId: clientId || undefined,
        });
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
      fetchFolders(query.trim(), clientFilter, controller.signal);
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, clientFilter, fetchFolders]);

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

  const statusCounts = useMemo(() => {
    let draft = 0;
    let selecting = 0;
    let done = 0;
    for (const folder of folders) {
      const status = apiFolderStatusToUi(folder.status);
      if (status === "COMPLETED") done += 1;
      else if (status === "SELECTION_PENDING") selecting += 1;
      else draft += 1;
    }
    return {
      all: folders.length,
      DRAFT: draft,
      SELECTION_PENDING: selecting,
      COMPLETED: done,
    };
  }, [folders]);

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  return (
    <DashboardPage className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-studio-ink">Galleries</h1>
          <p className="mt-0.5 max-w-xl text-sm text-studio-taupe">
            Upload raws, track client selection, and deliver finals.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-studio-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-studio-charcoal"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New gallery
        </button>
      </section>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7D4D4] bg-[#F8F1F1] px-4 py-3 text-sm text-studio-burgundy">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchFolders(trimmed, clientFilter)}
            className="rounded-lg border border-[#E7D4D4] bg-white px-3 py-1.5 text-xs font-medium text-studio-burgundy transition hover:bg-[#F3E4E4]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {clientFilter ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-studio-taupe">
          <span>
            Galleries for{" "}
            <span className="font-medium text-studio-ink">
              {clientNameById.get(clientFilter) ?? "this client"}
            </span>
          </span>
          <Link
            href="/dashboard/galleries"
            className="inline-flex items-center gap-1 rounded-lg bg-[#f5f5f5] px-2.5 py-1 text-[12px] font-medium text-studio-ink transition hover:bg-[#ececec]"
          >
            Show all
            <X className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : null}

      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-studio-taupe"
            aria-hidden
          />
          <input
            id="gallery-page-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search galleries"
            className="w-full rounded-lg border border-studio-line bg-white py-2 pr-10 pl-9 text-sm text-studio-ink shadow-[0_1px_2px_rgba(26,22,18,0.04)] outline-none transition placeholder:text-[#b3a89a] focus:border-studio-gold focus:ring-2 focus:ring-studio-gold/25"
            aria-label="Search galleries"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-studio-taupe transition hover:bg-[#f5f5f5] hover:text-studio-ink"
              aria-label="Clear gallery search"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter galleries by status">
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.key;
            const count = statusCounts[filter.key];
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(filter.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "bg-studio-ink text-white"
                    : "bg-[#f5f5f5] text-studio-ink hover:bg-[#ececec]",
                )}
              >
                {filter.label}
                <span className={cn("tabular-nums", active ? "text-white/70" : "text-studio-taupe")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {showSpinner ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <GalleryCardSkeleton key={i} />
          ))}
        </div>
      ) : showEmpty ? (
        <div className="rounded-xl border border-studio-line bg-white px-6 py-16 text-center">
          <h2 className="text-sm font-medium text-studio-ink">
            {trimmed || statusFilter !== "all" || clientFilter ? "No matches" : "No galleries yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-studio-taupe">
            {trimmed
              ? "Try another search, or clear the search box to see every gallery."
              : clientFilter
                ? `${clientNameById.get(clientFilter) ?? "This client"} does not have a gallery yet.`
                : statusFilter !== "all"
                  ? "No galleries match this status yet."
                  : "Create a gallery to start sharing proofs."}
          </p>
          {!trimmed && statusFilter === "all" ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-studio-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-studio-charcoal"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New gallery
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
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

export default function GalleriesPage() {
  return (
    <Suspense
      fallback={
        <DashboardPage className="space-y-5">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-[#EFE8DC]" />
          <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <GalleryCardSkeleton key={i} />
            ))}
          </div>
        </DashboardPage>
      }
    >
      <GalleriesPageInner />
    </Suspense>
  );
}
