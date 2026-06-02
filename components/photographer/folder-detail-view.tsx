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
  ImagePlus,
  Layers,
  Link2,
  Music2,
  Images,
  Package,
  Pencil,
  PlayCircle,
  Plus,
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
  isDemoAssetVideo,
  isDemoFinalAssetVideo,
} from "@/components/client/share-gallery-bits";
import {
  DuplicateUploadConflictDialog,
  type DuplicateUploadConflictPrompt,
  FALLBACK_COVER,
  statusLabel,
  statusStyles,
  UploadProgressBanner,
} from "@/components/photographer/folder-detail-bits";
import {
  FolderDetailPageSkeleton,
  InlineActionSkeleton,
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
  appendCoverCacheBust,
  getFolderCoverUrl,
  folderCoverObjectPositionStyle,
  FALLBACK_SHARE_EXPIRY_PRESETS,
  formatRestoreBeforeLabel,
  FoldersApiError,
  finalImagesLockedForClient,
  getFolderShareAbsoluteUrl,
  getShareLinkExpiryPresets,
  incomingFilenamesConflictingWithFolder,
  parseFolderCoverFocal,
  patchFolderShare,
  patchFolderStatus,
  createFolderSet,
  deleteAllFolderFinalMedia,
  deleteAllFolderRawMedia,
  deleteFolderBackgroundMusic,
  deleteFolderFinalMedia,
  deleteFolderRawMedia,
  postFolderMediaDuplicatePreview,
  regenerateFolderShare,
  lockFolderFinalDelivery,
  unlockFolderFinalDelivery,
  updateFolderSet,
  deleteFolderSet,
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
  extractFolderSets,
  extractMaxClientSelections,
} from "@/lib/folders-api";
import { getDuplicateUploadPreference } from "@/lib/upload-preferences";

function rawUploadFormOptions(
  duplicateAction: DuplicateUploadAction,
  setId?: string | null,
): UploadFolderMediaFormOptions {
  return { duplicateAction, markUploadComplete: true, ...(setId !== undefined ? { setId } : {}) };
}

function finalUploadFormOptions(
  duplicateAction: DuplicateUploadAction,
  files: File[],
  selectionMediaId: string | undefined,
  delivery: FinalDeliveryUploadFields,
  setId?: string | null,
): UploadFolderFinalMediaFormOptions {
  const opts: UploadFolderFinalMediaFormOptions = {
    duplicateAction,
    markUploadComplete: true,
    clientHasPaidForFinals: delivery.clientHasPaidForFinals,
    ...(setId !== undefined ? { setId } : {}),
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

function AdminMediaPreview({
  src,
  name,
  isVideo,
  variant = "tile",
  zoom = 1,
}: {
  src: string;
  name: string;
  isVideo: boolean;
  variant?: "tile" | "lightbox";
  zoom?: number;
}) {
  if (isVideo) {
    return (
      <video
        src={src}
        controls={variant === "lightbox"}
        muted={variant === "tile"}
        playsInline
        preload="metadata"
        aria-label={name}
        className={
          variant === "tile"
            ? "pointer-events-none h-full w-full bg-black object-cover"
            : "max-h-[75vh] max-w-full bg-black object-contain transition-transform duration-200"
        }
        style={variant === "lightbox" ? { transform: `scale(${zoom})` } : undefined}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={variant === "tile" ? "" : name}
      className={
        variant === "tile"
          ? "pointer-events-none h-full w-full object-cover"
          : "max-h-[75vh] max-w-full object-contain transition-transform duration-200"
      }
      loading={variant === "tile" ? "lazy" : undefined}
      style={variant === "lightbox" ? { transform: `scale(${zoom})` } : undefined}
    />
  );
}

type Tab = "uploads" | "selection" | "finals";
type SetFilter = "all" | "general" | string;

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
    phase: "preparing" | "uploading";
    computable: boolean;
    percent: number;
    fileIndex?: number;
    fileCount?: number;
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
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const [focalEditOpen, setFocalEditOpen] = useState(false);
  const [focalDraft, setFocalDraft] = useState({ x: 50, y: 50 });
  const [savingFocal, setSavingFocal] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  /** Local blob preview while uploading; cleared after server URL is ready. */
  const [localCoverPreviewUrl, setLocalCoverPreviewUrl] = useState<string | null>(null);
  /** Bumps when cover file changes so repeated URLs bypass browser cache. */
  const [coverCacheVersion, setCoverCacheVersion] = useState(0);

  /** After duplicate-preview: user chooses replace vs skip before uploading bytes. */
  const [musicBusy, setMusicBusy] = useState(false);

  const [duplicateFilenamePrompt, setDuplicateFilenamePrompt] = useState<null | {
    kind: "raw" | "final";
    files: File[];
    setId?: string | null;
    selectionMediaId?: string;
    conflictingNames: string[];
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
  const [newSetName, setNewSetName] = useState("");
  const [creatingSet, setCreatingSet] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingSetName, setEditingSetName] = useState("");
  const [savingSetId, setSavingSetId] = useState<string | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [activeSetFilter, setActiveSetFilter] = useState<SetFilter>("all");
  const [selectionLimitUnlimited, setSelectionLimitUnlimited] = useState(true);
  const [selectionLimitInput, setSelectionLimitInput] = useState("20");
  const [selectionLimitSaving, setSelectionLimitSaving] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setOrigin(typeof window !== "undefined" ? window.location.origin : ""));
  }, []);

  useEffect(() => {
    return () => {
      if (localCoverPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(localCoverPreviewUrl);
      }
    };
  }, [localCoverPreviewUrl]);

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
  const folderSets = useMemo(() => (folder ? extractFolderSets(folder) : []), [folder]);
  const filteredRawAssets = useMemo(() => {
    if (activeSetFilter === "all") return rawAssets;
    if (activeSetFilter === "general") return rawAssets.filter((a) => !a.setId);
    return rawAssets.filter((a) => a.setId === activeSetFilter);
  }, [rawAssets, activeSetFilter]);
  const filteredFinalAssets = useMemo(() => {
    if (activeSetFilter === "all") return finalAssets;
    if (activeSetFilter === "general") return finalAssets.filter((f) => !f.setId);
    return finalAssets.filter((f) => f.setId === activeSetFilter);
  }, [finalAssets, activeSetFilter]);
  const filteredClientSelectedAssets = useMemo(() => {
    if (activeSetFilter === "all") return clientSelectedAssets;
    if (activeSetFilter === "general") return clientSelectedAssets.filter((a) => !a.setId);
    return clientSelectedAssets.filter((a) => a.setId === activeSetFilter);
  }, [clientSelectedAssets, activeSetFilter]);
  const activeSetItem = useMemo(
    () =>
      activeSetFilter !== "all" && activeSetFilter !== "general"
        ? folderSets.find((s) => s._id === activeSetFilter) ?? null
        : null,
    [folderSets, activeSetFilter],
  );
  const generalCount = useMemo(() => {
    if (tab === "uploads") return rawAssets.filter((a) => !a.setId).length;
    if (tab === "finals") return finalAssets.filter((f) => !f.setId).length;
    return clientSelectedAssets.filter((a) => !a.setId).length;
  }, [tab, rawAssets, finalAssets, clientSelectedAssets]);
  const getSetCount = useCallback(
    (setId: string) => {
      const setRow = folderSets.find((s) => s._id === setId);
      if (setRow) {
        if (tab === "uploads" && typeof setRow.rawCount === "number") return setRow.rawCount;
        if (tab === "finals" && typeof setRow.finalCount === "number") return setRow.finalCount;
        if (tab === "selection" && typeof setRow.selectionCount === "number")
          return setRow.selectionCount;
        if (typeof setRow.mediaCount === "number") return setRow.mediaCount;
      }
      if (tab === "uploads") return rawAssets.filter((a) => a.setId === setId).length;
      if (tab === "finals") return finalAssets.filter((f) => f.setId === setId).length;
      return clientSelectedAssets.filter((a) => a.setId === setId).length;
    },
    [folderSets, tab, rawAssets, finalAssets, clientSelectedAssets],
  );
  const savedMaxClientSelections = useMemo(
    () => (folder ? extractMaxClientSelections(folder) : null),
    [folder],
  );
  const selectionLimitDirty = useMemo(() => {
    if (!folder) return false;
    if (selectionLimitUnlimited) return savedMaxClientSelections != null;
    const n = Number.parseInt(selectionLimitInput.trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 9999 && n !== savedMaxClientSelections;
  }, [folder, selectionLimitUnlimited, selectionLimitInput, savedMaxClientSelections]);

  type FolderLightboxItem = { id: string; name: string; src: string; isVideo: boolean };
  const lightboxNavItems = useMemo((): FolderLightboxItem[] => {
    if (tab === "uploads") {
      return filteredRawAssets.map((a) => ({
        id: a.id,
        name: a.originalName,
        src: a.previewUrl ?? a.thumbUrl,
        isVideo: isDemoAssetVideo(a),
      }));
    }
    if (tab === "selection") {
      return filteredClientSelectedAssets.map((a) => ({
        id: a.id,
        name: a.originalName,
        src: a.previewUrl ?? a.thumbUrl,
        isVideo: isDemoAssetVideo(a),
      }));
    }
    return filteredFinalAssets.map((f) => ({
      id: f.id,
      name: f.name,
      src: f.url,
      isVideo: isDemoFinalAssetVideo(f),
    }));
  }, [tab, filteredRawAssets, filteredClientSelectedAssets, filteredFinalAssets]);

  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  useEffect(() => {
    setLightboxId(null);
    setLightboxZoom(1);
  }, [tab]);

  useEffect(() => {
    if (savedMaxClientSelections == null) {
      setSelectionLimitUnlimited(true);
      setSelectionLimitInput("20");
    } else {
      setSelectionLimitUnlimited(false);
      setSelectionLimitInput(String(savedMaxClientSelections));
    }
  }, [savedMaxClientSelections]);

  const lbNavIndex = lightboxId
    ? lightboxNavItems.findIndex((item) => item.id === lightboxId)
    : -1;
  const lbItem = lbNavIndex >= 0 ? lightboxNavItems[lbNavIndex] : null;

  useEffect(() => {
    if (!lightboxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxId(null);
        setLightboxZoom(1);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select") ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && lbNavIndex > 0) {
        e.preventDefault();
        const prev = lightboxNavItems[lbNavIndex - 1];
        if (prev) {
          setLightboxId(prev.id);
          setLightboxZoom(1);
        }
      } else if (
        e.key === "ArrowRight" &&
        lbNavIndex >= 0 &&
        lbNavIndex < lightboxNavItems.length - 1
      ) {
        e.preventDefault();
        const next = lightboxNavItems[lbNavIndex + 1];
        if (next) {
          setLightboxId(next.id);
          setLightboxZoom(1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxId, lbNavIndex, lightboxNavItems]);

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
    setActiveSetFilter("all");
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
    filteredRawAssets.length > 0 && filteredRawAssets.every((a) => selectedRawIds.has(a.id));
  const rawSomeSelected = filteredRawAssets.some((a) => selectedRawIds.has(a.id)) && !rawAllSelected;
  const finalAllSelected =
    filteredFinalAssets.length > 0 && filteredFinalAssets.every((f) => selectedFinalIds.has(f.id));
  const finalSomeSelected =
    filteredFinalAssets.some((f) => selectedFinalIds.has(f.id)) && !finalAllSelected;

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
      (
        loaded: number,
        total: number,
        lengthComputable: boolean,
        batch?: { fileIndex: number; fileCount: number },
      ) => {
        const canCompute = lengthComputable && total > 0;
        /** Until at least one byte is reported, keep indeterminate — avoids an empty 0% bar. */
        const showDeterminate = canCompute && loaded > 0;
        const rounded = canCompute
          ? Math.min(100, Math.round((100 * loaded) / total))
          : 0;
        const percent =
          showDeterminate && rounded < 1 ? 1 : showDeterminate ? rounded : 0;
        setUploadProgress((prev) => ({
          kind,
          phase: "uploading",
          computable: showDeterminate,
          percent,
          fileIndex:
            batch?.fileIndex ??
            (prev?.phase === "uploading" && prev.fileIndex !== undefined ? prev.fileIndex : undefined),
          fileCount:
            batch?.fileCount ??
            (prev?.phase === "uploading" && prev.fileCount !== undefined ? prev.fileCount : undefined),
        }));
      },
    [],
  );

  const activeUploadSetId = useMemo((): string | null | undefined => {
    if (activeSetFilter === "general") return null;
    if (activeSetFilter === "all") return undefined;
    return activeSetFilter;
  }, [activeSetFilter]);

  const mergeFinalFormOpts = useCallback(
    (
      dup: DuplicateUploadAction,
      files: File[],
      selectionMediaId?: string,
      setId?: string | null,
    ): UploadFolderFinalMediaFormOptions => {
      const d = pendingFinalDeliveryRef.current;
      return finalUploadFormOptions(
        dup,
        files,
        selectionMediaId,
        d ?? { clientHasPaidForFinals: true },
        setId,
      );
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
    setUploadProgress({ kind: "final", phase: "preparing", computable: false, percent: 0 });
    let awaitingConflictChoice = false;
    const selectionMediaId: string | undefined = undefined;
    try {
      const dupPreview = await postFolderMediaDuplicatePreview(folder._id, {
        kind: "final",
        filenames: files.map((f) => f.name),
        ...(activeUploadSetId !== undefined ? { setId: activeUploadSetId } : {}),
      });
      if (dupPreview.hasConflicts) {
        awaitingConflictChoice = true;
        const conflictingNames =
          dupPreview.conflictingFilenames && dupPreview.conflictingFilenames.length > 0
            ? dupPreview.conflictingFilenames
            : incomingFilenamesConflictingWithFolder(
                "final",
                files.map((f) => f.name),
                folder,
                activeUploadSetId,
              );
        setDuplicateFilenamePrompt({
          kind: "final",
          files,
          selectionMediaId,
          setId: activeUploadSetId,
          conflictingNames,
        });
        return;
      }

      setUploadProgress({
        kind: "final",
        phase: "uploading",
        computable: false,
        percent: 0,
        fileIndex: 1,
        fileCount: files.length,
      });
      await uploadFolderFinalMedia(
        folder._id,
        files,
        uploadProgressHandler("final"),
        mergeFinalFormOpts(
          getDuplicateUploadPreference(),
          files,
          selectionMediaId,
          activeUploadSetId,
        ),
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
    const targetSetId = activeUploadSetId;
    setBusy(true);
    setUploadProgress({ kind: "raw", phase: "preparing", computable: false, percent: 0 });
    let awaitingConflictChoice = false;
    try {
      const dupPreview = await postFolderMediaDuplicatePreview(folder._id, {
        kind: "raw",
        filenames: files.map((f) => f.name),
        ...(targetSetId !== undefined ? { setId: targetSetId } : {}),
      });
      if (dupPreview.hasConflicts) {
        awaitingConflictChoice = true;
        const conflictingNames =
          dupPreview.conflictingFilenames && dupPreview.conflictingFilenames.length > 0
            ? dupPreview.conflictingFilenames
            : incomingFilenamesConflictingWithFolder(
                "raw",
                files.map((f) => f.name),
                folder,
                targetSetId,
              );
        setDuplicateFilenamePrompt({ kind: "raw", files, conflictingNames, setId: targetSetId });
        return;
      }

      setUploadProgress({
        kind: "raw",
        phase: "uploading",
        computable: false,
        percent: 0,
        fileIndex: 1,
        fileCount: files.length,
      });
      await uploadFolderRawMedia(
        folder._id,
        files,
        uploadProgressHandler("raw"),
        rawUploadFormOptions(getDuplicateUploadPreference(), targetSetId),
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

  function onDuplicatePromptCancel() {
    setDuplicateFilenamePrompt(null);
    setUploadProgress(null);
    setBusy(false);
    pendingFinalDeliveryRef.current = null;
  }

  async function onDuplicatePromptReplace() {
    const p = duplicateFilenamePrompt;
    if (!folder || !p) return;
    setDuplicateFilenamePrompt(null);
    setBusy(true);
    setUploadProgress({
      kind: p.kind,
      phase: "uploading",
      computable: false,
      percent: 0,
      fileIndex: 1,
      fileCount: p.files.length,
    });
    try {
      if (p.kind === "raw") {
        await uploadFolderRawMedia(
          folder._id,
          p.files,
          uploadProgressHandler("raw"),
          rawUploadFormOptions("replace", p.setId),
        );
      } else {
        await uploadFolderFinalMedia(
          folder._id,
          p.files,
          uploadProgressHandler("final"),
          mergeFinalFormOpts("replace", p.files, p.selectionMediaId, p.setId),
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

    const conflictSet = new Set(p.conflictingNames);
    /** When we know which names collide, omit them from the request entirely (saves time and bandwidth). */
    const canFilterLocally = p.conflictingNames.length > 0;
    const filesToUpload = canFilterLocally
      ? p.files.filter((f) => !conflictSet.has(f.name))
      : p.files;
    const skippedWithoutUpload = canFilterLocally ? p.files.length - filesToUpload.length : 0;

    setDuplicateFilenamePrompt(null);

    if (filesToUpload.length === 0) {
      setUploadProgress(null);
      setBusy(false);
      pendingFinalDeliveryRef.current = null;
      showToast(
        p.kind === "raw"
          ? "Nothing to upload — those filenames are already in raw uploads."
          : "Nothing to upload — those filenames are already in finals.",
        "success",
      );
      return;
    }

    setBusy(true);
    setUploadProgress({
      kind: p.kind,
      phase: "uploading",
      computable: false,
      percent: 0,
      fileIndex: 1,
      fileCount: filesToUpload.length,
    });
    try {
      let ignored = 0;
      if (p.kind === "raw") {
        const result = await uploadFolderRawMedia(
          folder._id,
          filesToUpload,
          uploadProgressHandler("raw"),
          rawUploadFormOptions("ignore", p.setId),
        );
        ignored = result?.ignoredDuplicatesCount ?? 0;
      } else {
        const result = await uploadFolderFinalMedia(
          folder._id,
          filesToUpload,
          uploadProgressHandler("final"),
          mergeFinalFormOpts("ignore", filesToUpload, p.selectionMediaId, p.setId),
        );
        ignored = result?.ignoredDuplicatesCount ?? 0;
      }
      await refreshFolder();
      if (skippedWithoutUpload > 0) {
        showToast(
          ignored > 0
            ? p.kind === "raw"
              ? `Uploaded ${filesToUpload.length} new file(s); ${skippedWithoutUpload} duplicate name(s) were not sent. Server also skipped ${ignored}.`
              : `Uploaded ${filesToUpload.length} new final(s); ${skippedWithoutUpload} duplicate name(s) were not sent. Server also skipped ${ignored}.`
            : p.kind === "raw"
              ? `Uploaded ${filesToUpload.length} new file(s); ${skippedWithoutUpload} duplicate name(s) were not sent.`
              : `Uploaded ${filesToUpload.length} new final(s); ${skippedWithoutUpload} duplicate name(s) were not sent.`,
          "success",
        );
      } else {
        showToast(
          ignored > 0
            ? p.kind === "raw"
              ? `Uploaded; ${ignored} duplicate filename(s) skipped.`
              : `Uploaded; ${ignored} duplicate final name(s) skipped.`
            : p.kind === "raw"
              ? `${filesToUpload.length} file(s) uploaded.`
              : `${filesToUpload.length} final(s) uploaded.`,
          "success",
        );
      }
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

  function pickCoverImage() {
    coverFileInputRef.current?.click();
  }

  async function onCoverImageFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !folder) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.", "error");
      return;
    }
    const blobPreview = URL.createObjectURL(file);
    setLocalCoverPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return blobPreview;
    });

    setUploadingCover(true);
    try {
      const focal = focalEditOpen ? focalDraft : parseFolderCoverFocal(folder);
      await updateFolder(folder._id, {
        coverImage: file,
        useDefaultCover: false,
        coverFocalX: focal.x,
        coverFocalY: focal.y,
      });
      const refreshed = await refreshFolder();
      setFocalDraft(parseFolderCoverFocal(refreshed));
      setCoverCacheVersion(Date.now());
      setLocalCoverPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      showToast("Cover image updated.", "success");
    } catch (e) {
      setLocalCoverPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not upload cover image.",
        "error",
      );
    } finally {
      setUploadingCover(false);
    }
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
    setSelectedRawIds((prev) => {
      const next = new Set(prev);
      if (select) {
        for (const a of filteredRawAssets) next.add(a.id);
      } else {
        for (const a of filteredRawAssets) next.delete(a.id);
      }
      return next;
    });
  }

  function setFinalSelectAll(select: boolean) {
    if (mediaDeleteBlocked()) return;
    setSelectedFinalIds((prev) => {
      const next = new Set(prev);
      if (select) {
        for (const f of filteredFinalAssets) next.add(f.id);
      } else {
        for (const f of filteredFinalAssets) next.delete(f.id);
      }
      return next;
    });
  }

  async function onDeleteRawAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (
      !confirm(
        "Move this file to trash? It will disappear from the gallery but can be restored until the deadline.",
      )
    ) {
      return;
    }
    setDeletingKey(`raw:${mediaId}`);
    try {
      const result = await deleteFolderRawMedia(folder._id, mediaId);
      await refreshFolder();
      setSelectedRawIds((prev) => {
        if (!prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      const deadline = formatRestoreBeforeLabel(result.restoreBefore);
      showToast(
        deadline ? `${result.message} Restore by ${deadline}.` : result.message,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move file to trash.",
        "error",
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteFinalAsset(mediaId: string) {
    if (!folder || mediaDeleteBlocked()) return;
    if (
      !confirm(
        "Move this final to trash? It will disappear from the gallery but can be restored until the deadline.",
      )
    ) {
      return;
    }
    setDeletingKey(`final:${mediaId}`);
    try {
      const result = await deleteFolderFinalMedia(folder._id, mediaId);
      await refreshFolder();
      setSelectedFinalIds((prev) => {
        if (!prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      const deadline = formatRestoreBeforeLabel(result.restoreBefore);
      showToast(
        deadline ? `${result.message} Restore by ${deadline}.` : result.message,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move final to trash.",
        "error",
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteAllRaw() {
    if (!folder || mediaDeleteBlocked() || rawAssets.length === 0) return;
    if (
      !confirm(
        `Move all ${rawAssets.length} raw upload(s) to trash? They will leave the gallery but stay recoverable until the deadline.`,
      )
    ) {
      return;
    }
    setDeletingKey("raw:all");
    try {
      const result = await deleteAllFolderRawMedia(folder._id);
      await refreshFolder();
      setSelectedRawIds(new Set());
      const deadline = formatRestoreBeforeLabel(result.restoreBefore);
      showToast(
        deadline
          ? `${result.deletedCount} file(s) moved to trash. Restore by ${deadline}.`
          : result.message,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move raw uploads to trash.",
        "error",
      );
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteAllFinals() {
    if (!folder || mediaDeleteBlocked() || finalAssets.length === 0) return;
    if (
      !confirm(
        `Move all ${finalAssets.length} final(s) to trash? They will leave the gallery but stay recoverable until the deadline.`,
      )
    ) {
      return;
    }
    setDeletingKey("final:all");
    try {
      const result = await deleteAllFolderFinalMedia(folder._id);
      await refreshFolder();
      setSelectedFinalIds(new Set());
      const deadline = formatRestoreBeforeLabel(result.restoreBefore);
      showToast(
        deadline
          ? `${result.deletedCount} final(s) moved to trash. Restore by ${deadline}.`
          : result.message,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move finals to trash.",
        "error",
      );
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
        `Move ${ids.length} selected image(s) to trash? They will disappear from the gallery but can be restored until the deadline.`,
      )
    ) {
      return;
    }
    setDeletingKey("raw:bulk");
    try {
      let restoreBefore = "";
      if (ids.length === rawAssets.length) {
        const result = await deleteAllFolderRawMedia(folder._id);
        restoreBefore = result.restoreBefore;
      } else {
        for (const id of ids) {
          const r = await deleteFolderRawMedia(folder._id, id);
          if (r.restoreBefore) restoreBefore = r.restoreBefore;
        }
      }
      await refreshFolder();
      setSelectedRawIds(new Set());
      const deadline = formatRestoreBeforeLabel(restoreBefore);
      showToast(
        deadline
          ? `${ids.length} file(s) moved to trash. Restore by ${deadline}.`
          : ids.length === 1
            ? "File moved to trash."
            : `${ids.length} files moved to trash.`,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move selected files to trash.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setDeletingKey(null);
    }
  }

  async function onDeleteSelectedFinals() {
    if (!folder || mediaDeleteBlocked()) return;
    const ids = finalAssets.map((f) => f.id).filter((id) => selectedFinalIds.has(id));
    if (ids.length === 0) return;
    if (
      !confirm(
        `Move ${ids.length} selected final(s) to trash? They will disappear from the gallery but can be restored until the deadline.`,
      )
    ) {
      return;
    }
    setDeletingKey("final:bulk");
    try {
      let restoreBefore = "";
      if (ids.length === finalAssets.length) {
        const result = await deleteAllFolderFinalMedia(folder._id);
        restoreBefore = result.restoreBefore;
      } else {
        for (const id of ids) {
          const r = await deleteFolderFinalMedia(folder._id, id);
          if (r.restoreBefore) restoreBefore = r.restoreBefore;
        }
      }
      await refreshFolder();
      setSelectedFinalIds(new Set());
      const deadline = formatRestoreBeforeLabel(restoreBefore);
      showToast(
        deadline
          ? `${ids.length} final(s) moved to trash. Restore by ${deadline}.`
          : ids.length === 1
            ? "Final moved to trash."
            : `${ids.length} finals moved to trash.`,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not move selected finals to trash.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setDeletingKey(null);
    }
  }

  async function onCreateSet() {
    if (!folder || creatingSet) return;
    const name = newSetName.trim();
    if (!name) return;
    try {
      setCreatingSet(true);
      const next = await createFolderSet(folder._id, name);
      setFolder(next.folder);
      setNewSetName("");
      setActiveSetFilter(next.set._id);
      showToast(`Set "${next.set.name}" added.`, "success");
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not create set.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setCreatingSet(false);
    }
  }

  async function onSaveSetEdit(setId: string) {
    if (!folder || savingSetId || deletingSetId) return;
    const name = editingSetName.trim();
    if (!name) {
      showToast("Collection name cannot be empty.", "error");
      return;
    }
    try {
      setSavingSetId(setId);
      const updated = await updateFolderSet(folder._id, setId, { name });
      setFolder(updated);
      setEditingSetId(null);
      setEditingSetName("");
      showToast("Collection updated.", "success");
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not update collection.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setSavingSetId(null);
    }
  }

  async function onDeleteSet(setId: string, setName: string) {
    if (!folder || savingSetId || deletingSetId) return;
    if (
      !confirm(
        `Delete collection "${setName}"? Existing media stays in the gallery and is moved back to General.`,
      )
    ) {
      return;
    }
    try {
      setDeletingSetId(setId);
      const updated = await deleteFolderSet(folder._id, setId);
      setFolder(updated);
      if (activeSetFilter === setId) setActiveSetFilter("all");
      if (editingSetId === setId) {
        setEditingSetId(null);
        setEditingSetName("");
      }
      showToast("Collection deleted.", "success");
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not delete collection.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setDeletingSetId(null);
    }
  }

  const saveSelectionLimit = useCallback(async () => {
    if (!folder || selectionLimitSaving || !selectionLimitDirty) return;
    let nextMax: number | null = null;
    if (!selectionLimitUnlimited) {
      const n = Number.parseInt(selectionLimitInput.trim(), 10);
      if (!Number.isFinite(n) || n < 1) {
        showToast("Enter a limit of at least 1.", "error");
        return;
      }
      if (n > 9999) {
        showToast("Keep the limit under 10,000.", "error");
        return;
      }
      nextMax = n;
    }
    try {
      setSelectionLimitSaving(true);
      await patchFolderShare(folder._id, { maxClientSelections: nextMax });
      const refreshed = await refreshFolder();
      showToast(
        nextMax == null
          ? "Clients can select unlimited photos."
          : `Selection limit saved: ${nextMax}.`,
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof FoldersApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save selection limit.",
        "error",
      );
      await refreshFolder().catch(() => {});
    } finally {
      setSelectionLimitSaving(false);
    }
  }, [
    folder,
    selectionLimitSaving,
    selectionLimitDirty,
    selectionLimitUnlimited,
    selectionLimitInput,
    showToast,
    refreshFolder,
  ]);

  const coverSrc = useMemo(() => {
    if (localCoverPreviewUrl) return localCoverPreviewUrl;
    const base = folder ? (getFolderCoverUrl(folder) ?? FALLBACK_COVER) : FALLBACK_COVER;
    if (coverCacheVersion > 0 && base !== FALLBACK_COVER) {
      return appendCoverCacheBust(base, coverCacheVersion);
    }
    return base;
  }, [folder, localCoverPreviewUrl, coverCacheVersion]);

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
  const totalMediaCount = rawAssets.length + finalAssets.length;
  const selectionLimitValue = savedMaxClientSelections;
  const selectionProgressPercent = selectionLimitValue
    ? Math.min(100, Math.round((clientSelectedAssets.length / selectionLimitValue) * 100))
    : 0;

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

      {/* Background music player */}
      <div
        className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white px-3 py-2 shadow-sm shadow-black/5 dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-black/25"
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
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand dark:bg-brand/20">
            <Music2 className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {folder.backgroundMusic ? folder.backgroundMusic : "No soundtrack selected"}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Ambient gallery music</p>
          </div>
          <div className="flex items-center gap-1.5">
            {folder.backgroundMusicUrl ? (
              <audio
                controls
                src={folder.backgroundMusicUrl}
                className="h-8 w-[14rem] max-w-full accent-zinc-700 dark:accent-zinc-300"
                preload="metadata"
              />
            ) : (
              <div className="h-8 w-[10rem] rounded-lg bg-zinc-100 dark:bg-zinc-800" aria-hidden />
            )}
            <button
              type="button"
              disabled={musicBusy}
              onClick={() => musicFileInputRef.current?.click()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label={folder.backgroundMusicUrl ? "Replace background music" : "Upload background music"}
            >
              <Upload className="h-4 w-4" aria-hidden />
            </button>
            {folder.backgroundMusicUrl || folder.backgroundMusic ? (
              <button
                type="button"
                disabled={musicBusy}
                onClick={() => void onRemoveBackgroundMusic()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-45 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                aria-label="Remove background music"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              role="switch"
              aria-checked={folder.backgroundMusicEnabled !== false}
              disabled={musicBusy}
              onClick={() =>
                void onToggleBackgroundMusicForClients(!(folder.backgroundMusicEnabled !== false))
              }
              className={cn(
                "relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full border-2 transition disabled:opacity-45",
                folder.backgroundMusicEnabled !== false
                  ? "border-zinc-700 bg-zinc-900 dark:border-zinc-500 dark:bg-zinc-100"
                  : "border-zinc-200 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-[left] duration-200 dark:ring-black/20",
                  folder.backgroundMusicEnabled !== false ? "left-[1.5rem] dark:bg-zinc-900" : "left-0.5",
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
            key={coverSrc}
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
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={pickCoverImage}
                disabled={busy || savingFocal || uploadingCover}
                aria-label="Upload cover image"
                title="Upload cover image"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:size-9"
              >
                {uploadingCover ? (
                  <RefreshCw className="h-4 w-4 shrink-0 animate-spin opacity-90" aria-hidden />
                ) : (
                  <ImagePlus className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                )}
              </button>
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void onCoverImageFileChange(e)}
              />
              <button
                type="button"
                onClick={() => (focalEditOpen ? cancelFocalEditor() : openFocalEditor())}
                disabled={busy || savingFocal || uploadingCover}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="space-y-4">
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Gallery sections"
            className="flex gap-1.5 rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            {tabItems.map(({ key, label, icon: Icon, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-brand/10 text-brand ring-1 ring-brand/20 dark:bg-brand/20 dark:text-brand-100"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                  {count > 0 ? (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2">
              {folderSets.length > 0 ? (
                <>
              <button
                type="button"
                onClick={() => setActiveSetFilter("all")}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition",
                  activeSetFilter === "all"
                    ? "bg-brand/10 text-brand ring-1 ring-brand/25 dark:bg-brand/20 dark:text-brand-100"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                )}
                aria-pressed={activeSetFilter === "all"}
              >
                All Media
              </button>
              <button
                type="button"
                onClick={() => setActiveSetFilter("general")}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition",
                  activeSetFilter === "general"
                    ? "bg-brand/10 text-brand ring-1 ring-brand/25 dark:bg-brand/20 dark:text-brand-100"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                )}
                aria-pressed={activeSetFilter === "general"}
              >
                General
                <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-300">
                  {generalCount}
                </span>
              </button>
              {folderSets.map((setItem) => (
                <button
                  type="button"
                  key={setItem._id}
                  onClick={() => {
                    setActiveSetFilter(setItem._id);
                    if (editingSetId && editingSetId !== setItem._id) {
                      setEditingSetId(null);
                      setEditingSetName("");
                    }
                  }}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition",
                    activeSetFilter === setItem._id
                      ? "border-brand/30 bg-brand/10 text-brand dark:border-brand/40 dark:bg-brand/20 dark:text-brand-100"
                      : "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                  )}
                  title={setItem.name}
                  aria-pressed={activeSetFilter === setItem._id}
                >
                  {setItem.name}
                  <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-300">
                    {getSetCount(setItem._id)}
                  </span>
                </button>
              ))}
              {activeSetItem ? (
                <div className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                  {editingSetId === activeSetItem._id ? (
                    <>
                      <input
                        type="text"
                        value={editingSetName}
                        onChange={(e) => setEditingSetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void onSaveSetEdit(activeSetItem._id);
                          if (e.key === "Escape") {
                            setEditingSetId(null);
                            setEditingSetName("");
                          }
                        }}
                        className="w-32 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-brand/25 dark:border-zinc-600 dark:bg-zinc-900"
                        aria-label={`Rename ${activeSetItem.name}`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void onSaveSetEdit(activeSetItem._id)}
                        disabled={
                          savingSetId === activeSetItem._id || deletingSetId === activeSetItem._id
                        }
                        className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-45"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSetId(null);
                          setEditingSetName("");
                        }}
                        disabled={
                          savingSetId === activeSetItem._id || deletingSetId === activeSetItem._id
                        }
                        className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSetId(activeSetItem._id);
                          setEditingSetName(activeSetItem.name);
                        }}
                        disabled={
                          savingSetId === activeSetItem._id || deletingSetId === activeSetItem._id
                        }
                        aria-label={`Edit collection ${activeSetItem.name}`}
                        title="Edit collection"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-45 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteSet(activeSetItem._id, activeSetItem.name)}
                        disabled={
                          savingSetId === activeSetItem._id || deletingSetId === activeSetItem._id
                        }
                        aria-label={`Delete collection ${activeSetItem.name}`}
                        title="Delete collection"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-red-600 transition hover:bg-red-50 disabled:opacity-45 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              ) : null}
                </>
              ) : null}
              <input
                type="text"
                value={newSetName}
                disabled={creatingSet}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCreateSet();
                }}
                placeholder="New collection"
                aria-label="New set name"
                className="min-w-[9rem] flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/25 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={creatingSet || !newSetName.trim()}
                onClick={() => void onCreateSet()}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {creatingSet ? <InlineActionSkeleton /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                New Collection
              </button>
            </div>
          </div>

          {/* Tab panels */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        {uploadProgress ? (
          <div className="mb-6">
            <UploadProgressBanner
              kind={uploadProgress.kind}
              phase={uploadProgress.phase}
              computable={uploadProgress.computable}
              percent={uploadProgress.percent}
              fileIndex={uploadProgress.fileIndex}
              fileCount={uploadProgress.fileCount}
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
              {filteredRawAssets.length > 0 ? (
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
                    {filteredRawAssets.some((a) => selectedRawIds.has(a.id)) ? (
                      <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                        {filteredRawAssets.filter((a) => selectedRawIds.has(a.id)).length} selected
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onDeleteSelectedRaw()}
                      disabled={
                        mediaDeleteBlocked() ||
                        filteredRawAssets.filter((a) => selectedRawIds.has(a.id)).length === 0
                      }
                      className="inline-flex min-h-[2.25rem] min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      {deletingKey === "raw:bulk" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Move selected to trash"
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
                        "Move all to trash"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {folderSets.length > 0 && activeSetFilter === "all" ? (
              <p className="rounded-xl border border-dashed border-brand/30 bg-brand/5 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                Select a collection below to upload into that set. Choose{" "}
                <span className="font-semibold">General</span> for uncategorized files.
              </p>
            ) : null}
            <UploadDragger
              label="Drop raw files here"
              hint="Images (JPG, PNG, WebP, GIF) or video (MP4, MOV, WebM, etc.)."
              accept="image/jpeg,image/png,image/webp,image/gif,video/*"
              disabled={busy}
              onFiles={(files) => void onRawUpload(files)}
            />
            {filteredRawAssets.length === 0 ? (
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
                {filteredRawAssets.map((a) => (
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
                        <AdminMediaPreview
                          src={a.previewUrl ?? a.thumbUrl}
                          name={a.originalName}
                          isVideo={isDemoAssetVideo(a)}
                        />
                        {isDemoAssetVideo(a) ? (
                          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/10 text-white">
                            <PlayCircle className="h-8 w-8 drop-shadow" aria-hidden />
                          </span>
                        ) : null}
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
                        title="Move to trash"
                      >
                        {deletingKey === `raw:${a.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Move to trash</span>
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
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Selection limit
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionLimitUnlimited(true)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                    selectionLimitUnlimited
                      ? "bg-brand text-white"
                      : "bg-white text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300",
                  )}
                >
                  Unlimited
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionLimitUnlimited(false)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                    !selectionLimitUnlimited
                      ? "bg-brand text-white"
                      : "bg-white text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300",
                  )}
                >
                  Set limit
                </button>
                {!selectionLimitUnlimited ? (
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={selectionLimitInput}
                    onChange={(e) => setSelectionLimitInput(e.target.value)}
                    className="w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium tabular-nums outline-none focus:ring-2 focus:ring-brand/25 dark:border-zinc-700 dark:bg-zinc-950"
                    aria-label="Maximum client selections"
                  />
                ) : null}
                <button
                  type="button"
                  disabled={!selectionLimitDirty || selectionLimitSaving}
                  onClick={() => void saveSelectionLimit()}
                  className="ml-auto inline-flex items-center justify-center rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {selectionLimitSaving ? "Saving…" : "Save"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                Client selected: <span className="font-semibold tabular-nums">{clientSelectedAssets.length}</span>
                {savedMaxClientSelections != null ? (
                  <>
                    {" "}
                    / <span className="font-semibold tabular-nums">{savedMaxClientSelections}</span>
                  </>
                ) : null}
              </p>
            </div>
            {filteredClientSelectedAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  No client selections yet. When clients pick shots from the share link,
                  they will show up in this list.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredClientSelectedAssets.map((a) => (
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
                        <AdminMediaPreview
                          src={a.previewUrl ?? a.thumbUrl}
                          name={a.originalName}
                          isVideo={isDemoAssetVideo(a)}
                        />
                        {isDemoAssetVideo(a) ? (
                          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/10 text-white">
                            <PlayCircle className="h-8 w-8 drop-shadow" aria-hidden />
                          </span>
                        ) : null}
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
                {filteredFinalAssets.length > 0 ? (
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
              {filteredFinalAssets.length > 0 ? (
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
                    {filteredFinalAssets.some((f) => selectedFinalIds.has(f.id)) ? (
                      <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                        {filteredFinalAssets.filter((f) => selectedFinalIds.has(f.id)).length} selected
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onDeleteSelectedFinals()}
                      disabled={
                        mediaDeleteBlocked() ||
                        filteredFinalAssets.filter((f) => selectedFinalIds.has(f.id)).length === 0
                      }
                      className="inline-flex min-h-[2.25rem] min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      {deletingKey === "final:bulk" ? (
                        <InlineActionSkeleton />
                      ) : (
                        "Move selected to trash"
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
                        "Move all to trash"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <UploadDragger
              label="Drop edited finals here"
              hint="Images (JPG, PNG, WebP, GIF) or video (MP4, MOV, WebM, etc.)."
              accept="image/jpeg,image/png,image/webp,image/gif,video/*"
              disabled={busy}
              onFiles={(files) => void openFinalUploadWizard(files)}
            />
            {filteredFinalAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800">
                No finals uploaded yet.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredFinalAssets.map((f) => (
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
                        <AdminMediaPreview
                          src={f.url}
                          name={f.name}
                          isVideo={isDemoFinalAssetVideo(f)}
                        />
                        {isDemoFinalAssetVideo(f) ? (
                          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/10 text-white">
                            <PlayCircle className="h-8 w-8 drop-shadow" aria-hidden />
                          </span>
                        ) : null}
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
                        title="Move final to trash"
                      >
                        {deletingKey === `final:${f.id}` ? (
                          <InlineActionSkeleton />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">Move to trash</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Share Gallery</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {shareActive ? "Published" : "Draft"}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50">
              <div className="flex items-center border-b border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                <input
                  readOnly
                  className="min-w-0 flex-1 cursor-default truncate border-0 bg-transparent px-2 py-2 text-xs text-zinc-700 outline-none dark:text-zinc-100"
                  value={shareActive ? shareUrl : "Sharing not enabled yet."}
                  title={shareActive ? shareUrl : undefined}
                  aria-label="Share URL"
                />
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
                  className="inline-flex size-7 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label={linkCopied ? "Copied" : "Copy share link"}
                >
                  {linkCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
              <div className="flex gap-2 p-2">
                <a
                  href={shareActive ? shareUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center rounded-lg text-xs font-semibold",
                    shareActive
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "pointer-events-none bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                  )}
                >
                  Open Link
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRegenerateLink}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  aria-label="Regenerate share link"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
                <select
                  className="h-9 min-w-[4.5rem] rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 outline-none focus:ring-2 focus:ring-brand/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={linkExpiry}
                  disabled={busy}
                  onChange={(e) => setLinkExpiry(e.target.value)}
                  aria-label="New link expiry"
                >
                  {expiryPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Gallery Status</h3>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Total files</span>
                <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {totalMediaCount}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Client picks</span>
                <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {clientSelectedAssets.length}
                  {selectionLimitValue ? ` / ${selectionLimitValue}` : ""}
                </span>
              </div>
              {selectionLimitValue ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>Selection progress</span>
                    <span className="font-semibold tabular-nums">{selectionProgressPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-brand transition-all"
                      style={{ width: `${selectionProgressPercent}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Final delivery</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    finalImagesLocked
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                      : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
                  )}
                >
                  {finalImagesLocked ? "Locked" : "Unlocked"}
                </span>
              </div>
              {folder.share?.selectionSubmittedAt ? (
                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Selection submitted{" "}
                  {new Date(folder.share.selectionSubmittedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              ) : null}
            </div>
          </section>
        </aside>
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
              <AdminMediaPreview
                src={lbItem.src}
                name={lbItem.name}
                isVideo={lbItem.isVideo}
                variant="lightbox"
                zoom={lightboxZoom}
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
        <DuplicateUploadConflictDialog
          prompt={{
            kind: duplicateFilenamePrompt.kind,
            files: duplicateFilenamePrompt.files,
            conflictingNames: duplicateFilenamePrompt.conflictingNames,
          }}
          onCancel={onDuplicatePromptCancel}
          onSkip={() => void onDuplicatePromptSkip()}
          onReplace={() => void onDuplicatePromptReplace()}
        />
      ) : null}
    </div>
  );
}
