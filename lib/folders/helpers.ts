import { API_BASE_URL, sameOriginUploadsUrl } from "@/lib/api";
import type { DemoAsset, DemoFinalAsset, FolderStatus } from "@/lib/demo-data";
import type {
  ApiFolder,
  ApiFolderMedia,
  ApiFolderMediaBySetBucket,
  ApiFolderSet,
  FolderMediaReorderResult,
} from "@/lib/folders/types";

export type FolderMediaDuplicatePreviewKind = "raw" | "final";

/** Human-readable local deadline for restore UI. */
export function formatRestoreBeforeLabel(iso: string | undefined | null): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function isRestoreDeadlinePassed(restoreBefore: string): boolean {
  const d = new Date(restoreBefore);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/** Count of `ignoredDuplicatesCount` from a (possibly nested) upload response. */
export function readIgnoredDuplicatesCount(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const o = body as Record<string, unknown>;
  const nested =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;
  const pick = (x: Record<string, unknown>) =>
    x.ignoredDuplicatesCount ?? x.ignored_duplicates_count;
  const raw = pick(o) ?? (nested ? pick(nested) : undefined);
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

export function extractFolderSets(folder: ApiFolder): ApiFolderSet[] {
  const f = folder as Record<string, unknown>;
  const v = f.sets;
  if (!Array.isArray(v)) return [];
  const sets = v.filter(
    (row): row is ApiFolderSet =>
      !!row &&
      typeof row === "object" &&
      typeof (row as { _id?: unknown })._id === "string" &&
      typeof (row as { name?: unknown }).name === "string",
  );
  return [...sets].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Sentinel for the uncategorized bucket in collection reorder APIs. */
export const GENERAL_COLLECTION_KEY = "general";

export const DEFAULT_ALL_MEDIA_LABEL = "All Media";
export const DEFAULT_CLIENT_ALL_LABEL = "All";
export const DEFAULT_GENERAL_SET_LABEL = "General";

export type OrderedCollectionRow = {
  key: string;
  label: string;
  sortOrder: number;
  set?: ApiFolderSet;
};

function readOptionalLabel(o: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!o) return "";
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function folderAllMediaLabel(
  folder: ApiFolder | Record<string, unknown> | null | undefined,
  client = false,
): string {
  const o = folder && typeof folder === "object" ? (folder as Record<string, unknown>) : null;
  const custom = readOptionalLabel(o, "allMediaLabel", "all_media_label");
  if (custom) return custom;
  return client ? DEFAULT_CLIENT_ALL_LABEL : DEFAULT_ALL_MEDIA_LABEL;
}

export function folderGeneralSetLabel(
  folder: ApiFolder | Record<string, unknown> | null | undefined,
): string {
  const o = folder && typeof folder === "object" ? (folder as Record<string, unknown>) : null;
  const custom = readOptionalLabel(o, "generalSetLabel", "general_set_label");
  return custom || DEFAULT_GENERAL_SET_LABEL;
}

export function readGeneralSetSortOrder(
  folder: ApiFolder | Record<string, unknown> | null | undefined,
): number {
  const o = folder && typeof folder === "object" ? (folder as Record<string, unknown>) : null;
  const raw = o?.generalSetSortOrder ?? o?.general_set_sort_order;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return -1;
}

/** General + named sets in display order (excludes the virtual “all” tab). */
export function buildOrderedCollectionRows(
  folder: ApiFolder | Record<string, unknown> | null | undefined,
  sets: ApiFolderSet[],
): OrderedCollectionRow[] {
  const general: OrderedCollectionRow = {
    key: GENERAL_COLLECTION_KEY,
    label: folderGeneralSetLabel(folder),
    sortOrder: readGeneralSetSortOrder(folder),
  };
  const named: OrderedCollectionRow[] = [...sets]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((set) => ({
    key: set._id,
    label: set.name,
    sortOrder: set.sortOrder ?? 0,
    set,
  }));
  return [...named, general].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function collectionKeyToSetFilter(key: string): "general" | string {
  return key === GENERAL_COLLECTION_KEY ? "general" : key;
}

export function setFilterToCollectionKey(filter: "all" | "general" | string): string {
  if (filter === "general") return GENERAL_COLLECTION_KEY;
  return filter;
}

function bucketSetIdFromRow(b: Record<string, unknown>): string | null {
  if (b.setId === null || b.set_id === null) return null;
  return parseSetIdFromApiRow(b);
}

function mediaSortOrder(row: ApiFolderMedia): number {
  const o = row as Record<string, unknown>;
  const raw = o.sortOrder ?? o.sort_order;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER;
}

/** Flatten `uploadsBySet` / `selectionBySet` / `finalsBySet` buckets into rows with `setId`. */
export function flattenMediaFromBySetBuckets(buckets: unknown): ApiFolderMedia[] {
  if (!Array.isArray(buckets) || buckets.length === 0) return [];
  const out: ApiFolderMedia[] = [];
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== "object") continue;
    const b = bucket as Record<string, unknown>;
    const bucketSetId = bucketSetIdFromRow(b);
    const media = b.media ?? b.uploads ?? b.items ?? b.files;
    if (!Array.isArray(media)) continue;
    const rows = [...media].sort((a, b) => {
      const left = a && typeof a === "object" ? mediaSortOrder(a as ApiFolderMedia) : 0;
      const right = b && typeof b === "object" ? mediaSortOrder(b as ApiFolderMedia) : 0;
      return left - right;
    });
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const rowSetId = parseSetIdFromApiRow(o) ?? bucketSetId;
      out.push({
        ...(row as ApiFolderMedia),
        setId: rowSetId ?? null,
      });
    }
  }
  return out;
}

/** Merge media collections from a reorder PATCH into an existing folder snapshot. */
export function applyFolderMediaReorderResponse(
  folder: ApiFolder,
  result: FolderMediaReorderResult,
): ApiFolder {
  const next: ApiFolder = { ...folder };
  if (Array.isArray(result.uploads)) next.uploads = result.uploads;
  if (Array.isArray(result.uploadsBySet)) next.uploadsBySet = result.uploadsBySet;
  if (Array.isArray(result.finals)) next.finals = result.finals;
  if (Array.isArray(result.finalsBySet)) next.finalsBySet = result.finalsBySet;
  return next;
}

function readBySetBuckets(folder: ApiFolder, key: keyof ApiFolder): ApiFolderMediaBySetBucket[] | undefined {
  const f = folder as Record<string, unknown>;
  const v = f[key as string];
  return Array.isArray(v) ? (v as ApiFolderMediaBySetBucket[]) : undefined;
}

export function filterRawAssetsBySetView<T extends { setId?: string | null }>(
  assets: T[],
  view: "all" | "general" | string,
): T[] {
  return filterAssetsBySetView(assets, view);
}

export function filterAssetsBySetView<T extends { setId?: string | null }>(
  assets: T[],
  view: "all" | "general" | string,
): T[] {
  if (view === "all") return assets;
  if (view === "general") {
    return assets.filter((a) => a.setId == null || a.setId === "");
  }
  return assets.filter((a) => a.setId === view);
}

export function parseSetIdFromApiRow(o: Record<string, unknown>): string | null {
  const rawSet = o.setId ?? o.set_id ?? o.set;
  if (typeof rawSet === "string" && rawSet.trim()) return rawSet.trim();
  if (rawSet && typeof rawSet === "object") {
    const id =
      (rawSet as { _id?: unknown })._id ?? (rawSet as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function sortMediaRows(rows: ApiFolderMedia[]): ApiFolderMedia[] {
  return [...rows].sort((a, b) => mediaSortOrder(a) - mediaSortOrder(b));
}

export function extractRawMediaList(folder: ApiFolder): ApiFolderMedia[] {
  const bySet = readBySetBuckets(folder, "uploadsBySet");
  if (bySet?.length) {
    const flat = flattenMediaFromBySetBuckets(bySet);
    if (flat.length > 0) return flat;
  }
  const f = folder as Record<string, unknown>;
  for (const k of ["uploads", "rawMedia", "rawFiles", "mediaRaw"]) {
    const v = f[k];
    if (Array.isArray(v)) return sortMediaRows(v as ApiFolderMedia[]);
  }
  const m = f.media;
  if (m && typeof m === "object" && Array.isArray((m as { raw?: unknown }).raw)) {
    return (m as { raw: ApiFolderMedia[] }).raw;
  }
  return [];
}

/**
 * GET `/api/folders/:id` often returns selection as
 * `{ _id, editStatus, raw: { url, originalFilename, ... }, rawMediaId }[]`.
 */
function normalizeSelectionListItem(item: unknown): ApiFolderMedia | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const selectionId =
    (typeof row._id === "string" && row._id) ||
    (typeof row.id === "string" && row.id) ||
    "";
  const nestedRaw = row.raw;
  if (nestedRaw && typeof nestedRaw === "object") {
    const r = nestedRaw as Record<string, unknown>;
    if (selectionId) {
      return {
        _id: selectionId,
        url: typeof r.url === "string" ? r.url : undefined,
        thumbUrl: typeof r.thumbUrl === "string" ? r.thumbUrl : undefined,
        thumbnailUrl: typeof r.thumbnailUrl === "string" ? r.thumbnailUrl : undefined,
        displayUrl: typeof r.displayUrl === "string" ? r.displayUrl : undefined,
        previewUrl: typeof r.previewUrl === "string" ? r.previewUrl : undefined,
        originalFilename:
          typeof r.originalFilename === "string" ? r.originalFilename : undefined,
        originalName: typeof r.originalName === "string" ? r.originalName : undefined,
        filename: typeof r.filename === "string" ? r.filename : undefined,
        name: typeof r.name === "string" ? r.name : undefined,
        editStatus: typeof row.editStatus === "string" ? row.editStatus : undefined,
        rawMediaId: typeof row.rawMediaId === "string" ? row.rawMediaId : undefined,
        clientComment:
          typeof row.clientComment === "string"
            ? row.clientComment
            : typeof row.comment === "string"
              ? row.comment
              : undefined,
        setId:
          parseSetIdFromApiRow(row) ??
          parseSetIdFromApiRow(r) ??
          undefined,
        rawHiddenFromUploads: readRawHiddenFromUploads(row),
        selected: true,
        selection: "SELECTED",
        isSelected: true,
      };
    }
  }
  if (selectionId) {
    const rawMediaId =
      typeof row.rawMediaId === "string" && row.rawMediaId.trim()
        ? row.rawMediaId.trim()
        : undefined;
    const fallbackName =
      typeof row.originalName === "string"
        ? row.originalName
        : typeof row.originalFilename === "string"
          ? row.originalFilename
          : typeof row.name === "string"
            ? row.name
            : undefined;
    return {
      _id: selectionId,
      rawMediaId,
      editStatus: typeof row.editStatus === "string" ? row.editStatus : undefined,
      clientComment:
        typeof row.clientComment === "string"
          ? row.clientComment
          : typeof row.comment === "string"
            ? row.comment
            : undefined,
      setId: parseSetIdFromApiRow(row) ?? undefined,
      rawHiddenFromUploads: readRawHiddenFromUploads(row),
      originalName:
        rawMediaId && !fallbackName ? "File removed from gallery" : fallbackName ?? "Selection",
      selected: true,
      selection: "SELECTED",
      isSelected: true,
    };
  }
  return item as ApiFolderMedia;
}

export function extractSelectionMediaList(folder: ApiFolder): ApiFolderMedia[] {
  const bySet = readBySetBuckets(folder, "selectionBySet");
  if (bySet?.length) {
    const flat = flattenMediaFromBySetBuckets(bySet);
    if (flat.length > 0) {
      const out: ApiFolderMedia[] = [];
      for (const item of flat) {
        const n = normalizeSelectionListItem(item);
        if (n) out.push(n);
      }
      if (out.length > 0) return out;
    }
  }
  const f = folder as Record<string, unknown>;
  const chunks: unknown[] = [];
  for (const k of ["selection", "selectionMedia", "selections", "clientSelections"]) {
    const v = f[k];
    if (Array.isArray(v)) {
      chunks.push(...v);
      break;
    }
  }
  if (chunks.length === 0) {
    const m = f.media;
    if (m && typeof m === "object") {
      const o = m as { selections?: unknown[]; selection?: unknown[] };
      if (Array.isArray(o.selections)) chunks.push(...o.selections);
      else if (Array.isArray(o.selection)) chunks.push(...o.selection);
    }
  }
  const out: ApiFolderMedia[] = [];
  for (const item of chunks) {
    const n = normalizeSelectionListItem(item);
    if (n) out.push(n);
  }
  return out;
}

export function extractFinalMediaList(folder: ApiFolder): ApiFolderMedia[] {
  const bySet = readBySetBuckets(folder, "finalsBySet");
  if (bySet?.length) {
    const flat = flattenMediaFromBySetBuckets(bySet);
    if (flat.length > 0) return flat;
  }
  const f = folder as Record<string, unknown>;
  for (const k of ["finals", "finalMedia", "finalFiles"]) {
    const v = f[k];
    if (Array.isArray(v)) return sortMediaRows(v as ApiFolderMedia[]);
  }
  const m = f.media;
  if (m && typeof m === "object") {
    const o = m as { finals?: ApiFolderMedia[]; final?: ApiFolderMedia[] };
    if (Array.isArray(o.finals)) return sortMediaRows(o.finals);
    if (Array.isArray(o.final)) return sortMediaRows(o.final);
  }
  return [];
}

/** Display filename for a folder media row (aligned with gallery / duplicate checks). */
export function folderMediaRowFilename(m: ApiFolderMedia): string {
  return (m.originalName || m.originalFilename || m.filename || m.name || "").trim();
}

/**
 * Filenames in {@link incoming} that match an existing file name in the folder
 * for raw uploads or finals (same string match as typical duplicate checks).
 */
function folderMediaMatchesSet(m: ApiFolderMedia, setId: string | null | undefined): boolean {
  const rowSet = parseSetIdFromApiRow(m as Record<string, unknown>) ?? m.setId ?? null;
  if (setId === undefined) return true;
  if (setId === null) return rowSet == null || rowSet === "";
  return rowSet === setId;
}

export function incomingFilenamesConflictingWithFolder(
  kind: FolderMediaDuplicatePreviewKind,
  incoming: string[],
  folder: ApiFolder,
  setId?: string | null,
): string[] {
  let existingRows =
    kind === "raw" ? extractRawMediaList(folder) : extractFinalMediaList(folder);
  if (setId !== undefined) {
    existingRows = existingRows.filter((m) => folderMediaMatchesSet(m, setId));
  }
  const existing = new Set<string>();
  for (const m of existingRows) {
    const n = folderMediaRowFilename(m);
    if (n) existing.add(n);
  }
  const out: string[] = [];
  const seenOut = new Set<string>();
  for (const raw of incoming) {
    const name = raw.trim();
    if (!name || !existing.has(name) || seenOut.has(name)) continue;
    seenOut.add(name);
    out.push(name);
  }
  return out;
}

function apiEditStatusToUi(s?: string): "NONE" | "IN_PROGRESS" | "EDITED" {
  const v = (s || "").toLowerCase().replace(/-/g, "_");
  if (v === "in_progress") return "IN_PROGRESS";
  if (v === "edited" || v === "complete" || v === "completed") return "EDITED";
  return "NONE";
}

function readRawHiddenFromUploads(o: Record<string, unknown>): boolean {
  return o.rawHiddenFromUploads === true || o.raw_hidden_from_uploads === true;
}

function apiMediaMimeType(m: ApiFolderMedia): string {
  const o = m as Record<string, unknown>;
  for (const key of ["mimeType", "mime_type", "contentType", "content_type", "mimetype", "mime"]) {
    const value = o[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Map API media row → in-app DemoAsset shape for folder detail UI. */
export function apiFolderMediaToDemoAsset(m: ApiFolderMedia): DemoAsset {
  const id = m._id || m.id || `m-${Math.random().toString(36).slice(2, 10)}`;
  const originalName =
    m.originalName || m.originalFilename || m.filename || m.name || "Photo";
  const mimeType = apiMediaMimeType(m);
  const thumbRaw =
    m.thumbUrl ||
    m.thumbnailUrl ||
    m.displayUrl ||
    m.previewUrl ||
    m.url ||
    m.image ||
    "";
  const thumbUrl = resolveCoverUrl(thumbRaw) || thumbRaw || "";
  const selected =
    m.selected === true ||
    (typeof m.selection === "string" && m.selection.toUpperCase() === "SELECTED") ||
    m.isSelected === true;
  const o = m as Record<string, unknown>;
  const setId = parseSetIdFromApiRow(o);
  const rawMediaId =
    typeof m.rawMediaId === "string"
      ? m.rawMediaId
      : typeof o.rawMediaId === "string"
        ? o.rawMediaId
        : undefined;
  const rawHiddenFromUploads = readRawHiddenFromUploads(o);
  const rawMissing = Boolean(rawMediaId && !thumbUrl && !rawHiddenFromUploads);

  return {
    id,
    originalName: rawMissing ? "File removed from gallery" : originalName,
    selection: selected ? "SELECTED" : "UNSELECTED",
    editState: apiEditStatusToUi(m.editStatus),
    clientComment: m.clientComment || m.comment || "",
    hasEdited: false,
    thumbUrl,
    ...(mimeType ? { mimeType } : {}),
    setId,
    ...(rawMediaId ? { rawMediaId } : {}),
    ...(rawMissing ? { rawMissing: true } : {}),
    ...(rawHiddenFromUploads ? { rawHiddenFromUploads: true } : {}),
  };
}

function readOutstandingAmountGhs(o: Record<string, unknown>): number {
  const raw =
    o.outstandingAmountGHS ??
    o.outstanding_amount_ghs ??
    o.amountRemainingGHS ??
    o.amount_remaining_ghs;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim().replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function nestedRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function truthyFolderFlag(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** True when the folder detail API indicates client finals are still payment-locked. */
export function folderFinalsPaymentLocked(folder: ApiFolder): boolean {
  const root = folder as Record<string, unknown>;

  if (readOutstandingAmountGhs(root) > 0) return true;

  const fd = nestedRecord(root.finalDelivery) ?? nestedRecord(root.final_delivery);
  if (fd) {
    if (
      truthyFolderFlag(fd.locked) ||
      truthyFolderFlag(fd.paymentLocked) ||
      truthyFolderFlag(fd.payment_locked)
    ) {
      return true;
    }
    if (readOutstandingAmountGhs(fd) > 0) return true;
  }

  if (truthyFolderFlag(root.finalDeliveryLock) || truthyFolderFlag(root.final_delivery_lock)) {
    return true;
  }
  if (truthyFolderFlag(root.finalsPaymentLocked) || truthyFolderFlag(root.finals_payment_locked)) {
    return true;
  }
  if (truthyFolderFlag(root.finalDeliveryLocked) || truthyFolderFlag(root.final_delivery_locked)) {
    return true;
  }
  const share = root.share;
  if (share && typeof share === "object") {
    const s = share as Record<string, unknown>;
    if (readOutstandingAmountGhs(s) > 0) return true;
    const shareLockKeys = [
      "finalsPaymentLocked",
      "finals_payment_locked",
      "finalsLocked",
      "finals_locked",
      "finalDeliveryLocked",
      "final_delivery_locked",
      "finalLocked",
      "final_locked",
      "paymentLockOnFinals",
      "payment_lock_on_finals",
    ] as const;
    for (const k of shareLockKeys) {
      if (truthyFolderFlag(s[k])) return true;
    }
  }
  return false;
}

export function apiFolderMediaToFinal(m: ApiFolderMedia): DemoFinalAsset {
  const id = m._id || m.id || `f-${Math.random().toString(36).slice(2, 10)}`;
  const name = m.originalName || m.originalFilename || m.filename || m.name || "Final";
  const mimeType = apiMediaMimeType(m);
  const urlRaw = m.url || m.previewUrl || m.thumbUrl || "";
  const url = resolveCoverUrl(urlRaw) || urlRaw || "";
  const o = m as Record<string, unknown>;
  const truthyFlag = (v: unknown) => v === true || v === "true";
  const lockStatus =
    typeof o.lockStatus === "string"
      ? o.lockStatus
      : typeof o.lock_status === "string"
        ? o.lock_status
        : "";
  const locked =
    m.locked === true ||
    truthyFlag(o.isLocked) ||
    truthyFlag(o.is_locked) ||
    truthyFlag(o.isPaymentLocked) ||
    truthyFlag(o.is_payment_locked) ||
    truthyFlag(o.finalLocked) ||
    truthyFlag(o.final_locked) ||
    truthyFlag(o.clientLocked) ||
    truthyFlag(o.client_locked) ||
    truthyFlag(o.lockImages) ||
    truthyFlag(o.paymentLocked) ||
    truthyFlag(o.payment_locked) ||
    truthyFlag(o.downloadLocked) ||
    truthyFlag(o.download_locked) ||
    lockStatus.toLowerCase() === "locked";
  const setId = parseSetIdFromApiRow(o);
  return {
    id,
    name,
    url,
    ...(mimeType ? { mimeType } : {}),
    locked,
    setId,
  };
}

/**
 * Whether client final images behave as locked (after `PATCH .../final-delivery/lock`, until unlock).
 * Combines folder-level flags, outstanding balance hints, and per-final `locked` from GET folder.
 */
export function finalImagesLockedForClient(folder: ApiFolder): boolean {
  if (folderFinalsPaymentLocked(folder)) return true;
  for (const m of extractFinalMediaList(folder)) {
    if (apiFolderMediaToFinal(m).locked) return true;
  }
  return false;
}

export function apiFolderStatusToUi(s?: string): FolderStatus {
  const v = (s || "").toLowerCase();
  if (v === "completed" || v === "complete" || v === "delivered") return "COMPLETED";
  if (v === "selection_pending" || v === "selection-pending" || v === "selectionpending")
    return "SELECTION_PENDING";
  return "DRAFT";
}

export function getFolderClientId(folder: ApiFolder): string {
  return typeof folder.client === "string" ? folder.client : folder.client?._id ?? "";
}

export function getFolderClientName(
  folder: ApiFolder,
  clientNameById?: Map<string, string>,
): string {
  if (typeof folder.client === "object" && folder.client?.name) {
    return folder.client.name;
  }
  const id = getFolderClientId(folder);
  return clientNameById?.get(id) ?? "Unknown client";
}

/** Selection lock may be on `share` (detail GET) or duplicated on the folder root. */
export function folderSelectionLocked(folder: ApiFolder): boolean {
  return Boolean(folder.share?.selectionLocked ?? folder.selectionLocked);
}

/** Parse max client selection cap from folder/share API fields; `null` = unlimited. */
export function extractMaxClientSelections(folder: ApiFolder): number | null {
  const read = (o: Record<string, unknown>): number | null => {
    for (const key of [
      "maxClientSelections",
      "max_client_selections",
      "selectionLimit",
      "selection_limit",
      "maxSelections",
      "max_selections",
    ]) {
      const v = o[key];
      if (v === null || v === undefined || v === "") continue;
      if (v === false) continue;
      if (v === 0 || v === "0") return null;
      const n = typeof v === "number" ? v : Number(String(v).trim().replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 1) continue;
      return Math.min(9999, Math.floor(n));
    }
    return null;
  };

  if (folder.share && typeof folder.share === "object") {
    const fromShare = read(folder.share as Record<string, unknown>);
    if (fromShare != null) return fromShare;
  }
  const fromRoot = read(folder as Record<string, unknown>);
  if (fromRoot != null) return fromRoot;
  return null;
}

/** Resolve a coverImage value (could be absolute URL or a relative path). */
export function resolveCoverUrl(coverImage?: string | null): string | null {
  if (!coverImage) return null;
  const normalized = sameOriginUploadsUrl(coverImage.trim());
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) {
    if (API_BASE_URL) return `${API_BASE_URL}${normalized}`;
    return normalized;
  }
  if (API_BASE_URL) return `${API_BASE_URL}/${normalized}`;
  return `/${normalized}`;
}

/** Pick the best cover URL for an ApiFolder (prefers `coverImageUrl`). */
export function getFolderCoverUrl(folder: ApiFolder): string | null {
  if (folder.coverImageUrl) return resolveCoverUrl(folder.coverImageUrl);
  return resolveCoverUrl(folder.coverImage);
}

/** Bust browser cache when the cover file changes but the URL path stays the same. */
export function appendCoverCacheBust(url: string, version: string | number): string {
  if (!url || url.startsWith("blob:")) return url;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    parsed.searchParams.set("v", String(version));
    return parsed.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${encodeURIComponent(String(version))}`;
  }
}

function readNumericField(o: Record<string, unknown>, camel: string, snake: string): number | null {
  const tryOne = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  return tryOne(o[camel]) ?? tryOne(o[snake]);
}

/** Read cover focal from API folder (camelCase or snake_case). Default center 50,50. */
export function parseFolderCoverFocal(
  source: ApiFolder | Record<string, unknown> | null | undefined,
): { x: number; y: number } {
  if (!source || typeof source !== "object") return { x: 50, y: 50 };
  const o = source as Record<string, unknown>;
  const x = readNumericField(o, "coverFocalX", "cover_focal_x");
  const y = readNumericField(o, "coverFocalY", "cover_focal_y");
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return {
    x: x == null ? 50 : clamp(x),
    y: y == null ? 50 : clamp(y),
  };
}

/** CSS `object-position` for folder cover thumbnails / hero. */
export function folderCoverObjectPositionStyle(folder: ApiFolder): { objectPosition: string } {
  const { x, y } = parseFolderCoverFocal(folder);
  return { objectPosition: `${x}% ${y}%` };
}

function pathFromShareUrlField(shareUrl: string): string | null {
  const trimmed = shareUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) {
    const i = trimmed.indexOf("#");
    return i >= 0 ? trimmed.slice(0, i) : trimmed;
  }
  try {
    const u = new URL(trimmed);
    return `${u.pathname}${u.search}` || null;
  } catch {
    return null;
  }
}

/** Client gallery lives at `/g/[token]` (see `app/g/[token]/page.tsx`). */
function pathToClientGalleryPath(pathWithSearch: string): string | null {
  const hashIdx = pathWithSearch.indexOf("#");
  const noHash = hashIdx >= 0 ? pathWithSearch.slice(0, hashIdx) : pathWithSearch;
  const qIdx = noHash.indexOf("?");
  const pathname = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const search = qIdx >= 0 ? noHash.slice(qIdx) : "";

  const trySegment = (rawSegment: string) => {
    let slug = rawSegment;
    try {
      slug = decodeURIComponent(rawSegment);
    } catch {
      slug = rawSegment;
    }
    if (!slug) return null;
    return `/g/${encodeURIComponent(slug)}${search}`;
  };

  const shareM = pathname.match(/^\/share\/(.+)$/);
  if (shareM) return trySegment(shareM[1]);

  const gM = pathname.match(/^\/g\/(.+)$/);
  if (gM) return trySegment(gM[1]);

  return null;
}

/**
 * Relative client-gallery path on this app (`/g/:token`).
 * Re-homes API URLs that used `/share/...` to `/g/...` so links match Next routes.
 */
export function getFolderSharePath(folder: ApiFolder): string | null {
  const code = folder.share?.slug ?? folder.share?.code;
  if (code) return `/g/${encodeURIComponent(code)}`;
  if (folder.shareUrl) {
    const raw = pathFromShareUrlField(folder.shareUrl);
    if (!raw) return null;
    return pathToClientGalleryPath(raw);
  }
  return null;
}

/** Same as {@link getFolderSharePath} — kept for existing imports. */
export function getFolderShareUrl(folder: ApiFolder): string | null {
  return getFolderSharePath(folder);
}

/** Absolute share URL on `appOrigin` (clipboard, "Open", email). */
export function getFolderShareAbsoluteUrl(
  folder: ApiFolder,
  appOrigin: string,
): string | null {
  const path = getFolderSharePath(folder);
  if (!path) return null;
  const origin = appOrigin.replace(/\/$/, "");
  return `${origin}${path}`;
}
