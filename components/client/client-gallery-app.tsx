"use client";

import { useCallback, useMemo, useState } from "react";
import { STUDIO_NAME } from "@/lib/branding";
import type { DemoAsset, DemoProject } from "@/lib/demo-data";
import { loadProjectByShareToken, saveProjectSnapshot } from "@/lib/demo-data";
import { useToast } from "@/components/toast-provider";

export function ClientGalleryApp({ token }: { token: string }) {
  const { showToast } = useToast();
  const project = useMemo(() => loadProjectByShareToken(token), [token]);
  const [assets, setAssets] = useState<DemoAsset[]>(() =>
    loadProjectByShareToken(token)?.assets.map((a) => ({ ...a })) ?? [],
  );
  const [locked, setLocked] = useState(
    () => loadProjectByShareToken(token)?.selectionSubmitted ?? false,
  );
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientTab, setClientTab] = useState<"select" | "delivery">("select");
  const [zoom, setZoom] = useState(1);

  const selectedCount = assets.filter((a) => a.selection === "SELECTED").length;
  const hasFinals = project ? project.finalAssets.length > 0 : false;

  const openLb = useCallback(
    (id: string) => {
      const i = assets.findIndex((a) => a.id === id);
      if (i >= 0) {
        setLightbox(i);
        setZoom(1);
      }
    },
    [assets],
  );

  if (!project) return null;

  function toggleSelect(id: string) {
    if (locked) return;
    setAssets((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              selection: a.selection === "SELECTED" ? "UNSELECTED" : "SELECTED",
            }
          : a,
      ),
    );
  }

  function submitSelections() {
    const latest = loadProjectByShareToken(token);
    if (!latest) return;
    const merged: DemoProject = {
      ...latest,
      assets,
      selectionSubmitted: true,
      status: "SELECTION_PENDING",
      updatedAt: new Date().toISOString(),
    };
    saveProjectSnapshot(merged);
    setLocked(true);
    setConfirmOpen(false);
    showToast("Selections submitted. Thank you!", "success");
  }

  const lbAsset = lightbox !== null ? assets[lightbox] : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-6 dark:border-zinc-800 dark:bg-zinc-950 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {STUDIO_NAME}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.clientName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {new Date(project.eventDate).toLocaleDateString(undefined, {
            dateStyle: "long",
          })}
        </p>
      </header>

      {hasFinals ? (
        <div className="mx-auto flex max-w-3xl gap-1 border-b border-zinc-200 px-4 dark:border-zinc-800">
          {(
            [
              ["select", "Pick favorites"],
              ["delivery", "Downloads"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setClientTab(key)}
              className={`flex-1 border-b-2 py-3 text-sm font-medium transition ${
                clientTab === key
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {locked && (
        <div className="mx-auto max-w-3xl px-4 py-3">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Your selections have been submitted. The photographer has been notified (demo: saved
            in this browser only).
          </p>
        </div>
      )}

      {clientTab === "select" ? (
        <main className="mx-auto max-w-6xl px-4 py-8 pb-32 lg:px-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <li
                key={a.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-zinc-950 ${
                  a.selection === "SELECTED"
                    ? "border-rose-400 ring-2 ring-rose-100 dark:border-rose-700 dark:ring-rose-950"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => openLb(a.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.thumbUrl}
                    alt={a.originalName}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </button>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {a.originalName}
                    </span>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => toggleSelect(a.id)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        a.selection === "SELECTED"
                          ? "bg-rose-600 text-white"
                          : "border border-zinc-200 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {a.selection === "SELECTED" ? "♥" : "♡"}
                    </button>
                  </div>
                  <label className="block text-[11px] text-zinc-500">
                    Note (optional)
                    <textarea
                      disabled={locked}
                      value={a.clientComment}
                      onChange={(e) =>
                        setAssets((prev) =>
                          prev.map((x) =>
                            x.id === a.id ? { ...x, clientComment: e.target.value } : x,
                          ),
                        )
                      }
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:px-8">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Final edited files from your photographer.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.finalAssets.map((f) => (
              <li
                key={f.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="aspect-[4/3] w-full object-cover" />
                <div className="p-3">
                  <a
                    href={f.url}
                    download={f.name}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-zinc-900 underline dark:text-zinc-50"
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              showToast("ZIP bundles are created on the server in a full build.", "info")
            }
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
          >
            Download all (ZIP)
          </button>
        </main>
      )}

      {lightbox !== null && lbAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setLightbox(null)}
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-5xl flex-1 flex-col gap-4">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
              >
                Zoom −
              </button>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lbAsset.thumbUrl}
                alt={lbAsset.originalName}
                className="max-h-[75vh] max-w-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-white">
              <button
                type="button"
                disabled={lightbox <= 0}
                onClick={() => {
                  setLightbox((i) => (i !== null && i > 0 ? i - 1 : i));
                  setZoom(1);
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => toggleSelect(lbAsset.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  lbAsset.selection === "SELECTED"
                    ? "bg-rose-500 text-white"
                    : "border border-white/40 text-white"
                }`}
              >
                {lbAsset.selection === "SELECTED" ? "Selected" : "Select"}
              </button>
              <button
                type="button"
                disabled={lightbox >= assets.length - 1}
                onClick={() => {
                  setLightbox((i) =>
                    i !== null && i < assets.length - 1 ? i + 1 : i,
                  );
                  setZoom(1);
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clientTab === "select" && !locked ? (
        <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="mx-auto flex max-w-3xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{selectedCount}</span>{" "}
              selected
            </p>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setConfirmOpen(true)}
              className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-black"
            >
              Submit selection
            </button>
          </div>
        </footer>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Submit your selection?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              You chose {selectedCount} image{selectedCount === 1 ? "" : "s"}. In this demo, the
              choice is saved in your browser for the photographer view.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSelections}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
