"use client";

import { useMemo } from "react";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { loadAllProjects } from "@/lib/demo-data";

export default function DownloadsPage() {
  const { query } = useFolderListSearch();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return loadAllProjects()
      .filter((p) => !q || p.clientName.toLowerCase().includes(q))
      .map((p) => ({
        id: p.id,
        client: p.clientName,
        finals: p.finalAssets.length,
        status: p.status,
        lastUpdated: new Date(p.updatedAt).toLocaleDateString(),
      }));
  }, [query]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Downloads
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track delivered edits and client download readiness.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{row.client}</h2>
            <p className="mt-1 text-sm text-zinc-500">Last updated {row.lastUpdated}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-zinc-500">Final images ready</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{row.finals}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-zinc-500">Status</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {row.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
