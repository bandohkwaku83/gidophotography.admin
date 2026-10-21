"use client";

import { FileWarning } from "lucide-react";
import { useMemo } from "react";
import {
  InlineStatusSkeleton,
  UploadIndeterminateBarSkeleton,
} from "@/components/ui/skeletons";
import type { FolderStatus } from "@/lib/demo-data";

/** Shared cover fallback when an API folder has no `coverImage` / `coverImageUrl`. */
export const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

export function statusLabel(s: FolderStatus): string {
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

export function statusStyles(s: FolderStatus): string {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40";
    case "SELECTION_PENDING":
      return "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40";
    default:
      return "bg-white/15 text-white ring-1 ring-white/25";
  }
}

/** Sticky banner shown while a raw/final upload is in-flight in the folder detail view. */
export function UploadProgressBanner({
  kind,
  phase,
  computable,
  percent,
  fileIndex,
  fileCount,
}: {
  kind: "raw" | "final";
  phase: "preparing" | "uploading";
  computable: boolean;
  percent: number;
  fileIndex?: number;
  fileCount?: number;
}) {
  const label =
    phase === "preparing"
      ? "Preparing upload…"
      : kind === "raw"
        ? "Uploading raw photos…"
        : "Uploading finals…";
  const batchLabel =
    phase === "uploading" &&
    fileCount != null &&
    fileCount > 0 &&
    fileIndex != null &&
    fileIndex > 0
      ? `${fileIndex} of ${fileCount}`
      : null;
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
        <div className="flex shrink-0 items-center gap-2">
          {batchLabel ? (
            <span className="tabular-nums text-xs font-semibold text-brand-ink/90 dark:text-brand-on-dark/95">
              {batchLabel}
            </span>
          ) : null}
          {phase === "preparing" ? (
            <span className="shrink-0 text-xs font-medium text-brand-ink/85 dark:text-brand-on-dark/90">
              Checking…
            </span>
          ) : computable ? (
            <span className="shrink-0 tabular-nums text-sm font-semibold text-brand-ink dark:text-brand-on-dark">
              {percent}%
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium text-brand-ink/85 dark:text-brand-on-dark/90">
              Sending…
            </span>
          )}
        </div>
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

export type DuplicateUploadConflictPrompt = {
  kind: "raw" | "final";
  files: File[];
  conflictingNames: string[];
};

/** Modal that surfaces a filename overlap during a folder upload and offers skip / replace / cancel. */
export function DuplicateUploadConflictDialog({
  prompt,
  onCancel,
  onSkip,
  onReplace,
}: {
  prompt: DuplicateUploadConflictPrompt;
  onCancel: () => void;
  onSkip: () => void;
  onReplace: () => void;
}) {
  const conflictSet = useMemo(
    () => new Set(prompt.conflictingNames),
    [prompt.conflictingNames],
  );
  const newFilesCount = useMemo(
    () => prompt.files.filter((f) => !conflictSet.has(f.name)).length,
    [prompt.files, conflictSet],
  );
  const scopeLabel = prompt.kind === "raw" ? "raw uploads" : "delivered finals";
  const knowsConflictNames = prompt.conflictingNames.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-filename-dialog-title"
    >
      <div className="flex max-h-[min(90vh,36rem)] w-full max-w-md flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex shrink-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/60">
            <FileWarning className="h-5 w-5 text-amber-800 dark:text-amber-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="duplicate-filename-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Filename overlap
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {knowsConflictNames ? (
                <>
                  You’re adding <span className="font-semibold text-zinc-800 dark:text-zinc-200">{prompt.files.length}</span>{" "}
                  file{prompt.files.length === 1 ? "" : "s"} to {scopeLabel}.{" "}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {prompt.conflictingNames.length}
                  </span>{" "}
                  name{prompt.conflictingNames.length === 1 ? "" : "s"} already exist in this gallery.
                  {newFilesCount > 0 ? (
                    <>
                      {" "}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{newFilesCount}</span> file
                      {newFilesCount === 1 ? "" : "s"} can still be added if you skip duplicates.
                    </>
                  ) : (
                    <> Skipping duplicates would not add anything new — every filename in this batch already exists.</>
                  )}
                </>
              ) : (
                <>
                  You’re adding <span className="font-semibold text-zinc-800 dark:text-zinc-200">{prompt.files.length}</span>{" "}
                  file{prompt.files.length === 1 ? "" : "s"}. At least one filename matches an existing file in {scopeLabel},
                  but the exact names couldn’t be listed. Use <strong>Skip duplicates</strong> to keep what’s in the gallery,
                  or <strong>Replace existing</strong> to overwrite matches.
                </>
              )}
            </p>
          </div>
        </div>

        {knowsConflictNames ? (
          <div className="mt-4 flex min-h-0 shrink flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Conflicting names
            </p>
            <ul className="mt-2 max-h-36 shrink overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
              {prompt.conflictingNames.map((name) => (
                <li
                  key={name}
                  className="truncate border-b border-zinc-100 py-1.5 font-medium text-zinc-800 last:border-b-0 dark:border-zinc-800 dark:text-zinc-200"
                  title={name}
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Skip duplicates
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-studio-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-studio-charcoal"
          >
            Replace existing
          </button>
        </div>
      </div>
    </div>
  );
}
