"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateFolderModal } from "@/components/photographer/create-folder-modal";
import { FolderCard } from "@/components/photographer/folder-card";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { loadAllProjects } from "@/lib/demo-data";

export default function DashboardPage() {
  const { query } = useFolderListSearch();
  const [createOpen, setCreateOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

  // tick: bump after folder delete / modal close so sessionStorage merges re-run.
  const folders = useMemo(() => {
    const all = loadAllProjects();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.clientName.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces list refresh
  }, [query, tick]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.12),transparent_45%),radial-gradient(circle_at_left,_rgba(14,165,233,0.1),transparent_40%)]" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
          Overview
        </p>
        <h1 className="relative mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="relative mt-1 text-sm text-zinc-500">
          Overview of your client folders (demo data + session storage).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active folders", value: String(folders.length) },
          { label: "Awaiting selection", value: String(folders.filter((f) => f.status === "SELECTION_PENDING").length) },
          { label: "Completed", value: String(folders.filter((f) => f.status === "COMPLETED").length) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {s.value}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" />
            </div>
          </div>
        ))}
      </div>

      <section id="folders" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Folders</h2>
            <p className="text-sm text-zinc-500">Each card is one client gallery.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105"
          >
            + Create new folder
          </button>
        </div>

        {folders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            No folders match your search.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                shareBaseUrl={origin || ""}
                onDeleted={() => setTick((t) => t + 1)}
              />
            ))}
          </div>
        )}
      </section>

      <CreateFolderModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setTick((t) => t + 1);
        }}
      />
    </div>
  );
}
