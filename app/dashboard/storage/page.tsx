"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  ExternalLink,
  FolderOpen,
  ImageIcon,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchUsageGalleries,
  fetchUsageSummary,
  type UsageGalleryRow,
  type UsageSummaryResponse,
  UsageApiError,
} from "@/lib/usage-api";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : u === 1 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[u]}`;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function formatPercentDisplay(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 100) / 100;
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
  return `${text}%`;
}

type SortKey = "name" | "total";

function summaryPercents(summary: UsageSummaryResponse): {
  raw: number;
  selection: number;
  finals: number;
} {
  const total = summary.total_storage_bytes;
  const bc = summary.by_category;
  return {
    raw: bc?.raws?.percent_of_total ?? pct(summary.raws_size_bytes, total),
    selection:
      bc?.selections?.percent_of_total ?? pct(summary.selections_size_bytes, total),
    finals: bc?.finals?.percent_of_total ?? pct(summary.finals_size_bytes, total),
  };
}

function mapGalleryToRow(g: UsageGalleryRow) {
  const total =
    g.total_size_bytes ||
    g.raws_size_bytes + g.selections_size_bytes + g.finals_size_bytes;
  return {
    id: g.id,
    eventName: g.name || "—",
    clientName: g.client?.name?.trim() || "—",
    bytesRaw: g.raws_size_bytes,
    bytesSelection: g.selections_size_bytes,
    bytesFinals: g.finals_size_bytes,
    total,
  };
}

export default function StoragePage() {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [galleries, setGalleries] = useState<UsageGalleryRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [listVersion, setListVersion] = useState(0);

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const data = await fetchUsageSummary();
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setSummaryError(
        err instanceof UsageApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not load usage summary.",
      );
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadList() {
      setListError(null);
      setListLoading(true);
      try {
        if (sortKey === "total") {
          const res = await fetchUsageGalleries({
            sortBy: "total_size",
            order: sortDir,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setGalleries(res.galleries);
        } else {
          const res = await fetchUsageGalleries({
            sortBy: "total_size",
            order: "desc",
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const sorted = [...res.galleries].sort((a, b) => {
            const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
            return sortDir === "asc" ? cmp : -cmp;
          });
          setGalleries(sorted);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setGalleries([]);
        setListError(
          err instanceof UsageApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not load gallery usage.",
        );
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
    }
    void loadList();
    return () => controller.abort();
  }, [sortKey, sortDir, listVersion]);

  const sortedRows = useMemo(() => galleries.map(mapGalleryToRow), [galleries]);

  const totals = useMemo(() => {
    if (!summary) {
      return { raw: 0, selection: 0, finals: 0, used: 0, percents: { raw: 0, selection: 0, finals: 0 } };
    }
    const used = summary.total_storage_bytes;
    const percents = summaryPercents(summary);
    return {
      raw: summary.raws_size_bytes,
      selection: summary.selections_size_bytes,
      finals: summary.finals_size_bytes,
      used,
      percents,
    };
  }, [summary]);

  function toggleSort(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "total" ? "desc" : "asc");
      return key;
    });
  }

  const showEmptyList = !listLoading && sortedRows.length === 0 && !listError;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        {summaryError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {summaryError}
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => void loadSummary()}
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Overall usage
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Total stored across all galleries (raws, selections, and finals).
            </p>
          </div>
          <div className="text-right">
            {summaryLoading ? (
              <div className="h-9 w-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatBytes(totals.used)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">total</p>
              </>
            )}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {(["raw", "selection", "finals"] as const).map((key) => {
            const label =
              key === "raw" ? "Raws" : key === "selection" ? "Selections" : "Finals";
            const Icon = key === "raw" ? Layers : key === "selection" ? ImageIcon : Sparkles;
            const bytes =
              key === "raw"
                ? totals.raw
                : key === "selection"
                  ? totals.selection
                  : totals.finals;
            const p =
              key === "raw"
                ? totals.percents.raw
                : key === "selection"
                  ? totals.percents.selection
                  : totals.percents.finals;
            return (
              <div
                key={key}
                className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <dt className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {summaryLoading ? (
                    <span className="inline-block h-7 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  ) : (
                    formatBytes(bytes)
                  )}
                </dd>
                <dd className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {summaryLoading ? (
                    <span className="inline-block h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  ) : (
                    `${formatPercentDisplay(p)} of your uploads`
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <FolderOpen className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Per-gallery usage
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Sorted by total size via the API; name sorting is applied in the browser.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleSort("total")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                sortKey === "total"
                  ? "border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
              )}
            >
              {sortKey === "total" && sortDir === "desc" ? (
                <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />
              ) : sortKey === "total" ? (
                <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5 opacity-50" aria-hidden />
              )}
              Total size
            </button>
            <button
              type="button"
              onClick={() => toggleSort("name")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                sortKey === "name"
                  ? "border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
              )}
            >
              {sortKey === "name" && sortDir === "desc" ? (
                <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden />
              ) : sortKey === "name" ? (
                <ArrowUpAZ className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ArrowDownAZ className="h-3.5 w-3.5 opacity-50" aria-hidden />
              )}
              Name
            </button>
          </div>
        </div>

        {listError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 sm:px-6">
            <span className="text-sm text-red-700 dark:text-red-300">{listError}</span>
            <button
              type="button"
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-900/40"
              onClick={() => setListVersion((v) => v + 1)}
            >
              Retry
            </button>
          </div>
        ) : null}

        {listLoading && sortedRows.length === 0 ? (
          <div className="space-y-3 px-5 py-8 sm:px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : showEmptyList ? (
          <div className="px-5 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400 sm:px-6">
            No galleries with usage data yet.
          </div>
        ) : (
          <>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 md:hidden">
              {sortedRows.map((row) => (
                <div key={row.id} className="space-y-3 px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {row.eventName}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {row.clientName}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/folder/${row.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      Open
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                  <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatBytes(row.total)}{" "}
                    <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      total
                    </span>
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/60">
                      <p className="text-zinc-500 dark:text-zinc-400">Raws</p>
                      <p className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        {formatBytes(row.bytesRaw)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/60">
                      <p className="text-zinc-500 dark:text-zinc-400">Selections</p>
                      <p className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        {formatBytes(row.bytesSelection)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/60">
                      <p className="text-zinc-500 dark:text-zinc-400">Finals</p>
                      <p className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        {formatBytes(row.bytesFinals)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative hidden overflow-x-auto md:block">
              {listLoading ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end bg-white/60 px-4 py-3 dark:bg-zinc-950/60">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Updating…
                  </span>
                </div>
              ) : null}
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <th className="px-5 py-3 sm:px-6">Gallery</th>
                    <th className="px-3 py-3">Client</th>
                    <th className="px-3 py-3 text-right tabular-nums">Raws</th>
                    <th className="px-3 py-3 text-right tabular-nums">Selections</th>
                    <th className="px-3 py-3 text-right tabular-nums">Finals</th>
                    <th className="px-5 py-3 text-right tabular-nums sm:px-6">Total</th>
                    <th className="w-px px-5 py-3 sm:px-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {sortedRows.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-5 py-3.5 font-medium text-zinc-900 dark:text-zinc-100 sm:px-6">
                        {row.eventName}
                      </td>
                      <td className="px-3 py-3.5 text-zinc-600 dark:text-zinc-300">
                        {row.clientName}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatBytes(row.bytesRaw)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatBytes(row.bytesSelection)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                        {formatBytes(row.bytesFinals)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 sm:px-6">
                        {formatBytes(row.total)}
                      </td>
                      <td className="px-5 py-3.5 sm:px-6">
                        <Link
                          href={`/dashboard/folder/${row.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-800 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                          aria-label={`Open gallery ${row.eventName}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
