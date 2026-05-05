"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  ChevronUp,
  Copy,
  ExternalLink,
  Focus,
  ImageIcon,
  Layers,
  Link2,
  Music2,
  Images,
  Package,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  User,
  Lock,
  RefreshCw,
  Unlock,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";
import { CoverFocalPreview } from "@/components/photographer/cover-focal-preview";
import { UploadDragger } from "@/components/photographer/upload-dragger";
import {
  FolderDetailPageSkeleton,
  InlineActionSkeleton,
  InlineStatusSkeleton,
  UploadIndeterminateBarSkeleton,
} from "@/components/ui/skeletons";
import type { FolderStatus } from "@/lib/demo-data";
import {
  apiFolderMediaToDemoAsset,
  apiFolderMediaToFinal,
  apiFolderStatusToUi,
  extractFinalMediaList,
  extractRawMediaList,
  extractSelectionMediaList,
  getFolder,
  getFolderClientName,
  getFolderCoverUrl,
  folderCoverObjectPositionStyle,
  FALLBACK_SHARE_EXPIRY_PRESETS,
  FoldersApiError,
  finalImagesLockedForClient,
  getFolderShareAbsoluteUrl,
  getShareLinkExpiryPresets,
  parseFolderCoverFocal,
  patchFolderStatus,
  deleteAllFolderFinalMedia,
  deleteAllFolderRawMedia,
  deleteFolderBackgroundMusic,
  deleteFolderFinalMedia,
  deleteFolderRawMedia,
  postFolderMediaDuplicatePreview,
  regenerateFolderShare,
  lockFolderFinalDelivery,
  unlockFolderFinalDelivery,
  updateFolder,
  uploadFolderBackgroundMusic,
  uploadFolderFinalMedia,
  uploadFolderRawMedia,
  type ApiFolder,
  type DuplicateUploadAction,
  type FinalDeliveryUploadFields,
  type ShareLinkExpiryPreset,
  type UploadFolderFinalMediaFormOptions,
  type UploadFolderMediaFormOptions,
} from "@/lib/folders-api";
import { getDuplicateUploadPreference } from "@/lib/upload-preferences";

function rawUploadFormOptions(duplicateAction: DuplicateUploadAction): UploadFolderMediaFormOptions {
  return { duplicateAction, markUploadComplete: true };
}

function finalUploadFormOptions(
  duplicateAction: DuplicateUploadAction,
  files: File[],
  selectionMediaId: string | undefined,
  delivery: FinalDeliveryUploadFields,
): UploadFolderFinalMediaFormOptions {
  const opts: UploadFolderFinalMediaFormOptions = {
    duplicateAction,
    markUploadComplete: true,
    clientHasPaidForFinals: delivery.clientHasPaidForFinals,
  };
  if (files.length === 1 && selectionMediaId) {
    opts.selectionMediaId = selectionMediaId;
  }
  if (delivery.clientHasPaidForFinals === false) {
    if (delivery.amountRemainingGHS != null && String(delivery.amountRemainingGHS).trim() !== "") {
      opts.amountRemainingGHS = String(delivery.amountRemainingGHS).trim();
    }
    opts.lockImagesBeforeUpload = delivery.lockImagesBeforeUpload === true;
  }
  return opts;
}

type Tab = "uploads" | "selection" | "finals";

const FALLBACK_COVER = "https://picsum.photos/seed/gido-cover/1200/800";

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

function statusStyles(s: FolderStatus) {
  switch (s) {
    case "COMPLETED":
      return "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40";
    case "SELECTION_PENDING":
      return "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40";
    default:
      return "bg-white/15 text-white ring-1 ring-white/25";
  }
}

function UploadProgressBanner({
  kind,
  computable,
  percent,
}: {
  kind: "raw" | "final";
  computable: boolean;
  percent: number;
}) {
  const label = kind === "raw" ? "Uploading raw photos…" : "Uploading finals…";
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
        {computable ? (
          <span className="shrink-0 tabular-nums text-sm font-semibold text-brand-ink dark:text-brand-on-dark">
            {percent}%
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-brand-ink/85 dark:text-brand-on-dark/90">
            Sending…
          </span>
        )}
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

export function FolderDetailView({ folderId }: { folderId: string }) {
  const { showToast } = useToast();
  const [origin, setOrigin] = useState("");
  const [folder, setFolder] = useState<ApiFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("uploads");
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    kind: "raw" | "final";
    computable: boolean;
    percent: number;
  } | null>(null);
  const [expiryPresets, setExpiryPresets] = useState<ShareLinkExpiryPreset[]>([]);
  const [linkExpiry, setLinkExpiry] = useState("30d");
  /** `"raw:${id}"` | `"final:${id}"` while a delete request is in flight */
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedRawIds, setSelectedRawIds] = useState<Set<string>>(() => new Set());
  const [selectedFinalIds, setSelectedFinalIds] = useState<Set<string>>(() => new Set());
  const rawSelectAllRef = useRef<HTMLInputElement>(null);
  const finalSelectAllRef = useRef<HTMLInputElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  const [focalEditOpen, setFocalEditOpen] = useState(false);
  const [focalDraft, setFocalDraft] = useState({ x: 50, y: 50 });
  const [savingFocal, setSavingFocal] = useState(false);

  /** After duplicate-preview: user chooses replace vs skip before uploading bytes. */
  const [musicBusy, setMusicBusy] = useState(false);

  const [duplicateFilenamePrompt, setDuplicateFilenamePrompt] = useState<null | {
    kind: "raw" | "final";
    files: File[];
    selectionMediaId?: string;
  }>(null);

  /** Carries payment/lock fields through duplicate-modal flows for final uploads. */
  const pendingFinalDeliveryRef = useRef<FinalDeliveryUploadFields | null>(null);

  const [finalWizardOpen, setFinalWizardOpen] = useState(false);
  const [finalWizardFiles, setFinalWizardFiles] = useState<File[]>([]);
  const [finalWizardStep, setFinalWizardStep] = useState<"choose" | "unpaid">("choose");
  const [finalWizardBalance, setFinalWizardBalance] = useState("");
  const [finalWizardLock, setFinalWizardLock] = useState(false);
  const [unlockingFinals, setUnlockingFinals] = useState(false);
  const [lockFinalDeliveryOpen, setLockFinalDeliveryOpen] = useState(false);
  const [lockFinalDeliveryAmount, setLockFinalDeliveryAmount] = useState("");
  const [lockingFinalDelivery, setLockingFinalDelivery] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setOrigin(typeof window !== "undefined" ? window.location.origin : ""));
  }, []);

  const refreshFolder = useCallback(async () => {
    const f = await getFolder(folderId);
    setFolder(f);
    return f;
  }, [folderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [f, presets] = await Promise.all([
          getFolder(folderId),
          getShareLinkExpiryPresets().catch(() => [] as ShareLinkExpiryPreset[]),
        ]);
        if (cancelled) return;
        setFolder(f);
        const list = presets.length > 0 ? presets : FALLBACK_SHARE_EXPIRY_PRESETS;
        setExpiryPresets(list);
        const ids = list.map((p) => p.id);
        const fromShare = f.share?.linkExpiryPreset ?? undefined;
        setLinkExpiry((prev) => {
          if (fromShare && ids.includes(fromShare)) return fromShare;
          if (ids.includes(prev)) return prev;
          if (ids.includes("30d")) return "30d";
          return list[0]?.id ?? "30d";
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Folder not found.");
        setFolder(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  useEffect(() => {
    setFocalEditOpen(false);
  }, [folderId]);

  const shareUrl = useMemo(
    () =>
      folder && origin ? getFolderShareAbsoluteUrl(folder, origin) ?? "" : "",
    [folder, origin],
  );
  const shareActive = Boolean(
    folder && folder.share?.enabled !== false && shareUrl,
  );

  const folderStatus = useMemo(
    () => (folder ? apiFolderStatusToUi(folder.status) : "DRAFT" satisfies FolderStatus),
    [folder],
  );

  const rawAssets = useMemo(
    () => (folder ? extractRawMediaList(folder).map(apiFolderMediaToDemoAsset) : []),
    [folder],
  );

  const finalAssets = useMemo(
    () => (folder ? extractFinalMediaList(folder).map(apiFolderMediaToFinal) : []),
    [folder],
  );

  /** True → show **Unlock images**; false → show **Lock images** (driven by GET folder + PATCH lock/unlock). */
  const finalImagesLocked = useMemo(
    () => (folder ? finalImagesLockedForClient(folder) : false),
    [folder],
  );

  const selectionRows = useMemo(
    () => (folder ? extractSelectionMediaList(folder).map(apiFolderMediaToDemoAsset) : []),
    [folder],
  );

  const clientSelectedAssets = useMemo(() => {
    const picked = selectionRows.filter((a) => a.selection === "SELECTED");
    return picked.length > 0 ? picked : selectionRows;
  }, [selectionRows]);

  type FolderLightboxItem = { id: string; name: string; src: string };
  const lightboxNavItems = useMemo((): FolderLightboxItem[] => {
    if (tab === "uploads") {
      return rawAssets.map((a) => ({ id: a.id, name: a.originalName, src: a.thumbUrl }));
    }
    if (tab === "selection") {
      return clientSelectedAssets.map((a) => ({
        id: a.id,
        name: a.originalName,
        src: a.thumbUrl,
      }));
    }
    return finalAssets.map((f) => ({ id: f.id, name: f.name, src: f.url }));
  }, [tab, rawAssets, clientSelectedAssets, finalAssets]);

  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  useEffect(() => {
    setLightboxId(null);
    setLightboxZoom(1);
  }, [tab]);

  useEffect(() => {
    if (!lightboxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxId(null);
        setLightboxZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxId]);

  const lbNavIndex = lightboxId
    ? lightboxNavItems.findIndex((item) => item.id === lightboxId)
    : -1;
  const lbItem = lbNavIndex >= 0 ? lightboxNavItems[lbNavIndex] : null;

  useEffect(() => {
    if (lightboxId && lbNavIndex < 0) {
      setLightboxId(null);
      setLightboxZoom(1);
    }
  }, [lightboxId, lbNavIndex]);

  const rawIdsKey = useMemo(
    () => rawAssets.map((a) => a.id).sort().join("\0"),
    [rawAssets],
  );
  const finalIdsKey = useMemo(
    () => finalAssets.map((f) => f.id).sort().join("\0"),
    [finalAssets],
  );

  useEffect(() => {
    setSelectedRawIds(new Set());
    setSelectedFinalIds(new Set());
  }, [folderId]);

  useEffect(() => {
    setSelectedRawIds((prev) => {
      const valid = new Set(rawAssets.map((a) => a.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [rawIdsKey, rawAssets]);

  useEffect(() => {
    setSelectedFinalIds((prev) => {
      const valid = new Set(finalAssets.map((f) => f.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [finalIdsKey, finalAssets]);

  const rawAllSelected =
    rawAssets.length > 0 && rawAssets.every((a) => selectedRawIds.has(a.id));
  const rawSomeSelected = selectedRawIds.size > 0 && !rawAllSelected;
  const finalAllSelected =
    finalAssets.length > 0 && finalAssets.every((f) => selectedFinalIds.has(f.id));
  const finalSomeSelected = selectedFinalIds.size > 0 && !finalAllSelected;

  useEffect(() => {
    const el = rawSelectAllRef.current;
    if (el) el.indeterminate = rawSomeSelected;
  }, [rawSomeSelected]);

  useEffect(() => {
    const el = finalSelectAllRef.current;
    if (el) el.indeterminate = finalSomeSelected;
  }, [finalSomeSelected]);

  const uploadProgressHandler = useCallback(
    (kind: "raw" | "final") =>
      (loaded: number, total: number, lengthComputable: boolean) => {
        const computable = lengthComputable && total > 0;
        setUploadProgress({
          kind,
          computable,
          percent: computable ? Math.min(100, Math.round((100 * loaded) / total)) : 0,
        });
      },
    [],
  );

  const mergeFinalFormOpts = useCallback(
    (
      dup: DuplicateUploadAction,
      files: File[],
      selectionMediaId?: string,
    ): UploadFolderFinalMediaFormOptions => {
      const d = pendingFinalDeliveryRef.current;
      return finalUploadFormOptions(dup, files, selectionMediaId, d ?? { clientHasPaidForFinals: true });
    },
    [],
  );

  function openFinalUploadWizard(files: File[]) {
    if (!folder || busy || files.length === 0) return;
    setFinalWizardFiles(files);
    setFinalWizardStep("choose");
    setFinalWizardBalance("");
    setFinalWizardLock(false);
    setFinalWizardOpen(true);
  }

  async function executeFinalUploadPipeline(files: File[], delivery: FinalDeliveryUploadFields) {
    if (!folder || files.length === 0) return;
    pendingFinalDeliveryRef.current = delivery;
    setBusy(true);
    let awaitingConflictChoice = false;
    const selectionMediaId: string | undefined = undefined;
    try {
      const { hasConflicts } = await postFolderMediaDuplicatePreview(folder._id, {
        kind: "final",
        filenames: files.map((f) => f.name),
      });
      if (hasConflicts) {
        awaitingConflictChoice = true;
        setDuplicateFilenamePrompt({ kind: "final", files, selectionMediaId });
        return;
      }

      setUploadProgress({ kind: "final", computable: false, percent: 0 });
      await uploadFolderFinalMedia(
        folder._id,
        files,
        uploadProgressHandler("final"),
        mergeFinalFormOpts(getDuplicateUploadPreference(), files, selectionMediaId),
      );
      await refreshFolder();
      showToast(
        delivery.clientHasPaidForFinals
          ? `${files.length} final(s) uploaded.`
          : `${files.length} final(s) uploaded. Outstanding balance noted — client may receive SMS.`,
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      if (!awaitingConflictChoice) {
        setBusy(false);
        pendingFinalDeliveryRef.current = null;
      }
    }
  }

  async function onUnlockFinalDelivery() {
    if (!folder || unlockingFinals || busy || lockingFinalDelivery) return;
    setUnlockingFinals(true);
    try {
      await unlockFolderFinalDelivery(folder._id);
      await refreshFolder();
      showToast("Finals unlocked for client download.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not unlock finals.", "error");
    } finally {
      setUnlockingFinals(false);
    }
  }

  async function onLockFinalDelivery() {
    if (!folder || lockingFinalDelivery || busy || unlockingFinals) return;
    const raw = lockFinalDeliveryAmount.trim().replace(/,/g, "");
    if (!raw || Number.isNaN(Number(raw))) {
      showToast("Enter a valid outstanding amount in GHS.", "error");
      return;
    }
    const n = Number(raw);
    if (n < 0) {
      showToast("Amount cannot be negative.", "error");
      return;
    }
    setLockingFinalDelivery(true);
    try {
      await lockFolderFinalDelivery(folder._id, { outstandingAmountGHS: n });
      await refreshFolder();
      setLockFinalDeliveryOpen(false);
      setLockFinalDeliveryAmount("");
      showToast("Final delivery locked — client sees locked previews until paid.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not lock finals.", "error");
    } finally {
      setLockingFinalDelivery(false);
    }
  }

  async function onRawUpload(files: File[]) {
    if (!folder || busy || files.length === 0) return;
    setBusy(true);
    let awaitingConflictChoice = false;
    try {
      const { hasConflicts } = await postFolderMediaDuplicatePreview(folder._id, {
        kind: "raw",
        filenames: files.map((f) => f.name),
      });
      if (hasConflicts) {
        awaitingConflictChoice = true;
        setDuplicateFilenamePrompt({ kind: "raw", files });
        return;
      }

      setUploadProgress({ kind: "raw", computable: false, percent: 0 });
      await uploadFolderRawMedia(
        folder._id,
        files,
        uploadProgressHandler("raw"),
        rawUploadFormOptions(getDuplicateUploadPreference()),
      );
      await refreshFolder();
      showToast(`${files.length} file(s) uploaded.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      if (!awaitingConflictChoice) setBusy(false);
    }
  }

  async function onDuplicatePromptReplace() {
    const p = duplicateFilenamePrompt;
    if (!folder || !p) return;
    setDuplicateFilenamePrompt(null);
    setBusy(true);
    setUploadProgress({ kind: p.kind, computable: false, percent: 0 });
    try {
      if (p.kind === "raw") {
        await uploadFolderRawMedia(
          folder._id,
          p.files,
          uploadProgressHandler("raw"),
          rawUploadFormOptions("replace"),
        );
      } else {
        await uploadFolderFinalMedia(
          folder._id,
          p.files,
          uploadProgressHandler("final"),
          mergeFinalFormOpts("replace", p.files, p.selectionMediaId),
        );
      }
      await refreshFolder();
      showToast(
        p.kind === "raw"
          ? `${p.files.length} file(s) uploaded (replacing matching names).`
          : `${p.files.length} final(s) uploaded (replacing matching names).`,
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      setBusy(false);
      pendingFinalDeliveryRef.current = null;
    }
  }

  async function onDuplicatePromptSkip() {
    const p = duplicateFilenamePrompt;
    if (!folder || !p) return;
    setDuplicateFilenamePrompt(null);
    setBusy(true);
    setUploadProgress({ kind: p.kind, computable: false, percent: 0 });
    try {
      let ignored = 0;
      if (p.kind === "raw") {
        const result = await uploadFolderRawMedia(
          folder._id,
          p.files,
          uploadProgressHandler("raw"),
          rawUploadFormOptions("ignore"),
        );
        ignored = result?.ignoredDuplicatesCount ?? 0;
      } else {
        const result = await uploadFolderFinalMedia(
          folder._id,
          p.files,
          uploadProgressHandler("final"),
          mergeFinalFormOpts("ignore", p.files, p.selectionMediaId),
        );
        ignored = result?.ignoredDuplicatesCount ?? 0;
      }
      await refreshFolder();
      showToast(
        ignored > 0
          ? p.kind === "raw"
            ? `Uploaded; ${ignored} duplicate filename(s) skipped.`
            : `Uploaded; ${ignored} duplicate final name(s) skipped.`
          : p.kind === "raw"
            ? `${p.files.length} file(s) uploaded.`
            : `${p.files.length} final(s) uploaded.`,
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadProgress(null);
      setBusy(false);
      pendingFinalDeliveryRef.current = null;
    }
  }

  async function onRegenerateLink() {
    if (!folder || busy) return;
    setBusy(true);
    try {
      const updated = await regenerateFolderShare(folder._id, {
        clearSlug: false,
        linkExpiry: linkExpiry || undefined,
      });
      setFolder(updated);
      showToast("Share link regenerated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not regenerate link.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function markCompleted() {
    if (!folder || busy || folderStatus === "COMPLETED") return;
    setBusy(true);
    try {
      const updated = await patchFolderStatus(folder._id, "completed");
      setFolder(updated);
      showToast("Marked as completed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update status.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCoverFocal() {
    if (!folder || savingFocal) return;
    setSavingFocal(true);
    try {
      const updated = await updateFolder(folder._id, {
        coverFocalX: focalDraft.x,
        coverFocalY: focalDraft.y,
      });
      setFolder(updated);
      showToast("Cover framing saved.", "success");
      setFocalEditOpen(false);
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save cover framing.",
        "error",
      );
    } finally {
      setSavingFocal(false);
    }
  }

  function openFocalEditor() {
    if (!folder) return;
    setFocalDraft(parseFolderCoverFocal(folder));
    setFocalEditOpen(true);
  }

  function cancelFocalEditor() {
    setFocalEditOpen(false);
  }

  async function onBackgroundMusicFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !folder) return;
    setMusicBusy(true);
    try {
      const updated = await uploadFolderBackgroundMusic(folder._id, file);
      setFolder(updated);
      showToast("Background music uploaded.", "success");
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not upload audio.",
        "error",
      );
    } finally {
      setMusicBusy(false);
    }
  }

  async function onRemoveBackgroundMusic() {
    if (!folder) return;
    const hasTrack = Boolean(folder.backgroundMusicUrl || folder.backgroundMusic);
    if (!hasTrack) return;
    if (!confirm("Remove background music from this gallery?")) return;
    setMusicBusy(true);
    try {
      const updated = await deleteFolderBackgroundMusic(folder._id);
      setFolder(updated);
      showToast("Background music removed.", "success");
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not remove audio.",
        "error",
      );
    } finally {
      setMusicBusy(false);
    }
  }

  async function onToggleBackgroundMusicForClients(next: boolean) {
    if (!folder || musicBusy) return;
    setMusicBusy(true);
    try {
      const updated = await updateFolder(folder._id, { backgroundMusicEnabled: next });
      setFolder(updated);
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not update setting.",
        "error",
      );
    } finally {
      setMusicBusy(false);
    }
  }

  function mediaDeleteBlocked() {
    return busy || uploadProgress !== null || deletingKey !== null;
  }

  function toggleRawSelected(mediaId: string) {
    if (mediaDeleteBlocked()) return;
    setSelectedRawIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }

  function toggleFinalSelected(mediaId: string) {
    if (mediaDeleteBlocked()) return;
    setSelectedFinalIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  }

  function setRawSelectAll(select: boolean) {
    if (mediaDeleteBlocked()) return;
    setSelectedRawIds(select ? new Set(rawAssets.map((a) => a.id)) : new Set());
  }

  function setFinalSelectAll(select: boolean) {
    if (mediaDeleteBlocked()) return;
    setSelectedFinalIds(select ? new Set(finalAssets.map((f) => f.id)) : new Set());
  }

  async function onDeleteRawAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (
      !confirm(
        "Remove this image from raw uploads? This cannot be undone for your client gallery.",
      )
    ) {
      return;
    }
    setDeletingKey(`raw:${mediaId}`);
    try {
      await deleteFolderRawMedia(folder._id, mediaId);
      await refreshFolder();
      setSelectedRawIds((prev) => {
        if (!prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      showToast("Image removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete image.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteFinalAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (!confirm("Remove this file from finals? This cannot be undone.")) {
      return;
    }
    setDeletingKey(`final:${mediaId}`);
    try {
      await deleteFolderFinalMedia(folder._id, mediaId);
      await refreshFolder();
      setSelectedFinalIds((prev) => {
        if (!prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      showToast("Final removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete final.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteAllRaw() {
    if (!folder || mediaDeleteBlocked() || rawAssets.length === 0) return;
    if (
      !confirm(
        `Delete all ${rawAssets.length} raw upload(s)? This cannot be undone and removes them from the gallery.`,
      )
    ) {
      return;
    }
    setDeletingKey("raw:all");
    try {
      await deleteAllFolderRawMedia(folder._id);
      await refreshFolder();
      setSelectedRawIds(new Set());
      showToast("All raw uploads removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete raw uploads.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteAllFinals() {
    if (!folder || mediaDeleteBlocked() || finalAssets.length === 0) return;
    if (
      !confirm(
        `Delete all ${finalAssets.length} final(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingKey("final:all");
    try {
      await deleteAllFolderFinalMedia(folder._id);
      await refreshFolder();
      setSelectedFinalIds(new Set());
      showToast("All finals removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete finals.", "error");
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteSelectedRaw() {
    if (!folder || mediaDeleteBlocked()) return;
    const ids = rawAssets.map((a) => a.id).filter((id) => selectedRawIds.has(id));
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} selected image(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingKey("raw:bulk");
    try {
      if (ids.length === rawAssets.length) {
        await deleteAllFolderRawMedia(folder._id);
      } else {
        for (const id of ids) {
          await deleteFolderRawMedia(folder._id, id);
        }
      }
      await refreshFolder();
      setSelectedRawIds(new Set());
      showToast(
        ids.length === 1 ? "Image removed." : `${ids.length} images removed.`,
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete selected images.", "error");
      await refreshFolder().catch(() => {});
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteSelectedFinals() {
    if (!folder || mediaDeleteBlocked()) return;
    const ids = finalAssets.map((f) => f.id).filter((id) => selectedFinalIds.has(id));
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected final(s)? This cannot be undone.`)) {
      return;
    }
    setDeletingKey("final:bulk");
    try {
      if (ids.length === finalAssets.length) {
        await deleteAllFolderFinalMedia(folder._id);
      } else {
        for (const id of ids) {
          await deleteFolderFinalMedia(folder._id, id);
        }
      }
      await refreshFolder();
      setSelectedFinalIds(new Set());
      showToast(
        ids.length === 1 ? "Final removed." : `${ids.length} finals removed.`,
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete selected finals.", "error");
      await refreshFolder().catch(() => {});
    } finally {
      setDeletingKey(null);
    }
  }

  if (loading) {
    return <FolderDetailPageSkeleton />;
  }

  if (error || !folder) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-zinc-200 bg-white px-8 py-14 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <Layers className="h-7 w-7 text-zinc-400" aria-hidden />
        </div>
        <p className="mt-5 text-base font-medium text-zinc-900 dark:text-zinc-100">
          Couldn&apos;t open this gallery
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {error ?? "Folder not found."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/galleries"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All galleries
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const clientName = getFolderClientName(folder);
  const title = folder.eventName?.trim() || clientName;
  const coverSrc = getFolderCoverUrl(folder) ?? FALLBACK_COVER;
  const eventDateLabel = new Date(folder.eventDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const tabItems = [
    {
      key: "uploads" as const,
      label: "Uploads",
      sub: "Raw files",
      icon: ImageIcon,
      count: rawAssets.length,
    },
    {
      key: "selection" as const,
      label: "Selection",
      sub: "Client picks",
      icon: Sparkles,
      count: clientSelectedAssets.length,
    },
    {
      key: "finals" as const,
      label: "Finals",
      sub: "Delivery",
      icon: Package,
      count: finalAssets.length,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Breadcrumb */}
      <nav
        className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500"
        aria-label="Breadcrumb"
      >
        <Link
          href="/dashboard"
          className="font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <Link
          href="/dashboard/galleries"
          className="font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Galleries
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
        <span className="max-w-[min(100%,16rem)] truncate font-medium text-zinc-800 dark:text-zinc-200">
          {title}
        </span>
      </nav>

      {/* Background music — compact toolbar */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-black/5 dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/25">
        <div
          className="relative flex flex-wrap items-center gap-2.5 rounded-[0.9rem] px-2.5 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5"
          role="group"
          aria-label="Background music for client gallery"
        >
          <input
            ref={musicFileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.webm,application/ogg"
            className="sr-only"
            onChange={(ev) => void onBackgroundMusicFileChange(ev)}
          />
          <span className="sr-only">Background music</span>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm shadow-brand/25"
            aria-hidden
          >
            <Music2 className="h-4 w-4" strokeWidth={2.25} />
          </div>
          {folder.backgroundMusicUrl ? (
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-zinc-50 px-1.5 py-1 ring-1 ring-inset ring-zinc-200/90 dark:bg-zinc-900 dark:ring-zinc-600/80 sm:max-w-[13rem]">
              <audio
                controls
                src={folder.backgroundMusicUrl}
                className="h-8 w-full max-w-full accent-zinc-700 dark:accent-zinc-300"
                preload="metadata"
              />
            </div>
          ) : (
            <div
              className="pointer-events-none min-h-8 min-w-[5rem] flex-1 rounded-xl bg-zinc-100 ring-1 ring-inset ring-zinc-200/80 dark:bg-zinc-800/80 dark:ring-zinc-700/60"
              aria-hidden
            />
          )}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              disabled={musicBusy}
              onClick={() => musicFileInputRef.current?.click()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-700 shadow-sm shadow-black/5 ring-1 ring-zinc-200/90 transition hover:scale-[1.04] hover:bg-zinc-50 hover:shadow-md hover:shadow-black/8 active:scale-100 disabled:pointer-events-none disabled:opacity-45 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-600 dark:hover:bg-zinc-800"
              aria-label={folder.backgroundMusicUrl ? "Replace background music" : "Upload background music"}
            >
              {musicBusy ? (
                <span className="text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                  …
                </span>
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
            </button>
            {folder.backgroundMusicUrl || folder.backgroundMusic ? (
              <button
                type="button"
                disabled={musicBusy}
                onClick={() => void onRemoveBackgroundMusic()}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm shadow-black/5 ring-1 ring-red-200/80 transition hover:scale-[1.04] hover:bg-red-50 hover:shadow-md hover:shadow-black/8 active:scale-100 disabled:pointer-events-none disabled:opacity-45 dark:bg-zinc-900 dark:text-red-400 dark:ring-red-900/45 dark:hover:bg-red-950/30"
                aria-label="Remove background music"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <span
              className="mx-0.5 hidden h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-600 sm:inline"
              aria-hidden
            />
            <span className="sr-only">Play background music for clients</span>
            <button
              type="button"
              role="switch"
              aria-checked={folder.backgroundMusicEnabled !== false}
              disabled={musicBusy}
              onClick={() =>
                void onToggleBackgroundMusicForClients(!(folder.backgroundMusicEnabled !== false))
              }
              className={cn(
                "relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full border-2 transition hover:opacity-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
                folder.backgroundMusicEnabled !== false
                  ? "border-zinc-700 bg-zinc-900 shadow-sm shadow-black/20 dark:border-zinc-500 dark:bg-zinc-100"
                  : "border-zinc-200 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-[left,transform] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:ring-black/20",
                  folder.backgroundMusicEnabled !== false
                    ? "left-[1.5rem] dark:bg-zinc-900"
                    : "left-0.5",
                )}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section
        className={cn(
          "relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200/60 bg-zinc-900 shadow-lg shadow-zinc-900/15 ring-1 ring-black/5 transition-[box-shadow,ring-color] duration-300 ease-out dark:border-zinc-800/80",
          focalEditOpen &&
            "shadow-xl shadow-black/25 ring-2 ring-brand/40 ring-offset-0 dark:ring-brand/45",
        )}
      >
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-[object-position] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={
              focalEditOpen
                ? { objectPosition: `${focalDraft.x}% ${focalDraft.y}%` }
                : folderCoverObjectPositionStyle(folder)
            }
          />
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/40 to-zinc-900/15 transition-opacity duration-300",
              focalEditOpen && "from-zinc-950/[0.97] via-zinc-950/50",
            )}
            aria-hidden
          />
        </div>

        <div className="relative z-10 flex min-h-[168px] flex-1 flex-col justify-between gap-3 p-5 md:min-h-[188px] md:gap-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              href="/dashboard/galleries"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/18 md:px-3 md:py-2 md:text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to galleries
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2 md:gap-2.5">
              {folderStatus !== "COMPLETED" ? (
                <button
                  type="button"
                  onClick={markCompleted}
                  disabled={busy}
                  className="text-[10px] font-semibold text-white/75 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/50 disabled:cursor-not-allowed disabled:opacity-40 md:text-[11px]"
                >
                  Mark completed
                </button>
              ) : null}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider md:px-3 md:py-1 md:text-[11px] ${statusStyles(folderStatus)} ${focalEditOpen ? "opacity-90" : ""}`}
              >
                {statusLabel(folderStatus)}
              </span>
            </div>
          </div>

          <div className="max-w-2xl space-y-2 md:space-y-2.5">
            <h1 className="text-xl font-semibold leading-snug tracking-tight text-white md:text-2xl">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-white/75 md:text-xs">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3 shrink-0 text-white/55" aria-hidden />
                {clientName}
              </span>
              <span className="text-white/35" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0 text-white/55" aria-hidden />
                {eventDateLabel}
              </span>
            </div>
            {folder.description ? (
              <p className="line-clamp-2 text-[11px] leading-relaxed text-white/65 md:text-xs">
                {folder.description}
              </p>
            ) : null}
            <div className="flex flex-wrap pt-0.5">
              <button
                type="button"
                onClick={() => (focalEditOpen ? cancelFocalEditor() : openFocalEditor())}
                disabled={busy || savingFocal}
                aria-expanded={focalEditOpen}
                aria-controls="folder-cover-framing-panel"
                aria-label={focalEditOpen ? "Close cover framing editor" : "Cover framing"}
                title={focalEditOpen ? "Close editor" : "Cover framing"}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:size-9",
                  focalEditOpen
                    ? "border-white/45 bg-white/18 ring-1 ring-white/25"
                    : "",
                )}
              >
                {focalEditOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Focus className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>

        <div
          id="folder-cover-framing-panel"
          className={cn(
            "relative z-10 border-white/10 transition-[max-height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            focalEditOpen
              ? "max-h-[min(460px,80vh)] border-t border-white/15 opacity-100"
              : "pointer-events-none max-h-0 border-t-0 opacity-0",
          )}
          aria-hidden={!focalEditOpen}
        >
          <div className="bg-gradient-to-b from-zinc-950/65 via-zinc-950/90 to-zinc-950 backdrop-blur-2xl">
            <div className="px-5 py-5 md:px-7 md:py-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                <div className="min-w-0 flex-1 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                    Cover framing
                  </p>
                  <CoverFocalPreview
                    imageUrl={coverSrc}
                    focalX={focalDraft.x}
                    focalY={focalDraft.y}
                    onFocalChange={(x, y) => setFocalDraft({ x, y })}
                    disabled={savingFocal}
                    embeddedDark
                    compactFooter
                    frameClassName="aspect-[21/10] w-full max-h-[min(14rem,36vw)] rounded-xl sm:max-h-56"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:flex-col lg:items-stretch">
                  <button
                    type="button"
                    onClick={() => void saveCoverFocal()}
                    disabled={savingFocal}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20 transition hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50 lg:min-w-[10.5rem] motion-reduce:active:scale-100"
                  >
                    {savingFocal ? "Saving…" : "Save framing"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelFocalEditor}
                    disabled={savingFocal}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/25 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition hover:bg-white/12 active:scale-[0.98] disabled:opacity-50 lg:min-w-[10.5rem] motion-reduce:active:scale-100"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Share — compact */}
      <section className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm shadow-brand/20">
              <Share2 className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                Client gallery link
              </h2>
              <p className="sr-only">
                Share this read-only URL with your client so they can view and select photos.
              </p>
            </div>
          </div>
          {folder.share?.selectionSubmittedAt ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300">
              Submitted{" "}
              {new Date(folder.share.selectionSubmittedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/80 shadow-sm focus-within:ring-2 focus-within:ring-brand/25 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex shrink-0 items-center border-r border-zinc-200 bg-zinc-100/70 px-2 dark:border-zinc-700 dark:bg-zinc-900/80">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
          </div>
          <input
            readOnly
            className="min-w-0 flex-1 cursor-default truncate border-0 bg-transparent px-2 py-2 font-mono text-[11px] leading-snug text-zinc-800 outline-none dark:text-zinc-100 sm:text-xs"
            value={shareActive ? shareUrl : "Sharing not enabled yet."}
            title={shareActive ? shareUrl : undefined}
            aria-label="Share URL"
          />
          <div className="flex shrink-0 divide-x divide-zinc-200 border-l border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
            <button
              type="button"
              disabled={!shareActive}
              onClick={async () => {
                if (!shareUrl) return;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1500);
                } catch {
                  showToast("Could not copy link.", "error");
                }
              }}
              className="inline-flex size-9 items-center justify-center bg-white text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label={linkCopied ? "Copied" : "Copy share link"}
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </button>
            {shareActive ? (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-9 items-center justify-center bg-white text-zinc-800 transition hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Open share link"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerateLink}
              className="inline-flex size-9 items-center justify-center bg-white text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label="Regenerate share link"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5 sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
          <label className="inline-flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Expires</span>
            <select
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-900 outline-none transition focus:ring-2 focus:ring-brand/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              value={linkExpiry}
              disabled={busy}
              onChange={(e) => setLinkExpiry(e.target.value)}
              aria-label="New link expiry"
              title="Used when you regenerate the link."
            >
              {expiryPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] leading-snug text-zinc-400 dark:text-zinc-500 sm:max-w-md">
            New expiry applies the next time you regenerate.
          </p>
        </div>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Gallery sections"
        className="flex gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        {tabItems.map(({ key, label, sub, icon: Icon, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition md:gap-3 md:px-3.5 md:py-2.5",
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-700/80"
                  : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md md:h-9 md:w-9",
                  active
                    ? "bg-brand text-white shadow-sm shadow-brand/25"
                    : "bg-zinc-200/90 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                )}
              >
                <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm font-semibold">{label}</span>
                  {count > 0 ? (
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
                  {sub}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        {uploadProgress ? (
          <div className="mb-6">
            <UploadProgressBanner
              kind={uploadProgress.kind}
              computable={uploadProgress.computable}
              percent={uploadProgress.percent}
            />
          </div>
        ) : null}
        {tab === "uploads" ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 border-b border-zinc-100 pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Raw uploads
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Upload raw files to this gallery. They are sent to the server immediately.
                </p>
              </div>
              {rawAssets.length > 0 ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-[min(100%,22rem)] sm:items-end">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <input
                      ref={rawSelectAllRef}
                      type="checkbox"
                      checked={rawAllSelected}
                      disabled={mediaDeleteBlocked()}
                      onChange={(e) => setRawSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
                    />
                    Select all
                  </label>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedRawIds.size > 0 ? (
                      <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                        {selectedRawIds.size} selected
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onDeleteSelectedRaw()}
                      disabled={mediaDeleteBlocked() || selectedRawIds.size === 0}
                      className="inline-flex min-h-[2.25rem] min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      {deletingKey === "raw:bulk" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Delete selected"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteAllRaw()}
                      disabled={mediaDeleteBlocked()}
                      className="inline-flex min-h-[2.25rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200/90 bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      {deletingKey === "raw:all" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Delete all"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <UploadDragger disabled={busy} onFiles={(files) => void onRawUpload(files)} />
            {rawAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <Images className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  No uploads yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  Drop files above or click to browse. Thumbnails will appear in a grid below.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {rawAssets.map((a) => (
                  <li
                    key={a.id}
                    className="group overflow-hidden rounded-lg border border-zinc-200/90 bg-zinc-50/30 shadow-sm ring-1 ring-zinc-900/[0.04] transition hover:border-zinc-300 hover:ring-zinc-900/[0.07] dark:border-zinc-700 dark:bg-zinc-900/40 dark:ring-white/[0.04] dark:hover:border-zinc-500"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      <label className="pointer-events-auto absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow ring-1 ring-black/10 dark:bg-zinc-900/90 dark:ring-white/15">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-zinc-400 text-brand focus:ring-brand"
                          checked={selectedRawIds.has(a.id)}
                          onChange={() => toggleRawSelected(a.id)}
                          disabled={mediaDeleteBlocked()}
                          aria-label={`Select ${a.originalName}`}
                        />
                      </label>
                      <button
                        type="button"
                        className="absolute inset-0 z-0 flex h-full w-full text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-brand/40"
                        onClick={() => {
                          setLightboxId(a.id);
                          setLightboxZoom(1);
                        }}
                        aria-label={`Preview ${a.originalName}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.thumbUrl}
                          alt=""
                          className="pointer-events-none h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 border-t border-zinc-100/90 bg-white/95 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/90">
                      <span
                        className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200"
                        title={a.originalName}
                      >
                        {a.originalName}
                      </span>
                      <button
                        type="button"
                        disabled={mediaDeleteBlocked() || deletingKey === `raw:${a.id}`}
                        onClick={() => void onDeleteRawAsset(a.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600/90 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400/90 dark:hover:bg-red-950/50"
                        title="Delete image"
                      >
                        {deletingKey === `raw:${a.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "selection" ? (
          <div className="space-y-6">
            <div className="border-b border-zinc-100 pb-5 dark:border-zinc-800/80">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Client selection
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Only photos the client chose in the share gallery appear here.
              </p>
            </div>
            {clientSelectedAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  No client selections yet. When clients pick shots from the share link,
                  they will show up in this list.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clientSelectedAssets.map((a) => (
                  <li
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-rose-200/70 bg-white shadow-sm ring-1 ring-rose-100/60 dark:border-rose-900/50 dark:bg-zinc-950 dark:ring-rose-950/40"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      <button
                        type="button"
                        className="absolute inset-0 flex h-full w-full text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-brand/40"
                        onClick={() => {
                          setLightboxId(a.id);
                          setLightboxZoom(1);
                        }}
                        aria-label={`Preview ${a.originalName}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.thumbUrl}
                          alt=""
                          className="pointer-events-none h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    </div>
                    <div className="space-y-2 border-t border-zinc-100 p-3 text-xs dark:border-zinc-800">
                      <p className="font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                        {a.originalName}
                      </p>
                      <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                        Selected by client
                      </p>
                      {a.clientComment ? (
                        <p className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                          &ldquo;{a.clientComment}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "finals" ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 border-b border-zinc-100 pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Final delivery
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Upload finished edits for client delivery.
                </p>
                {finalAssets.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                        finalImagesLocked
                          ? "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                      )}
                    >
                      {finalImagesLocked ? "Locked" : "Unlocked"}
                    </span>
                    {finalImagesLocked ? (
                      <button
                        type="button"
                        onClick={() => void onUnlockFinalDelivery()}
                        disabled={
                          unlockingFinals || lockingFinalDelivery || busy || mediaDeleteBlocked()
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        {unlockingFinals ? (
                          <InlineActionSkeleton />
                        ) : (
                          <>
                            <Unlock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Unlock images
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setLockFinalDeliveryAmount("");
                          setLockFinalDeliveryOpen(true);
                        }}
                        disabled={lockingFinalDelivery || unlockingFinals || busy || mediaDeleteBlocked()}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-brand/25 transition hover:bg-brand-hover disabled:opacity-50 dark:hover:bg-brand-hover"
                      >
                        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Lock images
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              {finalAssets.length > 0 ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-[min(100%,22rem)] sm:items-end">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <input
                      ref={finalSelectAllRef}
                      type="checkbox"
                      checked={finalAllSelected}
                      disabled={mediaDeleteBlocked()}
                      onChange={(e) => setFinalSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
                    />
                    Select all
                  </label>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedFinalIds.size > 0 ? (
                      <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                        {selectedFinalIds.size} selected
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onDeleteSelectedFinals()}
                      disabled={mediaDeleteBlocked() || selectedFinalIds.size === 0}
                      className="inline-flex min-h-[2.25rem] min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      {deletingKey === "final:bulk" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Delete selected"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteAllFinals()}
                      disabled={mediaDeleteBlocked()}
                      className="inline-flex min-h-[2.25rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200/90 bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      {deletingKey === "final:all" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Delete all"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <UploadDragger
              label="Drop edited finals here"
              hint="JPG, PNG, WebP, GIF — uploaded to this gallery."
              disabled={busy}
              onFiles={(files) => void openFinalUploadWizard(files)}
            />
            {finalAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
                No finals uploaded yet.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {finalAssets.map((f) => (
                  <li
                    key={f.id}
                    className="group overflow-hidden rounded-lg border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-900/[0.04] transition hover:border-zinc-300 hover:ring-zinc-900/[0.07] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.04] dark:hover:border-zinc-500"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/80">
                      <label className="pointer-events-auto absolute left-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow ring-1 ring-black/10 dark:bg-zinc-900/90 dark:ring-white/15">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-zinc-400 text-brand focus:ring-brand"
                          checked={selectedFinalIds.has(f.id)}
                          onChange={() => toggleFinalSelected(f.id)}
                          disabled={mediaDeleteBlocked()}
                          aria-label={`Select ${f.name}`}
                        />
                      </label>
                      <button
                        type="button"
                        className="absolute inset-0 z-0 flex h-full w-full text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-brand/40"
                        onClick={() => {
                          setLightboxId(f.id);
                          setLightboxZoom(1);
                        }}
                        aria-label={`Preview ${f.name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.url}
                          alt=""
                          className="pointer-events-none h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                      {f.locked ? (
                        <span className="pointer-events-none absolute bottom-2 right-2 z-[5] inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          <Lock className="h-3 w-3" aria-hidden />
                          Locked
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-1.5 border-t border-zinc-100/90 bg-white/95 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/90">
                      <span
                        className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-200"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                      <button
                        type="button"
                        disabled={mediaDeleteBlocked() || deletingKey === `final:${f.id}`}
                        onClick={() => void onDeleteFinalAsset(f.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600/90 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400/90 dark:hover:bg-red-950/50"
                        title="Delete final"
                      >
                        {deletingKey === `final:${f.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {lockFinalDeliveryOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-final-delivery-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h2
              id="lock-final-delivery-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Lock final delivery
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Preview-only for the client until this balance is paid.
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Outstanding amount (GHS)
              <input
                type="text"
                inputMode="decimal"
                value={lockFinalDeliveryAmount}
                onChange={(e) => setLockFinalDeliveryAmount(e.target.value)}
                placeholder="e.g. 500"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-brand/25 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
                disabled={lockingFinalDelivery}
                onClick={() => {
                  setLockFinalDeliveryOpen(false);
                  setLockFinalDeliveryAmount("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={lockingFinalDelivery}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-50"
                onClick={() => void onLockFinalDelivery()}
              >
                {lockingFinalDelivery ? "Locking…" : "Lock images"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {finalWizardOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="final-wizard-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h2
              id="final-wizard-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Final delivery
            </h2>
            {finalWizardStep === "choose" ? (
              <>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Has the client paid for these finals?
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setFinalWizardOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setFinalWizardStep("unpaid")}
                  >
                    Not yet
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
                    onClick={() => {
                      setFinalWizardOpen(false);
                      void executeFinalUploadPipeline(finalWizardFiles, {
                        clientHasPaidForFinals: true,
                      });
                    }}
                  >
                    Yes — upload
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Enter what they still owe. Lock previews until paid.
                </p>
                <label className="mt-4 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Amount remaining
                  <input
                    type="text"
                    inputMode="decimal"
                    value={finalWizardBalance}
                    onChange={(e) => setFinalWizardBalance(e.target.value)}
                    placeholder="e.g. 500"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-brand/25 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={finalWizardLock}
                    onChange={(e) => setFinalWizardLock(e.target.checked)}
                    className="rounded border-zinc-300 text-brand focus:ring-brand dark:border-zinc-600"
                  />
                  Lock images before upload
                </label>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onClick={() => setFinalWizardStep("choose")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
                    onClick={() => {
                      const raw = finalWizardBalance.trim().replace(/,/g, "");
                      if (!raw || Number.isNaN(Number(raw))) {
                        showToast("Enter a valid outstanding amount.", "error");
                        return;
                      }
                      setFinalWizardOpen(false);
                      void executeFinalUploadPipeline(finalWizardFiles, {
                        clientHasPaidForFinals: false,
                        amountRemainingGHS: raw,
                        lockImagesBeforeUpload: finalWizardLock,
                      });
                    }}
                  >
                    Upload
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {lightboxId && lbItem ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close preview"
            onClick={() => {
              setLightboxId(null);
              setLightboxZoom(1);
            }}
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-5xl flex-1 flex-col gap-4">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.min(2.5, z + 0.25))}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.max(1, z - 0.25))}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
              >
                Zoom −
              </button>
              <button
                type="button"
                onClick={() => {
                  setLightboxId(null);
                  setLightboxZoom(1);
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lbItem.src}
                alt={lbItem.name}
                className="max-h-[75vh] max-w-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${lightboxZoom})` }}
              />
            </div>
            <div className="flex items-center gap-4 text-white">
              <button
                type="button"
                disabled={lbNavIndex <= 0}
                onClick={() => {
                  const prev = lightboxNavItems[lbNavIndex - 1];
                  if (prev) {
                    setLightboxId(prev.id);
                    setLightboxZoom(1);
                  }
                }}
                className="shrink-0 rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Previous
              </button>
              <p
                className="min-w-0 flex-1 truncate text-center text-sm text-white/90"
                title={lbItem.name}
              >
                {lbNavIndex + 1} / {lightboxNavItems.length}
                {lbItem.name ? (
                  <span className="mt-1 block truncate text-xs text-white/70">{lbItem.name}</span>
                ) : null}
              </p>
              <button
                type="button"
                disabled={lbNavIndex < 0 || lbNavIndex >= lightboxNavItems.length - 1}
                onClick={() => {
                  const next = lightboxNavItems[lbNavIndex + 1];
                  if (next) {
                    setLightboxId(next.id);
                    setLightboxZoom(1);
                  }
                }}
                className="shrink-0 rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateFilenamePrompt ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-filename-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h2
              id="duplicate-filename-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Filename conflict
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Duplicate filenames. Replace or skip?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void onDuplicatePromptSkip()}
                className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => void onDuplicatePromptReplace()}
                className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
