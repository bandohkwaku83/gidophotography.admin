"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { DemoAsset, SelectionState } from "@/lib/demo-data";
import {
  getShareFinalDownloadUrl,
  getShareGallery,
  type NormalizedShareGallery,
  ShareGalleryError,
  submitShareGallerySelectionsToPhotographer,
  syncShareGallerySelections,
  type ShareGalleryAsset,
} from "@/lib/share-gallery-api";
import { useToast } from "@/components/toast-provider";
import {
  CalendarDays,
  Check,
  Columns3,
  Download,
  Focus,
  GalleryHorizontal,
  Heart,
  LayoutGrid,
  PanelsTopLeft,
  Send,
} from "lucide-react";
import { ClientGalleryPageSkeleton, InlineStatusSkeleton } from "@/components/ui/skeletons";

const GRID_STORAGE_PREFIX = "gidostorage-share-grid:";

type GridLayout = "uniform" | "masonry" | "block" | "filmstrip" | "spotlight";

const GRID_LAYOUTS: {
  id: GridLayout;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof LayoutGrid;
}[] = [
  {
    id: "spotlight",
    label: "Spotlight",
    shortLabel: "Hero",
    description: "Feature the first image prominently",
    icon: Focus,
  },
  {
    id: "uniform",
    label: "Standard grid",
    shortLabel: "Grid",
    description: "Even rows of uniform thumbnails",
    icon: LayoutGrid,
  },
  {
    id: "masonry",
    label: "Masonry",
    shortLabel: "Masonry",
    description: "Flowing columns like a collage",
    icon: Columns3,
  },
  {
    id: "block",
    label: "Block grid",
    shortLabel: "Blocks",
    description: "Larger tiles with generous spacing",
    icon: PanelsTopLeft,
  },
  {
    id: "filmstrip",
    label: "Filmstrip",
    shortLabel: "Strip",
    description: "Swipe horizontally through photos",
    icon: GalleryHorizontal,
  },
];

function isGridLayout(v: string): v is GridLayout {
  return GRID_LAYOUTS.some((x) => x.id === v);
}

function galleryListClass(layout: GridLayout): string {
  switch (layout) {
    case "uniform":
      return "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
    case "masonry":
      return "columns-2 gap-x-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 [column-fill:_balance]";
    case "block":
      return "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8";
    case "filmstrip":
      return "flex flex-row flex-nowrap gap-4 overflow-x-auto pb-3 pt-1 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory px-0.5";
    case "spotlight":
      return "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";
    default:
      return "";
  }
}

function uploadItemClass(layout: GridLayout, index: number, isSelected: boolean): string {
  const ring = isSelected
    ? "border-brand-on-dark ring-2 ring-brand-soft dark:border-brand dark:ring-brand/40"
    : "border-zinc-200 dark:border-zinc-800";
  const base = `group overflow-hidden rounded-xl border bg-white shadow-sm transition dark:bg-zinc-950 ${ring}`;
  if (layout === "spotlight" && index === 0) {
    return `${base} col-span-2 row-span-2 flex flex-col sm:min-h-[min(72vw,400px)]`;
  }
  if (layout === "masonry") {
    return `${base} mb-3 break-inside-avoid`;
  }
  if (layout === "filmstrip") {
    return `${base} w-[min(85vw,22rem)] shrink-0 snap-start sm:w-80`;
  }
  return base;
}

function editedCardClass(layout: GridLayout, index: number): string {
  const base =
    "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
  if (layout === "spotlight" && index === 0) {
    return `${base} col-span-2 row-span-2 flex flex-col sm:min-h-[min(72vw,420px)]`;
  }
  if (layout === "masonry") {
    return `${base} mb-3 break-inside-avoid`;
  }
  if (layout === "filmstrip") {
    return `${base} w-[min(85vw,22rem)] shrink-0 snap-start sm:w-80`;
  }
  return base;
}

function uploadImageWrapClass(layout: GridLayout, index: number): string {
  if (layout === "block") {
    return "relative aspect-[5/6] sm:aspect-square";
  }
  if (layout === "spotlight" && index === 0) {
    return "relative aspect-[5/4] w-full flex-1 sm:aspect-auto sm:min-h-[280px]";
  }
  return "relative aspect-square";
}

function editedImageClass(layout: GridLayout, index: number): string {
  if (layout === "spotlight" && index === 0) {
    return "aspect-[5/4] w-full object-cover sm:aspect-auto sm:min-h-[280px] sm:h-full";
  }
  if (layout === "block") {
    return "aspect-[5/6] w-full object-cover sm:aspect-square";
  }
  return "aspect-square w-full object-cover";
}

function clientInitials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[parts.length - 1]?.[0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function toDemoAssets(shareAssets: ShareGalleryAsset[]): DemoAsset[] {
  return shareAssets.map((a) => ({
    id: a.id,
    originalName: a.originalName,
    selection: a.selection as SelectionState,
    editState: "NONE",
    clientComment: "",
    hasEdited: false,
    thumbUrl: a.thumbUrl,
  }));
}

export function ClientGalleryApp({ token }: { token: string }) {
  const { showToast } = useToast();
  const [gallery, setGallery] = useState<NormalizedShareGallery | null>(null);
  const [assets, setAssets] = useState<DemoAsset[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photoTab, setPhotoTab] = useState<"all" | "selected" | "edited">("all");
  const [zoom, setZoom] = useState(1);
  const [gridLayout, setGridLayout] = useState<GridLayout>("spotlight");

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
    setLightboxId(id);
    setZoom(1);
  }, []);

  async function refetchGallery() {
    const g = await getShareGallery(token);
    setGallery(g);
    setAssets(toDemoAssets(g.assets));
    return g;
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
    <div className="min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="relative">
        {gallery.coverImageUrl ? (
          <section
            className="relative isolate flex min-h-[100svh] min-h-[100dvh] w-full flex-col"
            aria-label="Gallery cover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gallery.coverImageUrl}
              alt={displayTitle ? `Cover — ${displayTitle}` : "Gallery cover"}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: `${gallery.coverFocalX ?? 50}% ${gallery.coverFocalY ?? 50}%`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/[0.88]"
              aria-hidden
            />

            <div className="relative z-10 border-b border-white/15 bg-black/30 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-6xl items-center">
                <Image
                  src="/images/gido_logo.png"
                  alt="Gido logo"
                  width={140}
                  height={44}
                  className="h-8 w-auto object-contain brightness-0 invert drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:h-9"
                  priority
                />
              </div>
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-4 pb-12 pt-6 sm:px-6 sm:pb-16 lg:px-8">
              <div className="ml-auto flex w-full max-w-xl flex-col gap-3 sm:items-end sm:text-right lg:max-w-2xl">
                <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-md sm:text-3xl lg:text-4xl">
                  {displayTitle}
                </h1>
                {gallery.description ? (
                  <p className="text-sm leading-relaxed text-white/85">{gallery.description}</p>
                ) : null}
                {gallery.selectionLocked ? (
                  <p className="rounded-lg border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-left text-xs text-amber-50 sm:text-right">
                    Selections are temporarily locked by your photographer.
                  </p>
                ) : null}
                <a
                  href="#client-gallery-body"
                  className="inline-flex w-fit items-center justify-center rounded-full border border-white/35 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white shadow-md backdrop-blur-sm transition hover:bg-white/25 sm:self-end"
                >
                  View gallery
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

            <div className="relative mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between sm:pb-2 lg:px-8">
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
              {!editingLocked ? (
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

            <div className="relative mx-auto max-w-6xl px-4 pb-2 lg:px-8">
              <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
                {displayTitle}
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs leading-snug text-zinc-600 sm:text-sm dark:text-zinc-400">
                Tap a photo to select it — tabs and layout live below.
              </p>
            </div>

            <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-3 lg:px-8 lg:pb-8">
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
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 lg:px-8">
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {(
                [
                  ["all", "All Photos"],
                  ["selected", "Selected Photos"],
                  ["edited", "Edited Photos"],
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
                    className={`inline-flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "border-brand/40 bg-brand-soft text-brand shadow-sm dark:border-brand/50 dark:bg-brand/20 dark:text-brand-on-dark"
                        : "border-transparent bg-zinc-100/90 text-zinc-600 hover:bg-zinc-200/90 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                        active
                          ? "bg-white/90 text-brand dark:bg-zinc-950/50 dark:text-brand-on-dark"
                          : "bg-white/60 text-zinc-500 dark:bg-zinc-950/40 dark:text-zinc-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Layout
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Pick how the gallery below is arranged — saved for this link on your device.
                </p>
              </div>
              <div
                className="-mx-1 flex max-w-[100vw] gap-1 overflow-x-auto pb-1 pl-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0 sm:pl-0"
                role="toolbar"
                aria-label="Gallery grid layout"
              >
                <div className="flex min-w-0 gap-1 rounded-2xl border border-zinc-200/90 bg-zinc-50/90 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
                  {GRID_LAYOUTS.map(({ id, shortLabel, icon: Icon }) => {
                    const active = gridLayout === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setGridLayout(id)}
                        title={GRID_LAYOUTS.find((g) => g.id === id)?.label}
                        aria-pressed={active}
                        className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition sm:min-h-0 sm:px-3 ${
                          active
                            ? "bg-white text-brand shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-brand-on-dark dark:ring-zinc-700"
                            : "text-zinc-600 hover:bg-white/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
                        <span className="hidden sm:inline">{shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {photoTab === "all" && selectedAssets.length > 0 ? (
        <div className="border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-4 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Your selection
                </p>
                <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">
                  {selectedAssets.length} photo{selectedAssets.length === 1 ? "" : "s"} in your
                  grid — tap a tile to enlarge, or the remove control to unselect.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoTab("selected")}
                className="text-xs font-semibold text-brand hover:underline dark:text-brand-on-dark"
              >
                View only selected
              </button>
            </div>
            <ul
              className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10"
              aria-label="Selected photos"
            >
              {selectedAssets.map((a) => (
                <li
                  key={a.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border-2 border-brand bg-white shadow-sm ring-1 ring-brand/20 dark:bg-zinc-950 dark:ring-brand/30"
                >
                  <button
                    type="button"
                    className="relative block h-full w-full"
                    onClick={() => openLb(a.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:brightness-95"
                    />
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
                      className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-40"
                      aria-label={`Remove ${a.originalName} from selection`}
                    >
                      <span className="text-xs font-bold leading-none">×</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {gallery.selectionSubmitted && !editingLocked ? (
        <div className="mx-auto max-w-3xl px-4 py-3">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            You&apos;ve already submitted your favorites. You can still change your picks anytime
            — tap photos to add or remove selections, then submit again to update your photographer.
          </p>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 pb-12 lg:px-8">
        {gallery.coverImageUrl && !editingLocked ? (
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
            <ul className={galleryListClass(gridLayout)}>
              {gallery.finals.map((f, index) => (
                <li key={f.id} className={`flex flex-col ${editedCardClass(gridLayout, index)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.name}
                    className={editedImageClass(gridLayout, index)}
                  />
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {f.name}
                    </span>
                    <a
                      href={getShareFinalDownloadUrl(token, f.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : visibleAssets.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            {photoTab === "selected"
              ? "You have not selected any photos yet."
              : "No photos in this gallery yet."}
          </p>
        ) : (
          <ul className={galleryListClass(gridLayout)}>
            {visibleAssets.map((a, index) => (
              <li
                key={a.id}
                className={uploadItemClass(gridLayout, index, a.selection === "SELECTED")}
              >
                <div className={uploadImageWrapClass(gridLayout, index)}>
                  <button
                    type="button"
                    className="block h-full w-full text-left"
                    onClick={() => openLb(a.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.thumbUrl}
                      alt={a.originalName}
                      className="h-full w-full object-cover transition group-hover:brightness-[0.97]"
                    />
                  </button>

                  <div className="absolute right-2 top-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={editingLocked || syncBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleSelect(a.id);
                      }}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full shadow-md ring-1 ring-black/10 backdrop-blur transition ${
                        a.selection === "SELECTED"
                          ? "bg-brand text-white hover:bg-brand-hover"
                          : "bg-white/95 text-zinc-700 hover:bg-white"
                      } disabled:opacity-40`}
                      aria-label={a.selection === "SELECTED" ? "Unselect photo" : "Select photo"}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
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
            onClick={() => setLightboxId(null)}
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
                onClick={() => setLightboxId(null)}
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
    </div>
  );
}