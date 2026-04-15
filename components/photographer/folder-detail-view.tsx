"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { UploadDragger } from "@/components/photographer/upload-dragger";
import type { DemoAsset, DemoFinalAsset, DemoProject } from "@/lib/demo-data";
import {
  loadProjectById,
  nextAssetId,
  regenerateShareLink,
  saveProjectSnapshot,
} from "@/lib/demo-data";

type Tab = "uploads" | "selection" | "finals";

export function FolderDetailView({ folderId }: { folderId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rev, setRev] = useState(0);
  const [tab, setTab] = useState<Tab>("uploads");
  const [selFilter, setSelFilter] = useState<"all" | "selected">("all");

  // rev: bump after save/regenerate so merged folder reloads from session overrides.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rev intentionally invalidates cache
  const project = useMemo(() => loadProjectById(folderId), [folderId, rev]);

  if (!project) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Folder not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-50">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const folder: DemoProject = project;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/g/${folder.shareToken}`
      : `/g/${folder.shareToken}`;

  function bump() {
    setRev((r) => r + 1);
    router.refresh();
  }

  function persist(next: DemoProject) {
    saveProjectSnapshot(next);
    bump();
  }

  function onRawUpload(files: File[]) {
    const added: DemoAsset[] = files.map((file) => ({
      id: nextAssetId(),
      originalName: file.name,
      selection: "UNSELECTED",
      editState: "NONE",
      clientComment: "",
      hasEdited: false,
      thumbUrl: URL.createObjectURL(file),
    }));
    persist({ ...folder, assets: [...folder.assets, ...added] });
    showToast(`${files.length} image(s) added (local preview).`, "success");
  }

  function onFinalUpload(files: File[]) {
    const added: DemoFinalAsset[] = files.map((file, i) => ({
      id: `f-${Date.now()}-${i}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    persist({ ...folder, finalAssets: [...folder.finalAssets, ...added] });
    showToast(`${files.length} final(s) added.`, "success");
  }

  function removeAsset(id: string) {
    persist({ ...folder, assets: folder.assets.filter((a) => a.id !== id) });
  }

  function setAssetEditState(id: string, editState: DemoAsset["editState"]) {
    persist({
      ...folder,
      assets: folder.assets.map((a) => (a.id === id ? { ...a, editState } : a)),
    });
  }

  function onRegenerateLink() {
    regenerateShareLink(folder.id);
    bump();
    showToast("New gallery link generated.", "success");
  }

  const selectionAssets =
    selFilter === "selected"
      ? folder.assets.filter((a) => a.selection === "SELECTED")
      : folder.assets;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <nav className="text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-800 dark:hover:text-zinc-200">
          Dashboard
        </Link>
        <span className="mx-2 text-zinc-300">/</span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{folder.clientName}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {folder.clientName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Event {new Date(folder.eventDate).toLocaleDateString()}
            {folder.description ? ` · ${folder.description}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              persist({ ...folder, status: "COMPLETED" });
              showToast("Marked as completed.", "success");
            }}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Mark completed
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Client gallery link
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs text-zinc-500">
            Read-only URL
            <input
              readOnly
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              value={shareUrl}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  showToast("Link copied.", "success");
                } catch {
                  showToast(shareUrl, "info");
                }
              }}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={onRegenerateLink}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Regenerate link
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={folder.sharePasswordEnabled}
              onChange={(e) => {
                persist({ ...folder, sharePasswordEnabled: e.target.checked });
              }}
              className="rounded border-zinc-300"
            />
            Password protection (UI only)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            Link expiry
            <select
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-black"
              value={folder.shareExpiryDays ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                persist({
                  ...folder,
                  shareExpiryDays: v === "" ? null : Number(v),
                });
              }}
            >
              <option value="">No expiry</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>
      </section>

      <div className="flex gap-1 rounded-2xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/50">
        {(
          [
            ["uploads", "Uploads (raw)"],
            ["selection", "Client selection"],
            ["finals", "Final images"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "uploads" ? (
        <div className="space-y-6">
          <UploadDragger onFiles={onRawUpload} />
          {folder.assets.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No uploads yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folder.assets.map((a) => (
                <li
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 p-3">
                    <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {a.originalName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAsset(a.id)}
                      className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "selection" ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["all", "selected"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSelFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  selFilter === f
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                    : "border border-zinc-300 dark:border-zinc-600"
                }`}
              >
                {f === "all" ? "All" : "Selected"}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-500">
            Client picks appear here. Highlighted cards are marked selected in the gallery.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectionAssets.map((a) => (
              <li
                key={a.id}
                className={`overflow-hidden rounded-2xl border bg-white dark:bg-zinc-950 ${
                  a.selection === "SELECTED"
                    ? "border-rose-300 ring-2 ring-rose-100 dark:border-rose-800 dark:ring-rose-950"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="space-y-2 p-3 text-xs">
                  <p className="font-medium text-zinc-800 dark:text-zinc-100">{a.originalName}</p>
                  <p className="text-zinc-500">
                    {a.selection === "SELECTED" ? "Selected by client" : "Not selected"}
                  </p>
                  {a.clientComment ? (
                    <p className="text-zinc-600 dark:text-zinc-300">“{a.clientComment}”</p>
                  ) : null}
                  {a.selection === "SELECTED" ? (
                    <label className="block text-[11px] font-semibold uppercase text-zinc-400">
                      Edit status
                      <select
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-black"
                        value={a.editState}
                        onChange={(e) =>
                          setAssetEditState(a.id, e.target.value as DemoAsset["editState"])
                        }
                      >
                        <option value="NONE">Not started</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="EDITED">Edited</option>
                      </select>
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "finals" ? (
        <div className="space-y-6">
          <UploadDragger
            label="Drop edited finals here"
            hint="Deliver finished files to the client view (local preview)."
            onFiles={onFinalUpload}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">{folder.finalAssets.length} final(s)</p>
            <button
              type="button"
              onClick={() =>
                showToast("ZIP download needs a backend to bundle files.", "info")
              }
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
            >
              Download all (ZIP)
            </button>
          </div>
          {folder.finalAssets.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No finals uploaded yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folder.finalAssets.map((f) => (
                <li
                  key={f.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="p-3 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                    {f.name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
