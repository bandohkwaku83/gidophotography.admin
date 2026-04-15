"use client";

import Link from "next/link";
import { useState } from "react";
import type { DemoProject, FolderStatus } from "@/lib/demo-data";
import { deleteFolder } from "@/lib/demo-data";
import { useToast } from "@/components/toast-provider";

function statusStyles(s: FolderStatus) {
  switch (s) {
    case "DRAFT":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    case "SELECTION_PENDING":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

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

export function FolderCard({
  folder,
  shareBaseUrl,
  onDeleted,
}: {
  folder: DemoProject;
  shareBaseUrl: string;
  onDeleted?: () => void;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const link = `${shareBaseUrl}/g/${folder.shareToken}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="relative font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {folder.clientName}
          </h3>
          <p className="relative mt-1 text-xs text-zinc-500">
            Created {new Date(folder.createdAt).toLocaleDateString()} · {folder.assets.length}{" "}
            images
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusStyles(folder.status)}`}
        >
          {statusLabel(folder.status)}
        </span>
      </div>

      <div className="relative mt-4 flex flex-1 flex-col gap-2">
        <Link
          href={`/dashboard/folder/${folder.id}`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-105"
        >
          Open folder
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full rounded-xl border border-zinc-200 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Actions
          </button>
          {open ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={async () => {
                    setOpen(false);
                    try {
                      await navigator.clipboard.writeText(link);
                      showToast("Gallery link copied.", "success");
                    } catch {
                      showToast(link, "info");
                    }
                  }}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  onClick={() => {
                    setOpen(false);
                    if (!window.confirm(`Delete folder “${folder.clientName}”?`)) return;
                    deleteFolder(folder.id);
                    showToast("Folder removed.", "success");
                    onDeleted?.();
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
