import {
  Columns3,
  Focus,
  GalleryHorizontal,
  LayoutGrid,
  PanelsTopLeft,
} from "lucide-react";
import type { DemoAsset, DemoFinalAsset, SelectionState } from "@/lib/demo-data";
import {
  getShareFinalLockedPreviewUrl,
  type ShareGalleryAsset,
  type ShareGalleryFinal,
} from "@/lib/share-gallery-api";

export const GRID_STORAGE_PREFIX = "gidostorage-share-grid:v2:";
export const GALLERY_MUSIC_MUTE_PREFIX = "gidostorage-share-music-muted:";

export type GridLayout = "uniform" | "masonry" | "block" | "filmstrip" | "spotlight";

export const GRID_LAYOUTS: {
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

export function isGridLayout(v: string): v is GridLayout {
  return GRID_LAYOUTS.some((x) => x.id === v);
}

/* ----------------------------- next/image hints ----------------------------- */

export const SHARE_GRID_IMAGE_QUALITY = 75;
export const SHARE_LIGHTBOX_IMAGE_QUALITY = 75;

/** `sizes` for selected-photo strip (4–10 columns). */
export const SELECTED_STRIP_IMAGE_SIZES = "(max-width: 640px) 25vw, (max-width: 900px) 12vw, 120px";

export const SHARE_LIGHTBOX_SIZES = "(max-width: 1280px) 100vw, 896px";

export function shareGalleryGridSizes(layout: GridLayout, index: number): string {
  switch (layout) {
    case "filmstrip":
      return "(max-width: 640px) 85vw, 320px";
    case "spotlight":
      return index === 0
        ? "(max-width: 640px) 100vw, (max-width: 1024px) 66vw, (max-width: 1536px) 55vw, 1056px"
        : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 24vw, 384px";
    case "block":
      return "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 480px";
    case "masonry":
      return "(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, (max-width: 1536px) 17vw, 15vw";
    case "uniform":
    default:
      return "(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, (max-width: 1536px) 17vw, 15vw";
  }
}

/* ----------------------------- layout class helpers ----------------------------- */

export function galleryListClass(layout: GridLayout): string {
  switch (layout) {
    case "uniform":
      return "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";
    case "masonry":
      return "columns-2 gap-x-1 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 [column-fill:_balance]";
    case "block":
      return "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 xl:gap-8";
    case "filmstrip":
      return "flex flex-row flex-nowrap gap-4 overflow-x-auto pb-3 pt-1 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory px-0.5";
    case "spotlight":
      return "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 2xl:grid-cols-5";
    default:
      return "";
  }
}

export function uploadItemClass(layout: GridLayout, index: number, isSelected: boolean): string {
  if (layout === "masonry") {
    const selectedRing = isSelected ? "ring-2 ring-inset ring-brand dark:ring-brand-on-dark" : "";
    return `group mb-1 break-inside-avoid overflow-hidden bg-white transition dark:bg-zinc-950 ${selectedRing}`;
  }
  const ring = isSelected
    ? "border-brand-on-dark ring-2 ring-brand-soft dark:border-brand dark:ring-brand/40"
    : "border-zinc-200 dark:border-zinc-800";
  const base = `group overflow-hidden rounded-xl border bg-white shadow-sm transition dark:bg-zinc-950 ${ring}`;
  if (layout === "spotlight" && index === 0) {
    return `${base} col-span-2 row-span-2 flex flex-col sm:min-h-[min(72vw,400px)]`;
  }
  if (layout === "filmstrip") {
    return `${base} w-[min(85vw,22rem)] shrink-0 snap-start sm:w-80`;
  }
  return base;
}

export function editedCardClass(layout: GridLayout, index: number): string {
  if (layout === "masonry") {
    return "group mb-1 break-inside-avoid overflow-hidden bg-white dark:bg-zinc-950";
  }
  const base =
    "group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
  if (layout === "spotlight" && index === 0) {
    return `${base} col-span-2 row-span-2 flex flex-col sm:min-h-[min(72vw,420px)]`;
  }
  if (layout === "filmstrip") {
    return `${base} w-[min(85vw,22rem)] shrink-0 snap-start sm:w-80`;
  }
  return base;
}

export function uploadImageWrapClass(layout: GridLayout, index: number): string {
  if (layout === "block") {
    return "relative aspect-[5/6] sm:aspect-square";
  }
  if (layout === "masonry") {
    const pattern = [
      "relative aspect-[4/5]",
      "relative aspect-[3/4]",
      "relative aspect-[5/4]",
      "relative aspect-[2/3]",
      "relative aspect-square",
      "relative aspect-[4/3]",
      "relative aspect-[3/5]",
      "relative aspect-[5/6]",
    ];
    return pattern[index % pattern.length] ?? "relative aspect-[4/5]";
  }
  if (layout === "spotlight" && index === 0) {
    return "relative aspect-[5/4] w-full flex-1 sm:aspect-auto sm:min-h-[280px]";
  }
  return "relative aspect-square";
}

/* ----------------------------- small helpers ----------------------------- */

export function clientInitials(name: string): string {
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

export function toDemoAssets(shareAssets: ShareGalleryAsset[]): DemoAsset[] {
  return shareAssets.map((a) => ({
    id: a.id,
    originalName: a.originalName,
    selection: a.selection as SelectionState,
    editState: "NONE",
    clientComment: "",
    hasEdited: false,
    thumbUrl: a.thumbUrl,
    ...(a.previewUrl ? { previewUrl: a.previewUrl } : {}),
    ...(a.mimeType ? { mimeType: a.mimeType } : {}),
  }));
}

export function finalDisplaySrc(f: ShareGalleryFinal, shareToken: string): string {
  const locked = Boolean(f.locked);
  return locked ? f.lockedPreviewUrl || getShareFinalLockedPreviewUrl(shareToken, f.id) : f.url;
}

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|ogg|ogv|avi|mkv)(?:[?#].*)?$/i;

function isVideoMedia(mimeType: string | undefined, ...refs: (string | undefined)[]): boolean {
  const m = mimeType?.toLowerCase() ?? "";
  if (m.startsWith("video/")) return true;
  return refs.some((ref) => (ref ? VIDEO_EXT_RE.test(ref) : false));
}

export function isDemoAssetVideo(a: DemoAsset): boolean {
  return isVideoMedia(a.mimeType, a.previewUrl, a.thumbUrl, a.originalName);
}

export function isDemoFinalAssetVideo(f: DemoFinalAsset): boolean {
  return isVideoMedia(f.mimeType, f.url, f.name);
}

/** Unlocked originals may be video; locked delivery always uses the JPEG locked-preview URL. */
export function isShareFinalVideo(f: ShareGalleryFinal): boolean {
  return isVideoMedia(f.mimeType, f.url, f.name);
}
