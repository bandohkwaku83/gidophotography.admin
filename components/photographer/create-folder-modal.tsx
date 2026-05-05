"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CoverFocalPreview } from "@/components/photographer/cover-focal-preview";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import {
  AlignLeft,
  CalendarDays,
  Clock,
  FolderPlus,
  ImagePlus,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { listClients, type ApiClient } from "@/lib/clients-api";
import {
  createFolder,
  FALLBACK_SHARE_EXPIRY_PRESETS,
  getFolderClientId,
  getFolderCoverUrl,
  getShareLinkExpiryPresets,
  parseFolderCoverFocal,
  updateFolder,
  type ApiFolder,
  type ShareLinkExpiryPreset,
} from "@/lib/folders-api";

type Props = {
  open: boolean;
  onClose: () => void;
  /** When provided, the modal switches to edit mode. */
  folder?: ApiFolder | null;
  /** Called after a successful create or update. */
  onSaved?: (folder: ApiFolder) => void;
};

export function CreateFolderModal({ open, onClose, folder, onSaved }: Props) {
  const { showToast } = useToast();
  const isEdit = Boolean(folder?._id);

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [clientId, setClientId] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [useDefaultCover, setUseDefaultCover] = useState(true);
  const [linkExpiry, setLinkExpiry] = useState("30d");
  const [expiryPresets, setExpiryPresets] = useState<ShareLinkExpiryPreset[]>(
    FALLBACK_SHARE_EXPIRY_PRESETS,
  );
  const [busy, setBusy] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [coverFocalX, setCoverFocalX] = useState(50);
  const [coverFocalY, setCoverFocalY] = useState(50);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setClientId(folder ? getFolderClientId(folder) : "");
    setEventName(folder?.eventName ?? "");
    setEventDate(folder?.eventDate ? folder.eventDate.slice(0, 10) : "");
    setDescription(folder?.description ?? "");
    setCoverFile(null);
    setCoverPreview(folder ? getFolderCoverUrl(folder) : null);
    setUseDefaultCover(folder ? folder.usingDefaultCover !== false : true);
    const focal = folder ? parseFolderCoverFocal(folder) : { x: 50, y: 50 };
    setCoverFocalX(focal.x);
    setCoverFocalY(focal.y);
    setLinkExpiry("30d");
    setBusy(false);
  }, [open, folder]);

  useEffect(() => {
    if (!open || isEdit) return;
    let cancelled = false;
    getShareLinkExpiryPresets()
      .then((list) => {
        if (!cancelled && list.length > 0) setExpiryPresets(list);
      })
      .catch(() => {
        if (!cancelled) setExpiryPresets(FALLBACK_SHARE_EXPIRY_PRESETS);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit]);

  useEffect(() => {
    if (!linkExpiry || !expiryPresets.some((p) => p.id === linkExpiry)) {
      setLinkExpiry(expiryPresets[0]?.id ?? "30d");
    }
  }, [expiryPresets]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClientsLoading(true);
    listClients()
      .then((data) => {
        if (!cancelled) setClients(data.clients);
      })
      .catch((err) => {
        if (cancelled) return;
        showToast(
          err instanceof Error ? err.message : "Failed to load clients.",
          "error",
        );
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showToast]);

  useEffect(() => {
    if (!open) setAddClientOpen(false);
  }, [open]);

  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const showCoverFocalPicker = useMemo(
    () =>
      Boolean(
        coverPreview &&
          (coverFile || (isEdit && folder != null && folder.usingDefaultCover === false)),
      ),
    [coverPreview, coverFile, isEdit, folder],
  );

  function handleNewClientSaved(saved: ApiClient) {
    setClients((prev) => {
      if (prev.some((c) => c._id === saved._id)) {
        return prev.map((c) => (c._id === saved._id ? saved : c));
      }
      return [...prev, saved];
    });
    setClientId(saved._id);
  }

  if (!open) return null;

  function handleClose() {
    if (busy) return;
    onClose();
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.type.startsWith("image/")) {
      showToast("Please choose an image file.", "error");
      e.currentTarget.value = "";
      return;
    }
    setCoverFile(file);
    if (file) {
      setUseDefaultCover(false);
      setCoverFocalX(50);
      setCoverFocalY(50);
    }
    e.currentTarget.value = "";
  }

  function clearCover() {
    setCoverFile(null);
    setCoverPreview(null);
    setUseDefaultCover(true);
    setCoverFocalX(50);
    setCoverFocalY(50);
  }

  async function submit() {
    if (busy) return;

    const trimmedEventName = eventName.trim();
    const trimmedDescription = description.trim();

    if (!isEdit && !clientId) {
      showToast("Please select a client.", "error");
      return;
    }
    if (!trimmedEventName) {
      showToast("Please enter an event name.", "error");
      return;
    }
    if (!eventDate) {
      showToast("Please pick an event date.", "error");
      return;
    }

    setBusy(true);
    try {
      const shouldSendFocal = Boolean(coverFile) || (!useDefaultCover && Boolean(coverPreview));
      const focalFields = shouldSendFocal ? { coverFocalX, coverFocalY } : {};

      const saved = isEdit
        ? await updateFolder(folder!._id, {
            eventName: trimmedEventName,
            eventDate,
            description: trimmedDescription,
            coverImage: coverFile ?? null,
            useDefaultCover: coverFile ? false : useDefaultCover,
            ...focalFields,
          })
        : await createFolder({
            clientId,
            eventName: trimmedEventName,
            eventDate,
            description: trimmedDescription,
            linkExpiry,
            coverImage: coverFile ?? null,
            useDefaultCover,
            ...focalFields,
          });

      showToast(isEdit ? "Folder updated." : "Folder created.", "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : isEdit
            ? "Failed to update folder."
            : "Failed to create folder.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

  const labelClass =
    "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain p-4 py-6 sm:py-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-2xl shadow-zinc-900/10 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/5"
      >
        <div className="shrink-0 border-b border-zinc-100 bg-gradient-to-br from-brand-soft/90 to-white px-6 py-5 dark:border-zinc-800 dark:from-brand/25 dark:to-zinc-950">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-md shadow-brand/25">
              <FolderPlus className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {isEdit ? "Edit folder" : "New folder"}
              </h2>
              <p className="mt-0.5 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                {isEdit
                  ? "Update details or swap the cover image."
                  : "Choose a client, event info, and share defaults."}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
          <div className="space-y-4 rounded-2xl bg-zinc-50/90 p-4 dark:bg-zinc-900/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Details
            </p>
            {!isEdit ? (
              <label className="block">
                <span className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${labelClass}`}>
                    <UserRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                    Client
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddClientOpen(true)}
                    disabled={busy || clientsLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0 text-brand dark:text-brand-on-dark" aria-hidden />
                    Add client
                  </button>
                </span>
                <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={busy || clientsLoading}>
                  <option value="" disabled>
                    {clientsLoading ? "Loading clients…" : "Select a client"}
                  </option>
                  {sortedClients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className={labelClass}>Event name</span>
              <input
                type="text"
                className={inputClass}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Sarah & James — wedding day"
                disabled={busy}
              />
            </label>

            <label className="block">
              <span className={`inline-flex items-center gap-1.5 ${labelClass}`}>
                <CalendarDays className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                Event date
              </span>
              <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={busy} />
            </label>

            <label className="block">
              <span className={`inline-flex items-center gap-1.5 ${labelClass}`}>
                <AlignLeft className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                Description
                <span className="font-normal normal-case text-zinc-400">(optional)</span>
              </span>
              <textarea
                className={`${inputClass} min-h-[92px] resize-y`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes for this gallery…"
                disabled={busy}
              />
            </label>
          </div>

          {!isEdit ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Sharing
              </p>
              <label className="block">
                <span className={`inline-flex items-center gap-1.5 ${labelClass}`}>
                  <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                  Share link expiry
                </span>
                <select
                  className={inputClass}
                  value={
                    expiryPresets.some((p) => p.id === linkExpiry)
                      ? linkExpiry
                      : (expiryPresets[0]?.id ?? "30d")
                  }
                  onChange={(e) => setLinkExpiry(e.target.value)}
                  disabled={busy}
                >
                  {expiryPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Cover
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {showCoverFocalPicker && coverPreview ? (
                <CoverFocalPreview
                  imageUrl={coverPreview}
                  focalX={coverFocalX}
                  focalY={coverFocalY}
                  onFocalChange={(x, y) => {
                    setCoverFocalX(x);
                    setCoverFocalY(y);
                  }}
                  disabled={busy}
                  topRight={
                    <button
                      type="button"
                      onClick={clearCover}
                      disabled={busy}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-sm transition hover:bg-black/80"
                      aria-label="Remove cover"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  }
                />
              ) : (
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-100 to-zinc-50 shadow-inner dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950 sm:h-36 sm:w-44 sm:shrink-0">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-3 text-center sm:min-h-0">
                      <ImagePlus className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {useDefaultCover ? "Studio default" : "No image"}
                      </span>
                    </div>
                  )}
                  {coverPreview ? (
                    <button
                      type="button"
                      onClick={clearCover}
                      disabled={busy}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-sm transition hover:bg-black/80"
                      aria-label="Remove cover"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <button
                  type="button"
                  onClick={pickFile}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <ImagePlus className="h-4 w-4 text-brand dark:text-brand-on-dark" aria-hidden />
                  {coverFile ? "Replace image" : coverPreview ? "Change image" : "Upload cover"}
                </button>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-1 py-1 text-sm text-zinc-600 transition hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80">
                  <input
                    type="checkbox"
                    checked={useDefaultCover && !coverFile}
                    disabled={busy || Boolean(coverFile)}
                    onChange={(e) => {
                      setUseDefaultCover(e.target.checked);
                      if (e.target.checked) {
                        setCoverFile(null);
                        setCoverPreview(null);
                        setCoverFocalX(50);
                        setCoverFocalY(50);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-brand focus:ring-brand"
                  />
                  <span>Use the studio default cover instead of uploading.</span>
                </label>
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={onFileChange} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            aria-busy={busy}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
          >
            {busy ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
      <CreateClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSaved={handleNewClientSaved}
      />
    </>
  );
}
