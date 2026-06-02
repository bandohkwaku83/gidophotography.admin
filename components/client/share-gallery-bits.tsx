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

/** Initial grid tiles rendered on the client share gallery (more via “View more”). */
export const SHARE_GALLERY_INITIAL_VISIBLE = 24;

/** How many additional tiles each “View more” click reveals. */
export const SHARE_GALLERY_LOAD_MORE_COUNT = 24;

export function GalleryViewMoreButton({
  onClick,
  remainingCount,
}: {
  onClick: () => void;
  remainingCount?: number;
}) {
  return (
    <div className="mt-10 flex justify-center px-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={
          remainingCount != null && remainingCount > 0
            ? `View more, ${remainingCount} photos remaining`
            : "View more photos"
        }
        className="inline-flex min-w-[9.5rem] items-center justify-center bg-[#333333] px-8 py-2.5 text-sm font-normal tracking-wide text-white transition hover:bg-[#2a2a2a]"
      >
        View More
      </button>
    </div>
  );
}

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
    case "uniform":
    default:
      return "(max-width: 640px) 50vw, 25vw";
  }
}

/* ----------------------------- layout class helpers ----------------------------- */

export function galleryListClass(layout: GridLayout): string {
  switch (layout) {
    case "uniform":
      return "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";
    case "masonry":
      return "";
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
    return `group overflow-hidden bg-white transition dark:bg-zinc-950 ${selectedRing}`;
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
    return "group overflow-hidden bg-white dark:bg-zinc-950";
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

const MASONRY_ASPECT_PATTERN = [
  "relative aspect-[4/5]",
  "relative aspect-[3/4]",
  "relative aspect-[5/4]",
  "relative aspect-[2/3]",
  "relative aspect-square",
  "relative aspect-[4/3]",
  "relative aspect-[3/5]",
  "relative aspect-[5/6]",
] as const;

/** Height/width ratio per tile (matches {@link MASONRY_ASPECT_PATTERN}). */
const MASONRY_HEIGHT_WEIGHT = [5 / 4, 4 / 3, 4 / 5, 3 / 2, 1, 3 / 4, 5 / 3, 5 / 6] as const;

export function masonryGalleryListClass(): string {
  return "flex items-start gap-2 sm:gap-3";
}

export function masonryColumnListClass(): string {
  return "m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0 sm:gap-3";
}

/** Stable tile height per photo id so layout stays fixed when loading more. */
export function masonryAspectIndex(itemId: string): number {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) {
    h = Math.imul(31, h) + itemId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % MASONRY_ASPECT_PATTERN.length;
}

export function masonryTileHeightWeight(itemId: string): number {
  return MASONRY_HEIGHT_WEIGHT[masonryAspectIndex(itemId)] ?? 1;
}

/**
 * Packs items into masonry columns. Existing ids keep their column when loading more;
 * only new ids are placed on the shortest column.
 */
export function packStableMasonryColumns<T extends { id: string }>(
  items: T[],
  columnCount: number,
  assignments: Map<string, number>,
): T[][] {
  const cols: T[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array<number>(columnCount).fill(0);

  for (const item of items) {
    let col = assignments.get(item.id);
    if (col == null || col >= columnCount) {
      col = 0;
      let minHeight = heights[0] ?? 0;
      for (let c = 1; c < columnCount; c++) {
        const h = heights[c] ?? 0;
        if (h < minHeight) {
          minHeight = h;
          col = c;
        }
      }
      assignments.set(item.id, col);
    }
    cols[col]!.push(item);
    heights[col] = (heights[col] ?? 0) + masonryTileHeightWeight(item.id);
  }

  return cols;
}

export function uploadImageWrapClass(layout: GridLayout, index: number, itemId?: string): string {
  if (layout === "block") {
    return "relative aspect-[5/6] sm:aspect-square";
  }
  if (layout === "masonry") {
    const patternIndex =
      itemId != null ? masonryAspectIndex(itemId) : index % MASONRY_ASPECT_PATTERN.length;
    return MASONRY_ASPECT_PATTERN[patternIndex] ?? MASONRY_ASPECT_PATTERN[0];
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
    setId: a.setId ?? null,
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
