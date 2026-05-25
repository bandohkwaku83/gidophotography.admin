"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  Copy,
  Download,
  Heart,
  Loader2,
  Lock,
  PlayCircle,
  Send,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  clientInitials,
  editedCardClass,
  finalDisplaySrc,
  GALLERY_MUSIC_MUTE_PREFIX,
  GRID_LAYOUTS,
  GRID_STORAGE_PREFIX,
  galleryListClass,
  isGridLayout,
  isDemoAssetVideo,
  isShareFinalVideo,
  SELECTED_STRIP_IMAGE_SIZES,
  SHARE_GRID_IMAGE_QUALITY,
  SHARE_LIGHTBOX_IMAGE_QUALITY,
  SHARE_LIGHTBOX_SIZES,
  shareGalleryGridSizes,
  toDemoAssets,
  uploadImageWrapClass,
  uploadItemClass,
  type GridLayout,
} from "@/components/client/share-gallery-bits";
import { useToast } from "@/components/toast-provider";
import { ClientGalleryPageSkeleton, InlineStatusSkeleton } from "@/components/ui/skeletons";
import type { DemoAsset, SelectionState } from "@/lib/demo-data";
import { folderCoverObjectPositionStyle, type ApiFolder } from "@/lib/folders-api";
import {
  fetchShareFinalDownloadBlob,
  tryNavigatorShareFinalPhoto,
  getShareFinalDownloadUrl,
  getShareGallery,
  downloadShareFinalsZip,
  type NormalizedShareGallery,
  ShareGalleryError,
  submitShareGallerySelectionsToPhotographer,
  syncShareGallerySelections,
  type ShareGalleryFinal,
} from "@/lib/share-gallery-api";
import { usePreferInlineFinalSave } from "@/lib/use-prefer-inline-final-save";
import { useShareSaveHints } from "@/lib/use-share-save-hints";
import { cn } from "@/lib/utils";

function VideoTileOverlay() {
  return (
    <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/10 text-white">
      <PlayCircle className="h-9 w-9 drop-shadow-md" aria-hidden />
    </span>
  );
}

function tileActionClass(active = false): string {
  return cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/45 text-white shadow-sm backdrop-blur-md transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-45",
    active ? "bg-brand/90 hover:bg-brand" : "bg-black/35 hover:bg-black/60",
  );
}

export function ClientGalleryApp({ token }: { token: string }) {
  const { showToast } = useToast();
  const [gallery, setGallery] = useState<NormalizedShareGallery | null>(null);
  const [assets, setAssets] = useState<DemoAsset[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [finalLightboxId, setFinalLightboxId] = useState<string | null>(null);
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photoTab, setPhotoTab] = useState<"all" | "selected" | "edited">("all");
  const [zoom, setZoom] = useState(1);
  const [gridLayout, setGridLayout] = useState<GridLayout>("masonry");
  const [downloadAllFinalsBusy, setDownloadAllFinalsBusy] = useState(false);
  const [finalSaveBusyId, setFinalSaveBusyId] = useState<string | null>(null);
  const [photoSaveAssist, setPhotoSaveAssist] = useState<{
    objectUrl: string;
    label: string;
    suggestOpenExternally: boolean;
  } | null>(null);

  const preferInlineFinalSave = usePreferInlineFinalSave();
  const shareHints = useShareSaveHints();
  /** Single-flight guard for Save on touch devices (share sheet + in-page saver). */
  const finalDeliverLock = useRef(false);
  const photoSaveBlobUrlRef = useRef<string | null>(null);
  /** Applied once after share data loads so the first tab matches finals vs originals. */
  const initialPhotoTabAppliedRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [galleryMusicStarted, setGalleryMusicStarted] = useState(false);
  const [galleryMusicMuted, setGalleryMusicMuted] = useState(false);

  useEffect(() => {
    initialPhotoTabAppliedRef.current = false;
  }, [token]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`${GRID_STORAGE_PREFIX}${token}`);
      if (raw && isGridLayout(raw)) setGridLayout(raw);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`${GRID_STORAGE_PREFIX}${token}`, gridLayout);
    } catch {
      /* ignore */
    }
  }, [token, gridLayout]);

  const galleryMusicUrl = gallery?.backgroundMusicUrl?.trim() ?? "";
  const musicAllowed =
    galleryMusicUrl.length > 0 && gallery != null && gallery.backgroundMusicEnabled !== false;

  useEffect(() => {
    setGalleryMusicStarted(false);
    try {
      setGalleryMusicMuted(
        sessionStorage.getItem(`${GALLERY_MUSIC_MUTE_PREFIX}${token}`) === "1",
      );
    } catch {
      setGalleryMusicMuted(false);
    }
  }, [token]);

  useEffect(() => {
    if (!musicAllowed) setGalleryMusicStarted(false);
  }, [musicAllowed]);

  /** Try autoplay with sound; browsers often block until a gesture (handled below). */
  useEffect(() => {
    if (!musicAllowed || galleryMusicMuted) return;
    const a = audioRef.current;
    if (!a) return;
    let cancelled = false;
    void a.play().then(() => {
      if (!cancelled) setGalleryMusicStarted(true);
    }).catch(() => {
      /* Autoplay blocked — first pointer gesture effect will retry. */
    });
    return () => {
      cancelled = true;
    };
  }, [musicAllowed, galleryMusicMuted, galleryMusicUrl]);

  /** First tap, key, wheel, touch, or scroll starts music when autoplay was blocked. */
  useEffect(() => {
    if (!musicAllowed || galleryMusicMuted || galleryMusicStarted) return;
    const a = audioRef.current;
    if (!a) return;
    const tryStart = () => {
      void a.play().then(() => {
        setGalleryMusicStarted(true);
      }).catch(() => {});
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", tryStart, opts);
    window.addEventListener("keydown", tryStart, opts);
    window.addEventListener("wheel", tryStart, opts);
    window.addEventListener("touchstart", tryStart, opts);
    window.addEventListener("scroll", tryStart, opts);
    return () => {
      window.removeEventListener("pointerdown", tryStart, opts);
      window.removeEventListener("keydown", tryStart, opts);
      window.removeEventListener("wheel", tryStart, opts);
      window.removeEventListener("touchstart", tryStart, opts);
      window.removeEventListener("scroll", tryStart, opts);
    };
  }, [musicAllowed, galleryMusicMuted, galleryMusicStarted, galleryMusicUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !musicAllowed) return;
    if (!galleryMusicStarted) return;
    if (galleryMusicMuted) {
      a.pause();
    } else {
      void a.play().catch(() => {});
    }
  }, [musicAllowed, galleryMusicStarted, galleryMusicMuted]);

  useEffect(() => {
    const a = audioRef.current;
    return () => {
      a?.pause();
    };
  }, []);

  useEffect(() => {
    if (gallery?.finalDelivery === false && photoTab === "edited") {
      setPhotoTab("all");
    }
  }, [gallery?.finalDelivery, photoTab]);

  /**
   * First open: land on Finals when there are delivered finals; otherwise Originals.
   * Optional URL override: `?tab=edited|all|selected` or `?view=finals|raw|originals|all|selected|edited`.
   */
  useEffect(() => {
    if (loadState !== "ok" || !gallery) return;
    if (initialPhotoTabAppliedRef.current) return;
    initialPhotoTabAppliedRef.current = true;

    let tabParam = "";
    let viewParam = "";
    if (typeof window !== "undefined") {
      try {
        const sp = new URLSearchParams(window.location.search);
        tabParam = sp.get("tab")?.toLowerCase() ?? "";
        viewParam = sp.get("view")?.toLowerCase() ?? "";
      } catch {
        /* ignore */
      }
    }

    const showFinals = gallery.finalDelivery !== false;

    if (tabParam === "selected" || viewParam === "selected") {
      setPhotoTab("selected");
      return;
    }
    if (
      showFinals &&
      (tabParam === "edited" ||
        tabParam === "finals" ||
        viewParam === "finals" ||
        viewParam === "edited")
    ) {
      setPhotoTab("edited");
      return;
    }
    if (
      tabParam === "all" ||
      tabParam === "originals" ||
      tabParam === "raw" ||
      viewParam === "raw" ||
      viewParam === "originals" ||
      viewParam === "all"
    ) {
      setPhotoTab("all");
      return;
    }

    if (showFinals && gallery.finals.length > 0) {
      setPhotoTab("edited");
    } else {
      setPhotoTab("all");
    }
  }, [gallery, loadState]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    setGallery(null);
    setAssets([]);

    getShareGallery(token)
      .then((g) => {
        if (cancelled) return;
        setGallery(g);
        setAssets(toDemoAssets(g.assets));
        setLoadState("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof ShareGalleryError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not load gallery.";
        setLoadError(msg);
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const editingLocked = useMemo(() => {
    if (!gallery) return true;
    return !gallery.canEditSelections || gallery.selectionLocked;
  }, [gallery]);

  const showFinalsTab = gallery ? gallery.finalDelivery !== false : true;

  const selectedCount = assets.filter((a) => a.selection === "SELECTED").length;
  const editedCount = gallery?.finals.length ?? 0;
  const uploadsCount = gallery?.counts?.uploads ?? assets.length;

  const selectedAssets = useMemo(
    () => assets.filter((a) => a.selection === "SELECTED"),
    [assets],
  );

  const visibleAssets = useMemo(() => {
    if (photoTab === "selected") return assets.filter((a) => a.selection === "SELECTED");
    if (photoTab === "edited") return [];
    return assets;
  }, [assets, photoTab]);

  const downloadableFinals = useMemo(
    () => (gallery ? gallery.finals.filter((f) => !f.locked) : []),
    [gallery],
  );

  /** One place for coarse-pointer final Save / Share wording (Share sheet vs in‑app browsers). */
  const touchMobileFinalSaveUx = useMemo(() => {
    if (!preferInlineFinalSave) return null;

    let explainer:
      | { variant: "in_app"; heading: string; body: string }
      | { variant: "one_line"; text: string }
      | null = null;

    if (shareHints.inAppSocialWebView) {
      explainer = {
        variant: "in_app",
        heading: "For Save to Photos, use Safari or Chrome",
        body: "Browsers opened from chat apps usually block downloads. Use Open in Safari (or Browser / Chrome) in the ⋯ or share menu above, open this gallery there, then tap Save / Share. You can copy the link below anytime.",
      };
    } else if (!shareHints.likelyWebShareImage) {
      explainer = {
        variant: "one_line",
        text: "Tap Save / Share. We’ll use Share when your browser supports it, or open a preview you can touch and hold to Save Image.",
      };
    }

    const saveButtonTitle = shareHints.inAppSocialWebView
      ? "Prefer opening this gallery in Safari or Chrome. This opens Share when available, otherwise a saver you can touch and hold."
      : shareHints.likelyWebShareImage
        ? "Opens the Share sheet so you choose Photos, Files, or another destination when your browser supports it."
        : "Opens Share where supported, otherwise a preview you touch and hold to save.";

    return { explainer, saveButtonTitle };
  }, [preferInlineFinalSave, shareHints.inAppSocialWebView, shareHints.likelyWebShareImage]);

  /** Photos to navigate in the lightbox (matches current tab’s upload list). */
  const lightboxNavAssets = visibleAssets;

  useEffect(() => {
    if (
      lightboxId &&
      !lightboxNavAssets.some((a) => a.id === lightboxId)
    ) {
      setLightboxId(null);
    }
  }, [lightboxId, lightboxNavAssets]);

  const openLb = useCallback((id: string) => {
    setFinalLightboxId(null);
    setCoverLightboxOpen(false);
    setLightboxId(id);
    setZoom(1);
  }, []);

  const openFinalLb = useCallback((id: string) => {
    setLightboxId(null);
    setCoverLightboxOpen(false);
    setFinalLightboxId(id);
    setZoom(1);
  }, []);

  const openCoverLb = useCallback(() => {
    setLightboxId(null);
    setFinalLightboxId(null);
    setCoverLightboxOpen(true);
    setZoom(1);
  }, []);

  const closeAllPreviews = useCallback(() => {
    setLightboxId(null);
    setFinalLightboxId(null);
    setCoverLightboxOpen(false);
    setZoom(1);
  }, []);

  const closePhotoSaveAssist = useCallback(() => {
    const url = photoSaveBlobUrlRef.current;
    photoSaveBlobUrlRef.current = null;
    if (url) URL.revokeObjectURL(url);
    setPhotoSaveAssist(null);
  }, []);

  const copyGalleryPageUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Gallery link copied. Paste it into Safari or Chrome, then tap Save / Share again.", "success");
    } catch {
      showToast("Could not copy automatically. Copy the website address manually and open it in Safari or Chrome.", "error");
    }
  }, [showToast]);

  const handleDeliverFinalPhotoMobile = useCallback(
    async (f: ShareGalleryFinal) => {
      if (downloadAllFinalsBusy || finalDeliverLock.current) return;
      finalDeliverLock.current = true;
      const id = f.id;
      setFinalSaveBusyId(id);
      try {
        const blob = await fetchShareFinalDownloadBlob(token, f);
        const viaShare = await tryNavigatorShareFinalPhoto(blob, f.name || `final-${f.id}`);
        if (viaShare) return;

        const url = URL.createObjectURL(blob);
        if (photoSaveBlobUrlRef.current) URL.revokeObjectURL(photoSaveBlobUrlRef.current);
        photoSaveBlobUrlRef.current = url;
        setPhotoSaveAssist({
          objectUrl: url,
          label: (f.name || "Photo").replace(/[^\w\s.-]/g, "").trim() || "Photo",
          suggestOpenExternally: shareHints.inAppSocialWebView,
        });
      } catch (e) {
        const msg =
          e instanceof ShareGalleryError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load this photo.";
        showToast(msg, "error");
      } finally {
        finalDeliverLock.current = false;
        setFinalSaveBusyId((cur) => (cur === id ? null : cur));
      }
    },
    [token, showToast, downloadAllFinalsBusy, shareHints.inAppSocialWebView],
  );

  useEffect(() => {
    return () => {
      const orphan = photoSaveBlobUrlRef.current;
      photoSaveBlobUrlRef.current = null;
      if (orphan) URL.revokeObjectURL(orphan);
    };
  }, []);

  useEffect(() => {
    if (!photoSaveAssist) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePhotoSaveAssist();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoSaveAssist, closePhotoSaveAssist]);

  async function refetchGallery() {
    const g = await getShareGallery(token);
    setGallery(g);
    setAssets(toDemoAssets(g.assets));
    return g;
  }

  async function handleDownloadAllFinals() {
    if (!gallery || downloadableFinals.length === 0 || downloadAllFinalsBusy) return;
    setDownloadAllFinalsBusy(true);
    try {
      await downloadShareFinalsZip(
        token,
        downloadableFinals.map((f) => ({ id: f.id, name: f.name })),
      );
      showToast("Download started.", "success");
    } catch (e) {
      showToast(
        e instanceof ShareGalleryError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not download all files.",
        "error",
      );
    } finally {
      setDownloadAllFinalsBusy(false);
    }
  }

  async function toggleSelect(id: string) {
    if (editingLocked || syncBusy) return;
    const nextAssets: DemoAsset[] = assets.map((a) =>
      a.id === id
        ? {
            ...a,
            selection:
              (a.selection === "SELECTED" ? "UNSELECTED" : "SELECTED") as SelectionState,
          }
        : a,
    );
    const selectedIds = nextAssets.filter((a) => a.selection === "SELECTED").map((a) => a.id);
    setAssets(nextAssets);
    setSyncBusy(true);
    try {
      await syncShareGallerySelections(token, selectedIds);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update selection.", "error");
      try {
        await refetchGallery();
      } catch {
        /* ignore */
      }
    } finally {
      setSyncBusy(false);
    }
  }

  async function submitSelections() {
    const isUpdate = Boolean(gallery?.selectionSubmitted);
    setSyncBusy(true);
    try {
      await submitShareGallerySelectionsToPhotographer(token);
      await refetchGallery();
      setConfirmOpen(false);
      showToast(
        isUpdate ? "Updated selection sent to your photographer." : "Selections submitted.",
        "success",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not submit.", "error");
    } finally {
      setSyncBusy(false);
    }
  }

  const lbAsset =
    lightboxId ? assets.find((a) => a.id === lightboxId) ?? null : null;
  const lbNavIndex = lbAsset
    ? lightboxNavAssets.findIndex((a) => a.id === lbAsset.id)
    : -1;

  const finalLb =
    gallery && finalLightboxId
      ? gallery.finals.find((f) => f.id === finalLightboxId) ?? null
      : null;
  const finalLbIndex =
    finalLb && gallery ? gallery.finals.findIndex((f) => f.id === finalLb.id) : -1;

  useEffect(() => {
    if (photoTab !== "edited") setFinalLightboxId(null);
  }, [photoTab]);

  useEffect(() => {
    if (
      finalLightboxId &&
      gallery &&
      !gallery.finals.some((f) => f.id === finalLightboxId)
    ) {
      setFinalLightboxId(null);
    }
  }, [finalLightboxId, gallery]);

  useEffect(() => {
    if (!lightboxId && !finalLightboxId && !coverLightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAllPreviews();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select") ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (coverLightboxOpen) return;

        if (finalLightboxId && gallery && gallery.finals.length > 0) {
          if (e.key === "ArrowLeft" && finalLbIndex > 0) {
            e.preventDefault();
            const prev = gallery.finals[finalLbIndex - 1];
            if (prev) {
              setFinalLightboxId(prev.id);
              setZoom(1);
            }
          } else if (
            e.key === "ArrowRight" &&
            finalLbIndex >= 0 &&
            finalLbIndex < gallery.finals.length - 1
          ) {
            e.preventDefault();
            const next = gallery.finals[finalLbIndex + 1];
            if (next) {
              setFinalLightboxId(next.id);
              setZoom(1);
            }
          }
          return;
        }

        if (lightboxId && lbAsset && lightboxNavAssets.length > 0) {
          if (e.key === "ArrowLeft" && lbNavIndex > 0) {
            e.preventDefault();
            const prev = lightboxNavAssets[lbNavIndex - 1];
            if (prev) {
              setLightboxId(prev.id);
              setZoom(1);
            }
          } else if (
            e.key === "ArrowRight" &&
            lbNavIndex >= 0 &&
            lbNavIndex < lightboxNavAssets.length - 1
          ) {
            e.preventDefault();
            const next = lightboxNavAssets[lbNavIndex + 1];
            if (next) {
              setLightboxId(next.id);
              setZoom(1);
            }
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    lightboxId,
    finalLightboxId,
    coverLightboxOpen,
    closeAllPreviews,
    gallery,
    finalLbIndex,
    lbAsset,
    lbNavIndex,
    lightboxNavAssets,
  ]);

  const displayTitle = gallery?.eventName?.trim() || "Select your favorites";

  const eventDateLabel = useMemo(() => {
    if (!gallery?.eventDate) return null;
    const d = new Date(gallery.eventDate);
    return Number.isNaN(d.getTime())
      ? gallery.eventDate
      : d.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  }, [gallery?.eventDate]);

  if (loadState === "loading") {
    return (
      <>
        <span className="sr-only">Loading gallery…</span>
        <ClientGalleryPageSkeleton />
      </>
    );
  }

  if (loadState === "error" || !gallery) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-16 text-center dark:bg-black">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {loadError ?? "Gallery could not be loaded."}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadState("loading");
            setLoadError(null);
            getShareGallery(token)
              .then((g) => {
                setGallery(g);
                setAssets(toDemoAssets(g.assets));
                setLoadState("ok");
              })
              .catch((err) => {
                const msg =
                  err instanceof ShareGalleryError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : "Could not load gallery.";
                setLoadError(msg);
                setLoadState("error");
              });
          }}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
        gallery?.rightsProtection &&
          "select-none [-webkit-touch-callout:none] [user-select:none]",
      )}
    >
      <header className="relative">
        {gallery.coverImageUrl ? (
          <section
            className="relative isolate flex min-h-[100svh] min-h-[100dvh] w-full flex-col"
            aria-label="Gallery cover"
          >
            <Image
              src={gallery.coverImageUrl}
              alt={displayTitle ? `Cover — ${displayTitle}` : "Gallery cover"}
              fill
              priority
              fetchPriority="high"
              sizes="100vw"
              quality={SHARE_LIGHTBOX_IMAGE_QUALITY}
              className="absolute inset-0 object-cover"
              style={folderCoverObjectPositionStyle({
                _id: gallery.folderId ?? "",
                client: "",
                eventDate: "",
                description: "",
                coverFocalX: gallery.coverFocalX,
                coverFocalY: gallery.coverFocalY,
              } as ApiFolder)}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/55"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => openCoverLb()}
              className="absolute inset-0 z-[5] cursor-zoom-in bg-transparent p-0"
              aria-label="View cover image full screen"
            />

            <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4 sm:top-8">
              <Image
                src="/images/gido_logo.png"
                alt="Gido logo"
                width={140}
                height={44}
                className="h-7 w-auto object-contain brightness-0 invert opacity-85 drop-shadow-[0_1px_5px_rgba(0,0,0,0.35)] sm:h-9"
                priority
              />
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-[1920px] flex-1 flex-col items-center justify-end px-4 pb-16 pt-20 text-center sm:px-5 sm:pb-20">
              <div className="flex w-full max-w-3xl flex-col items-center gap-4">
                <h1 className="text-balance font-serif text-3xl font-medium uppercase leading-tight tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] sm:text-5xl">
                  {displayTitle}
                </h1>
                {gallery.selectionLocked ? (
                  <p className="rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">
                    Selections are temporarily locked by your photographer.
                  </p>
                ) : null}
                <a
                  href="#client-gallery-body"
                  className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/90 drop-shadow-[0_1px_5px_rgba(0,0,0,0.45)] transition hover:text-white"
                >
                  <span className="h-2 w-2 rotate-45 border-b border-r border-current" aria-hidden />
                  View Gallery
                </a>
              </div>
            </div>
          </section>
        ) : (
          <div className="relative overflow-hidden border-b border-zinc-200/90 bg-gradient-to-br from-indigo-50 via-white to-zinc-50 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-950 dark:to-black">
            <div className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-40" aria-hidden>
              <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-brand/25 blur-3xl dark:bg-brand/30" />
              <div className="absolute -right-20 top-8 h-56 w-56 rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-600/20" />
              <div className="absolute bottom-0 left-1/3 h-40 w-96 -translate-x-1/2 rounded-full bg-fuchsia-200/30 blur-3xl dark:bg-fuchsia-900/20" />
            </div>

            <div className="relative mx-auto flex max-w-[1920px] flex-col gap-3 px-4 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pb-2">
              <div className="flex items-center gap-3">
                <Image
                  src="/images/gido_logo.png"
                  alt="Gido logo"
                  width={140}
                  height={44}
                  className="h-8 w-auto object-contain drop-shadow-sm sm:h-9"
                  priority
                />
              </div>
              {!editingLocked && photoTab !== "edited" ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                  <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100">
                    <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
                    <span className="tabular-nums">{selectedCount}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">selected</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {syncBusy ? <InlineStatusSkeleton size={20} /> : null}
                    <button
                      type="button"
                      disabled={selectedCount === 0 || syncBusy}
                      onClick={() => setConfirmOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-hover disabled:opacity-40 sm:w-auto dark:hover:bg-brand-hover"
                    >
                      <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {gallery.selectionSubmitted ? "Submit again" : "Submit Selection"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative mx-auto max-w-[1920px] px-4 pb-2 sm:px-5">
              <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
                {displayTitle}
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs leading-snug text-zinc-600 sm:text-sm dark:text-zinc-400">
                <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Originals</strong> are from your
                shoot; <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Finals</strong> are edited
                files your photographer delivers. Tabs below switch between them.
              </p>
            </div>

            <div className="relative mx-auto max-w-[1920px] px-4 pb-6 pt-3 sm:px-5 lg:pb-8">
              <div className="rounded-2xl border border-zinc-200/90 bg-white/95 p-4 shadow-lg shadow-zinc-900/[0.04] ring-1 ring-zinc-900/[0.02] dark:border-zinc-700/90 dark:bg-zinc-900/95 dark:ring-white/[0.03] sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-indigo-700 text-xs font-bold text-white shadow-md dark:to-violet-900 sm:h-10 sm:w-10 sm:text-sm"
                      aria-hidden
                    >
                      {clientInitials(gallery.clientName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Prepared for
                      </p>
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {gallery.clientName}
                      </p>
                    </div>
                  </div>

                  {eventDateLabel ? (
                    <>
                      <div className="hidden h-7 w-px shrink-0 bg-zinc-200 dark:bg-zinc-600 sm:block" aria-hidden />
                      <div className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
                        <CalendarDays className="h-4 w-4 shrink-0 text-brand dark:text-brand-on-dark" aria-hidden />
                        <span className="font-medium tabular-nums">{eventDateLabel}</span>
                      </div>
                    </>
                  ) : null}
                </div>

                {gallery.description ? (
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-xs leading-snug text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    {gallery.description}
                  </p>
                ) : null}
                {gallery.selectionLocked ? (
                  <p className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-100">
                    Selections are temporarily locked by your photographer.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div
          id="client-gallery-body"
          className="scroll-mt-4 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
        >
          <div className="mx-auto max-w-[1920px] px-3 py-3 sm:px-5">
            <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full gap-1 rounded-xl bg-zinc-100/80 p-1 dark:bg-zinc-900 sm:w-auto">
                {(
                  [
                    ["all", "Originals"],
                    ["selected", "Selected"],
                    ...(showFinalsTab ? ([["edited", "Finals"]] as const) : []),
                  ] as const
                ).map(([key, label]) => {
                  const count =
                    key === "all"
                      ? uploadsCount
                      : key === "selected"
                        ? selectedCount
                        : editedCount;
                  const active = photoTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPhotoTab(key)}
                      className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition sm:min-h-[38px] sm:flex-none sm:justify-start sm:gap-2 sm:px-3.5 sm:text-sm ${
                        active
                          ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700"
                          : "text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-white"
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          active
                            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                            : "bg-white text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className="grid w-full grid-cols-5 gap-1 rounded-xl bg-zinc-100/80 p-1 dark:bg-zinc-900 sm:w-auto sm:auto-cols-max sm:grid-flow-col sm:grid-cols-none"
                role="toolbar"
                aria-label="Gallery grid layout"
              >
                {GRID_LAYOUTS.map(({ id, shortLabel, icon: Icon }) => {
                  const active = gridLayout === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setGridLayout(id)}
                      title={GRID_LAYOUTS.find((g) => g.id === id)?.label}
                      aria-pressed={active}
                      className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-1.5 py-1.5 text-[10px] font-medium transition sm:min-h-[38px] sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs ${
                        active
                          ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700"
                          : "text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-white"
                      }`}
                    >
                      <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5">
                        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
                        <span className="leading-none">{shortLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {photoTab === "all" && selectedAssets.length > 0 ? (
        <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-[1920px] px-3 py-4 sm:px-5">
            <section className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3 shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Your selection
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {selectedAssets.length} photo{selectedAssets.length === 1 ? "" : "s"} selected
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoTab("selected")}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-brand/40 hover:text-brand dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-brand-on-dark"
                >
                  Review selected
                </button>
              </div>
              <ul
                className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
                aria-label="Selected media"
              >
                {selectedAssets.map((a) => {
                  const showVideo = isDemoAssetVideo(a);
                  return (
                    <li
                      key={a.id}
                      className="group relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl border border-brand/50 bg-white shadow-sm ring-1 ring-brand/10 dark:bg-zinc-950 sm:w-24 md:w-28"
                    >
                      <button
                        type="button"
                        className="relative block h-full w-full"
                        onClick={() => openLb(a.id)}
                      >
                        {showVideo ? (
                          <video
                            src={a.previewUrl ?? a.thumbUrl}
                            muted
                            playsInline
                            preload="metadata"
                            aria-label={a.originalName}
                            className="absolute inset-0 h-full w-full bg-black object-cover transition group-hover:brightness-95"
                          />
                        ) : (
                          <Image
                            src={a.thumbUrl}
                            alt=""
                            fill
                            sizes={SELECTED_STRIP_IMAGE_SIZES}
                            quality={SHARE_GRID_IMAGE_QUALITY}
                            className="object-cover transition group-hover:brightness-95"
                          />
                        )}
                        {showVideo ? <VideoTileOverlay /> : null}
                        <span className="sr-only">Open {a.originalName}</span>
                      </button>
                      {!editingLocked ? (
                        <button
                          type="button"
                          disabled={syncBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleSelect(a.id);
                          }}
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-40"
                          aria-label={`Remove ${a.originalName} from selection`}
                        >
                          <span className="text-xs font-bold leading-none">×</span>
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {gallery.selectionSubmitted && !editingLocked && photoTab !== "edited" ? (
        <div className="mx-auto max-w-[1920px] px-3 py-3 sm:px-5">
          <p className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            <span className="font-semibold">Selection submitted.</span> You can still update your picks and submit again.
          </p>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1920px] bg-white px-4 py-8 pb-12 sm:px-5 dark:bg-zinc-950">
        {gallery.coverImageUrl && !editingLocked && photoTab !== "edited" ? (
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <span className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
              <span className="tabular-nums">{selectedCount}</span>
              <span className="text-zinc-500 dark:text-zinc-400">selected</span>
            </span>
            <div className="flex items-center gap-2 sm:justify-end">
              {syncBusy ? <InlineStatusSkeleton size={20} /> : null}
              <button
                type="button"
                disabled={selectedCount === 0 || syncBusy}
                onClick={() => setConfirmOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-hover disabled:opacity-40 sm:w-auto dark:hover:bg-brand-hover"
              >
                <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
                {gallery.selectionSubmitted ? "Submit again" : "Submit Selection"}
              </button>
            </div>
          </div>
        ) : null}
        {photoTab === "edited" ? (
          gallery.finals.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Edited photos will appear here when your photographer delivers them.
            </p>
          ) : (
            <>
              {preferInlineFinalSave && downloadableFinals.length > 0 && touchMobileFinalSaveUx?.explainer ? (
                touchMobileFinalSaveUx.explainer.variant === "in_app" ? (
                  <div className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/35">
                    <div>
                      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                        {touchMobileFinalSaveUx.explainer.heading}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-amber-900/95 dark:text-amber-100/95">
                        {touchMobileFinalSaveUx.explainer.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyGalleryPageUrl()}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-300/90 bg-white px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-50"
                    >
                      <Copy className="h-4 w-4 shrink-0" aria-hidden />
                      Copy gallery link
                    </button>
                  </div>
                ) : (
                  <p className="mb-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {touchMobileFinalSaveUx.explainer.text}
                  </p>
                )
              ) : null}
              {downloadableFinals.length > 0 ? (
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    disabled={downloadAllFinalsBusy}
                    onClick={() => void handleDownloadAllFinals()}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {downloadAllFinalsBusy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {downloadAllFinalsBusy ? "Preparing zip…" : "Download all"}
                  </button>
                </div>
              ) : null}
              <ul className={galleryListClass(gridLayout)}>
              {gallery.finals.map((f, index) => {
                const locked = Boolean(f.locked);
                const imgSrc = finalDisplaySrc(f, token);
                const showUnlockedVideo = !locked && isShareFinalVideo(f);
                return (
                  <li key={f.id} className={`flex flex-col ${editedCardClass(gridLayout, index)}`}>
                    <div className={uploadImageWrapClass(gridLayout, index)}>
                      <button
                        type="button"
                        onClick={() => openFinalLb(f.id)}
                        className="absolute inset-0 block h-full w-full border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-brand-on-dark"
                      >
                        {showUnlockedVideo ? (
                          <video
                            src={f.url}
                            {...(f.lockedPreviewUrl ? { poster: f.lockedPreviewUrl } : {})}
                            muted
                            playsInline
                            preload="metadata"
                            aria-label={f.name}
                            className="absolute inset-0 h-full w-full cursor-zoom-in bg-black object-cover pointer-events-none"
                          />
                        ) : (
                          <Image
                            src={imgSrc}
                            alt={f.name}
                            fill
                            sizes={shareGalleryGridSizes(gridLayout, index)}
                            quality={SHARE_GRID_IMAGE_QUALITY}
                            priority={index < 10}
                            draggable={!locked}
                            className={cn(
                              "cursor-zoom-in object-cover",
                              locked && "select-none",
                            )}
                            onContextMenu={(e) => {
                              if (locked) e.preventDefault();
                            }}
                          />
                        )}
                        {showUnlockedVideo ? <VideoTileOverlay /> : null}
                      </button>
                      {locked ? (
                        <div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent"
                          aria-hidden
                        />
                      ) : null}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end bg-gradient-to-t from-black/55 via-black/20 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <div className="pointer-events-auto flex items-center gap-1.5">
                          {locked ? (
                            <span
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/45 bg-black/35 text-white shadow-sm backdrop-blur-md"
                              title="Locked"
                            >
                              <Lock className="h-4 w-4" aria-hidden />
                            </span>
                          ) : preferInlineFinalSave ? (
                            <button
                              type="button"
                              title={touchMobileFinalSaveUx?.saveButtonTitle ?? "Save or share photo"}
                              aria-label={touchMobileFinalSaveUx?.saveButtonTitle ?? "Save or share photo"}
                              disabled={finalSaveBusyId !== null}
                              aria-busy={finalSaveBusyId === f.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeliverFinalPhotoMobile(f);
                              }}
                              className={tileActionClass()}
                            >
                              {finalSaveBusyId === f.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Download className="h-4 w-4" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <a
                              href={getShareFinalDownloadUrl(token, f.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Download ${f.name}`}
                              className={tileActionClass()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-4 w-4" aria-hidden />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )
        ) : visibleAssets.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            {photoTab === "selected"
              ? "You have not selected any items yet."
              : "No media in this gallery yet."}
          </p>
        ) : (
          <ul className={galleryListClass(gridLayout)}>
            {visibleAssets.map((a, index) => {
              const showVideo = isDemoAssetVideo(a);
              return (
              <li
                key={a.id}
                className={uploadItemClass(gridLayout, index, a.selection === "SELECTED")}
              >
                <div className={uploadImageWrapClass(gridLayout, index)}>
                  <button
                    type="button"
                    className="absolute inset-0 block h-full w-full text-left"
                    onClick={() => openLb(a.id)}
                  >
                    {showVideo ? (
                      <video
                        src={a.previewUrl ?? a.thumbUrl}
                        muted
                        playsInline
                        preload="metadata"
                        aria-label={a.originalName}
                        className="absolute inset-0 h-full w-full bg-black object-cover transition group-hover:brightness-[0.97]"
                      />
                    ) : (
                      <Image
                        src={a.thumbUrl}
                        alt={a.originalName}
                        fill
                        sizes={shareGalleryGridSizes(gridLayout, index)}
                        quality={SHARE_GRID_IMAGE_QUALITY}
                        priority={index < 10}
                        className="object-cover transition group-hover:brightness-[0.97]"
                      />
                    )}
                    {showVideo ? <VideoTileOverlay /> : null}
                  </button>

                  <div
                    className={cn(
                      "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end bg-gradient-to-t from-black/55 via-black/20 to-transparent p-2 transition group-focus-within:opacity-100 group-hover:opacity-100",
                      a.selection === "SELECTED" ? "opacity-100" : "opacity-100 sm:opacity-0",
                    )}
                  >
                    <div className="pointer-events-auto flex items-center gap-1.5">
                      {!editingLocked ? (
                        <button
                          type="button"
                          disabled={syncBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleSelect(a.id);
                          }}
                          className={tileActionClass(a.selection === "SELECTED")}
                          aria-label={a.selection === "SELECTED" ? "Unselect photo" : "Select photo"}
                          title={a.selection === "SELECTED" ? "Unselect" : "Select"}
                        >
                          <Heart className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
            })}
          </ul>
        )}
      </main>

      {lightboxId && lbAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => closeAllPreviews()}
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
                onClick={() => closeAllPreviews()}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              {isDemoAssetVideo(lbAsset) ? (
                <video
                  src={lbAsset.previewUrl ?? lbAsset.thumbUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={lbAsset.originalName}
                  className={cn(
                    "max-h-[75vh] max-w-full bg-black object-contain transition-transform duration-200",
                    gallery.rightsProtection && "select-none",
                  )}
                  style={{ transform: `scale(${zoom})` }}
                  onContextMenu={(e) => {
                    if (gallery.rightsProtection) e.preventDefault();
                  }}
                />
              ) : (
                <Image
                  src={lbAsset.previewUrl ?? lbAsset.thumbUrl}
                  alt={lbAsset.originalName}
                  width={1920}
                  height={1920}
                  sizes={SHARE_LIGHTBOX_SIZES}
                  quality={SHARE_LIGHTBOX_IMAGE_QUALITY}
                  className={cn(
                    "h-auto max-h-[75vh] w-auto max-w-full object-contain transition-transform duration-200",
                    gallery.rightsProtection && "select-none",
                  )}
                  style={{ transform: `scale(${zoom})` }}
                  onContextMenu={(e) => {
                    if (gallery.rightsProtection) e.preventDefault();
                  }}
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-4 text-white">
              <button
                type="button"
                disabled={lbNavIndex <= 0}
                onClick={() => {
                  const prev = lightboxNavAssets[lbNavIndex - 1];
                  if (prev) {
                    setLightboxId(prev.id);
                    setZoom(1);
                  }
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={editingLocked || syncBusy}
                onClick={() => void toggleSelect(lbAsset.id)}
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
                disabled={lbNavIndex < 0 || lbNavIndex >= lightboxNavAssets.length - 1}
                onClick={() => {
                  const next = lightboxNavAssets[lbNavIndex + 1];
                  if (next) {
                    setLightboxId(next.id);
                    setZoom(1);
                  }
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {finalLb ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview — ${finalLb.name}`}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => closeAllPreviews()}
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
                onClick={() => closeAllPreviews()}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              {!finalLb.locked && isShareFinalVideo(finalLb) ? (
                <video
                  src={finalLb.url}
                  {...(finalLb.lockedPreviewUrl ? { poster: finalLb.lockedPreviewUrl } : {})}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={finalLb.name}
                  className={cn(
                    "max-h-[75vh] max-w-full object-contain transition-transform duration-200",
                    gallery.rightsProtection && "select-none",
                  )}
                  style={{ transform: `scale(${zoom})` }}
                  onContextMenu={(e) => {
                    if (gallery.rightsProtection) e.preventDefault();
                  }}
                />
              ) : (
                <Image
                  src={finalDisplaySrc(finalLb, token)}
                  alt={finalLb.name}
                  width={1920}
                  height={1920}
                  sizes={SHARE_LIGHTBOX_SIZES}
                  quality={SHARE_LIGHTBOX_IMAGE_QUALITY}
                  className={cn(
                    "h-auto max-h-[75vh] w-auto max-w-full object-contain transition-transform duration-200",
                    gallery.rightsProtection && "select-none",
                    finalLb.locked && "select-none",
                  )}
                  style={{ transform: `scale(${zoom})` }}
                  draggable={!finalLb.locked}
                  onContextMenu={(e) => {
                    if (finalLb.locked || gallery.rightsProtection) e.preventDefault();
                  }}
                />
              )}
            </div>
            <div className="flex flex-col gap-3 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <button
                type="button"
                disabled={finalLbIndex <= 0}
                onClick={() => {
                  const prev = gallery.finals[finalLbIndex - 1];
                  if (prev) {
                    setFinalLightboxId(prev.id);
                    setZoom(1);
                  }
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Previous
              </button>
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-1 text-center">
                <span className="max-w-full truncate text-xs font-medium">{finalLb.name}</span>
                {finalLb.locked ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-200">
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Preview only until paid
                  </span>
                ) : preferInlineFinalSave ? (
                  <button
                    type="button"
                    title={touchMobileFinalSaveUx?.saveButtonTitle}
                    aria-label={
                      touchMobileFinalSaveUx?.saveButtonTitle ?? "Save or share photo to your device"
                    }
                    disabled={finalSaveBusyId !== null}
                    aria-busy={finalSaveBusyId === finalLb.id}
                    onClick={() => void handleDeliverFinalPhotoMobile(finalLb)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 enabled:hover:bg-white/90 disabled:opacity-50"
                  >
                    {finalSaveBusyId === finalLb.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    Save / Share
                  </button>
                ) : (
                  <a
                    href={getShareFinalDownloadUrl(token, finalLb.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Download
                  </a>
                )}
              </div>
              <button
                type="button"
                disabled={finalLbIndex < 0 || finalLbIndex >= gallery.finals.length - 1}
                onClick={() => {
                  const next = gallery.finals[finalLbIndex + 1];
                  if (next) {
                    setFinalLightboxId(next.id);
                    setZoom(1);
                  }
                }}
                className="rounded-full border border-white/30 px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {coverLightboxOpen && gallery.coverImageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cover preview"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => closeAllPreviews()}
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
                onClick={() => closeAllPreviews()}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto">
              <Image
                src={gallery.coverImageUrl}
                alt={displayTitle ? `Cover — ${displayTitle}` : "Gallery cover"}
                width={1920}
                height={1920}
                sizes={SHARE_LIGHTBOX_SIZES}
                quality={SHARE_LIGHTBOX_IMAGE_QUALITY}
                className={cn(
                  "h-auto max-h-[75vh] w-auto max-w-full object-contain object-center transition-transform duration-200",
                  gallery.rightsProtection && "select-none",
                )}
                style={{
                  transform: `scale(${zoom})`,
                  ...folderCoverObjectPositionStyle({
                    _id: gallery.folderId ?? "",
                    client: "",
                    eventDate: "",
                    description: "",
                    coverFocalX: gallery.coverFocalX,
                    coverFocalY: gallery.coverFocalY,
                  } as ApiFolder),
                }}
                onContextMenu={(e) => {
                  if (gallery.rightsProtection) e.preventDefault();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {musicAllowed ? (
        <>
          <audio
            ref={audioRef}
            key={galleryMusicUrl}
            src={galleryMusicUrl}
            autoPlay
            loop
            playsInline
            preload="auto"
            className="sr-only"
            aria-hidden
          />
          {galleryMusicStarted || galleryMusicMuted ? (
            <div className="fixed bottom-4 right-4 z-[52] sm:bottom-6 sm:right-6">
              <button
                type="button"
                onClick={() => {
                  const next = !galleryMusicMuted;
                  setGalleryMusicMuted(next);
                  try {
                    if (next) {
                      sessionStorage.setItem(`${GALLERY_MUSIC_MUTE_PREFIX}${token}`, "1");
                    } else {
                      sessionStorage.removeItem(`${GALLERY_MUSIC_MUTE_PREFIX}${token}`);
                      void audioRef.current?.play().then(() => {
                        setGalleryMusicStarted(true);
                      }).catch(() => {});
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/90 bg-white/95 text-zinc-900 shadow-lg backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-50"
                aria-label={galleryMusicMuted ? "Unmute gallery music" : "Mute gallery music"}
              >
                {galleryMusicMuted ? (
                  <VolumeX className="h-5 w-5" aria-hidden />
                ) : (
                  <Volume2 className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
          ) : null}
        </>
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
              {gallery.selectionSubmitted ? "Submit updated selection?" : "Submit your selection?"}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {gallery.selectionSubmitted
                ? `You have ${selectedCount} image${selectedCount === 1 ? "" : "s"} selected. This sends your latest picks to your photographer.`
                : `You chose ${selectedCount} image${selectedCount === 1 ? "" : "s"}. This sends your picks to your photographer.`}
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
                disabled={syncBusy}
                onClick={() => void submitSelections()}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {photoSaveAssist ? (
        <div
          className="fixed inset-0 z-[72] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label={`Save photo: ${photoSaveAssist.label}`}
        >
          <div className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-zinc-950/95 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 pt-2 text-sm font-medium leading-snug text-white">
                Save to your device
              </p>
              <button
                type="button"
                onClick={() => closePhotoSaveAssist()}
                className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm"
              >
                Done
              </button>
            </div>
            <p className="text-xs leading-relaxed text-zinc-300">
              Touch and hold the image below. Choose Save Image or Save to Photos (iPhone) or Share / Save image
              (Android).
            </p>
            {photoSaveAssist.suggestOpenExternally ? (
              <>
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Easiest Save to Photos: copy the gallery link, open Safari or Chrome, paste the URL, tap Save /
                  Share there.
                </p>
                <button
                  type="button"
                  onClick={() => void copyGalleryPageUrl()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white"
                >
                  <Copy className="h-4 w-4 shrink-0" aria-hidden />
                  Copy gallery link
                </button>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-400">
                Prefer the Share menu? Close this preview and tap Save / Share once more when your browser offers it.
              </p>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSaveAssist.objectUrl}
              alt={photoSaveAssist.label}
              draggable={false}
              className="max-h-full max-w-full touch-manipulation select-auto object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}