const STORAGE_KEY = "gido.gallery-order";

type OrderedFolder = {
  _id: string;
  sortOrder?: number;
};

export function readGalleryOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function writeGalleryOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore quota and private-mode failures. The on-screen order still updates.
  }
}

/**
 * Prefer a server `sortOrder` when the API sends one (unset galleries stay first).
 * Otherwise replay this browser's saved arrangement.
 */
export function applyStoredGalleryOrder<T extends OrderedFolder>(
  folders: T[],
  storedIds: string[],
): T[] {
  if (folders.some((folder) => typeof folder.sortOrder === "number")) {
    return [...folders].sort((a, b) => {
      const ao = typeof a.sortOrder === "number" ? a.sortOrder : Number.NEGATIVE_INFINITY;
      const bo = typeof b.sortOrder === "number" ? b.sortOrder : Number.NEGATIVE_INFINITY;
      return ao - bo;
    });
  }
  if (!storedIds.length) return folders;
  const rank = new Map(storedIds.map((id, index) => [id, index]));
  const unknown: T[] = [];
  const known: T[] = [];
  for (const folder of folders) {
    if (rank.has(folder._id)) known.push(folder);
    else unknown.push(folder);
  }
  known.sort((a, b) => (rank.get(a._id) ?? 0) - (rank.get(b._id) ?? 0));
  return [...unknown, ...known];
}

/** Write a reordered visible subset back into the full list, leaving hidden cards in place. */
export function applyVisibleGalleryOrder<T extends OrderedFolder>(all: T[], visibleNext: T[]): T[] {
  if (visibleNext.length === all.length) return visibleNext;
  const queue = [...visibleNext];
  const visibleIds = new Set(visibleNext.map((folder) => folder._id));
  return all.map((folder) => (visibleIds.has(folder._id) ? (queue.shift() ?? folder) : folder));
}

export function sameGalleryOrder<T extends OrderedFolder>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((folder, index) => folder._id === right[index]?._id);
}

/**
 * Move one card, or the whole visible selection when the dragged card is part of it.
 * Selected cards keep their relative order.
 */
export function moveGalleryCards<T extends OrderedFolder>(
  items: T[],
  activeId: string,
  overId: string,
  selectedIds: ReadonlySet<string>,
): T[] {
  if (!overId || activeId === overId) return items;

  const selectedInList = items.filter((item) => selectedIds.has(item._id));
  const groupMove = selectedIds.has(activeId) && selectedInList.length > 1;
  const moving = groupMove ? selectedInList : items.filter((item) => item._id === activeId);
  if (moving.length === 0) return items;
  if (moving.some((item) => item._id === overId)) return items;

  const movingIds = new Set(moving.map((item) => item._id));
  const dragIndexes = items.reduce<number[]>((indexes, item, index) => {
    if (movingIds.has(item._id)) indexes.push(index);
    return indexes;
  }, []);
  const dropIndex = items.findIndex((item) => item._id === overId);
  const firstDragIndex = dragIndexes[0];
  if (dropIndex < 0 || firstDragIndex === undefined) return items;

  const draggedBeforeDrop = dragIndexes.filter((index) => index < dropIndex).length;
  const insertIndex =
    firstDragIndex < dropIndex ? dropIndex - draggedBeforeDrop + 1 : dropIndex - draggedBeforeDrop;

  const staying = items.filter((item) => !movingIds.has(item._id));
  const next = [...staying];
  next.splice(insertIndex, 0, ...moving);
  return next;
}
