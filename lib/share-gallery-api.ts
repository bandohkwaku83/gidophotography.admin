import { apiUrl, API_BASE_URL, sameOriginUploadsUrl } from "@/lib/api";
import { parseFolderCoverFocal } from "@/lib/folders-api";
import { extractMessage, HttpError, parseJson } from "@/lib/http";

export type ShareGalleryAsset = {
  id: string;
  originalName: string;
  thumbUrl: string;
  /** Larger / display-quality URL for full-screen preview when distinct from {@link thumbUrl}. */
  previewUrl?: string;
  /** MIME type of the original upload when provided (e.g. image/jpeg, video/mp4). */
  mimeType?: string;
  selection: "SELECTED" | "UNSELECTED";
};

export type ShareGalleryFinal = {
  id: string;
  name: string;
  /** Full-resolution URL when unlocked; may still be present when locked for admin-style APIs. */
  url: string;
  /** MIME type of the delivered file (e.g. image/jpeg, video/mp4). */
  mimeType?: string;
  /** When true, client should use locked preview only and cannot download full files until unlocked. */
  locked?: boolean;
  /** Optional explicit preview URL for locked state (watermarked / reduced). */
  lockedPreviewUrl?: string;
};

export type NormalizedShareGallery = {
  folderId?: string;
  clientName: string;
  eventName?: string;
  eventDate?: string;
  description?: string;
  /** Resolved absolute URL for folder cover when API provides coverImage / coverImageUrl. */
  coverImageUrl?: string;
  /** Cover focal for `object-position` (0–100), from folder when API provides it. */
  coverFocalX?: number;
  coverFocalY?: number;
  /** At least one successful submit; backend refreshes `share.selectionSubmittedAt` each time. Does not block editing. */
  selectionSubmitted: boolean;
  /** Editable unless photographer-locked; mirrors GET `canEditSelections` (`!share.selectionLocked`). */
  canEditSelections: boolean;
  /** Photographer lock only; never set by client submit. */
  selectionLocked: boolean;
  /** When false, hide final delivery tab until photographer enables it. */
  finalDelivery?: boolean;
  /** Hint for client UI to apply screenshot/download discouragement. */
  rightsProtection?: boolean;
  /** Absolute URL for optional looping background music (empty when disabled or not set). */
  backgroundMusicUrl?: string;
  /** When false, clients should not play music. Defaults to true when omitted. */
  backgroundMusicEnabled?: boolean;
  assets: ShareGalleryAsset[];
  finals: ShareGalleryFinal[];
  counts?: { uploads: number; selected: number; finals: number };
};

type Raw = Record<string, unknown>;

export class ShareGalleryError extends HttpError {}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown, defaultVal = false): boolean {
  return typeof v === "boolean" ? v : defaultVal;
}

/** Pick a URL string from a flat field or a nested `{ url | src | href | coverImageUrl }` object (API variance). */
function firstNonEmptyCoverRef(...parts: unknown[]): string {
  for (const p of parts) {
    if (p == null) continue;
    if (typeof p === "string") {
      const t = p.trim();
      if (t) return t;
      continue;
    }
    if (typeof p === "object" && !Array.isArray(p)) {
      const o = p as Raw;
      const inner =
        str(o.url) ||
        str(o.href) ||
        str(o.src) ||
        str(o.coverImageUrl) ||
        str(o.coverImage);
      if (inner) return inner;
    }
  }
  return "";
}

/** Embedded settings blobs that may carry `defaultCoverImageUrl` when the folder uses the studio default. */
function forEachSettingsBlob(
  root: Raw,
  folder: Raw | null,
  nested: Raw | null,
  visit: (o: Raw) => void,
): void {
  const candidates: unknown[] = [
    root.settings,
    root.photographerSettings,
    root.studioSettings,
    root.studio,
    folder?.settings,
    folder?.photographerSettings,
    nested?.settings,
    nested?.photographerSettings,
  ];
  for (const b of candidates) {
    if (b && typeof b === "object" && !Array.isArray(b)) visit(b as Raw);
  }
}

/** Share flag: explicit false / 0 / "false" / "no" → off; otherwise on (matches folder update accepted values). */
function shareTruthyOn(v: unknown): boolean {
  if (v === false || v === 0 || v === "0" || v === "false" || v === "no" || v === "NO") {
    return false;
  }
  return true;
}

/** Resolve image URLs the same way as folder covers (relative → same-origin or API base). */
export function resolvePublicGalleryImageUrl(url?: string | null): string {
  if (!url) return "";
  const normalized = sameOriginUploadsUrl(url.trim());
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) {
    if (API_BASE_URL) return `${API_BASE_URL}${normalized}`;
    return normalized;
  }
  if (API_BASE_URL) return `${API_BASE_URL}/${normalized}`;
  return `/${normalized}`;
}

function assetFromRow(item: unknown, idx: number): ShareGalleryAsset | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Raw;
  const id = str(o._id) || str(o.id) || `asset-${idx}`;
  const originalName =
    str(o.originalName) ||
    str(o.originalFilename) ||
    str(o.filename) ||
    str(o.name) ||
    str(o.fileName) ||
    `Photo ${idx + 1}`;
  const smallThumb =
    str(o.thumbUrl) ||
    str(o.thumbnailUrl) ||
    str(o.thumbnail) ||
    str(o.thumb) ||
    "";
  const largePreview =
    str(o.displayUrl) ||
    str(o.url) ||
    str(o.previewUrl) ||
    str(o.image) ||
    str(o.src) ||
    "";
  const thumbRaw = smallThumb || largePreview;
  const thumbUrl = resolvePublicGalleryImageUrl(thumbRaw);
  if (!thumbUrl) return null;

  const largeResolved = largePreview ? resolvePublicGalleryImageUrl(largePreview) : "";
  const previewUrl =
    largeResolved && largeResolved !== thumbUrl ? largeResolved : undefined;
  const mimeType =
    str(o.mimeType) ||
    str(o.mime_type) ||
    str(o.contentType) ||
    str(o.content_type) ||
    "";

  const sel = str(o.selection).toUpperCase();
  const selected =
    bool(o.selected) ||
    sel === "SELECTED" ||
    str(o.clientSelection).toUpperCase() === "SELECTED";

  return {
    id,
    originalName,
    thumbUrl,
    ...(previewUrl ? { previewUrl } : {}),
    ...(mimeType ? { mimeType } : {}),
    selection: selected ? "SELECTED" : "UNSELECTED",
  };
}

function finalFromRow(item: unknown, idx: number): ShareGalleryFinal | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Raw;
  const id = str(o._id) || str(o.id) || `final-${idx}`;
  const name =
    str(o.name) ||
    str(o.originalFilename) ||
    str(o.filename) ||
    str(o.originalName) ||
    `Final ${idx + 1}`;
  const urlRaw = str(o.url) || str(o.downloadUrl) || str(o.fileUrl);
  const mimeType =
    str(o.mimeType) ||
    str(o.mime_type) ||
    str(o.contentType) ||
    str(o.content_type) ||
    "";
  const lockedPreviewRaw =
    str(o.lockedPreviewUrl) ||
    str(o.locked_preview_url) ||
    str(o.previewUrlWhenLocked) ||
    str(o.lockedPreview);

  const truthy = (v: unknown) => v === true || v === "true";
  const lockStatus =
    str(o.lockStatus).toLowerCase() || str(o.lock_status).toLowerCase();
  const locked =
    bool(o.locked) ||
    truthy(o.isLocked) ||
    truthy(o.is_locked) ||
    truthy(o.paymentLocked) ||
    truthy(o.payment_locked) ||
    truthy(o.downloadLocked) ||
    truthy(o.download_locked) ||
    lockStatus === "locked";

  const url = resolvePublicGalleryImageUrl(urlRaw);
  const lockedPreviewUrl = lockedPreviewRaw
    ? resolvePublicGalleryImageUrl(lockedPreviewRaw)
    : "";

  if (!url && !lockedPreviewUrl) return null;

  return {
    id,
    name,
    url: url || lockedPreviewUrl,
    ...(mimeType ? { mimeType } : {}),
    locked,
    lockedPreviewUrl: lockedPreviewUrl || undefined,
  };
}

/**
 * Normalize common API shapes: `{ folder, assets }`, `{ data: { folder, photos } }`, top-level arrays, etc.
 */
export function normalizeShareGalleryBody(body: unknown): NormalizedShareGallery | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Raw;

  const nested =
    (root.data && typeof root.data === "object" ? (root.data as Raw) : null) ?? null;
  let folder: Raw | null =
    (root.folder && typeof root.folder === "object" ? (root.folder as Raw) : null) ??
    (nested?.folder && typeof nested.folder === "object" ? (nested.folder as Raw) : null) ??
    (nested && !nested.folder ? nested : null);

  /** Some APIs return the folder document at the root instead of `{ folder: { ... } }`. */
  if (
    !folder &&
    typeof (root as Raw)._id === "string" &&
    (Array.isArray((root as Raw).uploads) ||
      Array.isArray((root as Raw).finals) ||
      str((root as Raw).eventName).length > 0 ||
      ((root as Raw).client != null && typeof (root as Raw).client === "object"))
  ) {
    folder = root as Raw;
  }

  const share =
    folder?.share && typeof folder.share === "object" ? (folder.share as Raw) : null;

  const selectedIds = new Set<string>();
  if (folder && Array.isArray(folder.selection)) {
    for (const item of folder.selection) {
      if (item && typeof item === "object") {
        const o = item as Raw;
        const nestedRaw = o.raw && typeof o.raw === "object" ? (o.raw as Raw) : null;
        const rawMediaId =
          str(o.rawMediaId) ||
          (nestedRaw ? str(nestedRaw._id) : "") ||
          str(o._id) ||
          str(o.id);
        if (rawMediaId) selectedIds.add(rawMediaId);
      }
    }
  }

  const assetsRaw: unknown[] =
    folder && Array.isArray(folder.uploads)
      ? (folder.uploads as unknown[])
      : Array.isArray(root.assets)
        ? root.assets
        : Array.isArray(root.photos)
          ? root.photos
          : Array.isArray(root.images)
            ? root.images
            : Array.isArray(root.files)
              ? root.files
              : folder && Array.isArray(folder.assets)
                ? (folder.assets as unknown[])
                : folder && Array.isArray(folder.photos)
                  ? (folder.photos as unknown[])
                  : nested && Array.isArray(nested.assets)
                    ? (nested.assets as unknown[])
                    : nested && Array.isArray(nested.photos)
                      ? (nested.photos as unknown[])
                      : [];

  const finalsRaw: unknown[] =
    folder && Array.isArray(folder.finals)
      ? (folder.finals as unknown[])
      : Array.isArray(root.finals)
        ? root.finals
        : Array.isArray(root.finalAssets)
          ? root.finalAssets
          : folder && Array.isArray(folder.finalAssets)
            ? (folder.finalAssets as unknown[])
            : nested && Array.isArray(nested.finalAssets)
              ? (nested.finalAssets as unknown[])
              : [];

  const clientObj =
    root.client && typeof root.client === "object" ? (root.client as Raw) : null;
  const folderClient =
    folder?.client && typeof folder.client === "object" ? (folder.client as Raw) : null;

  const clientName =
    str(root.clientName) ||
    str(clientObj?.name) ||
    str(folderClient?.name) ||
    str(folder?.clientName) ||
    str(root.eventName) ||
    "Gallery";

  const eventName = str(folder?.eventName) || str(root.eventName) || undefined;

  const selectionLocked = bool(share?.selectionLocked);

  /** True once the client has submitted at least once (timestamp or explicit flags). Never implies read-only; editing follows {@link canEditSelections}. */
  const selectionSubmitted =
    (share != null && str(share.selectionSubmittedAt).length > 0) ||
    bool(share?.selectionSubmitted) ||
    bool(root.selectionSubmitted) ||
    bool(folder?.selectionSubmitted) ||
    str(root.selectionStatus).toLowerCase() === "submitted" ||
    str(folder?.selectionStatus).toLowerCase() === "submitted";

  /**
   * Editable unless photographer-locked. GET /api/share/:id should send this as `!share.selectionLocked`;
   * we fall back to that if the boolean is omitted.
   */
  const canEditSelections =
    typeof root.canEditSelections === "boolean"
      ? root.canEditSelections
      : typeof folder?.canEditSelections === "boolean"
        ? folder.canEditSelections
        : !selectionLocked;

  const assets: ShareGalleryAsset[] = [];
  for (let i = 0; i < assetsRaw.length; i++) {
    const a = assetFromRow(assetsRaw[i], i);
    if (!a) continue;
    if (selectedIds.has(a.id)) {
      a.selection = "SELECTED";
    }
    assets.push(a);
  }

  const finals: ShareGalleryFinal[] = [];
  for (let i = 0; i < finalsRaw.length; i++) {
    const f = finalFromRow(finalsRaw[i], i);
    if (f) finals.push(f);
  }

  const folderId =
    str(folder?._id) ||
    str(folder?.id) ||
    str(root.folderId) ||
    str(nested?.folderId) ||
    undefined;

  let counts: NormalizedShareGallery["counts"];
  const c = folder?.counts;
  if (c && typeof c === "object") {
    const o = c as Raw;
    counts = {
      uploads: typeof o.uploads === "number" ? o.uploads : assets.length,
      selected:
        typeof o.selected === "number"
          ? o.selected
          : assets.filter((x) => x.selection === "SELECTED").length,
      finals: typeof o.finals === "number" ? o.finals : finals.length,
    };
  } else {
    counts = undefined;
  }

  let coverRaw = firstNonEmptyCoverRef(
    folder?.coverImageUrl,
    folder?.coverImage,
    (folder as Raw)?.cover_image_url,
    (folder as Raw)?.cover_image,
    (folder as Raw)?.cover,
    (folder as Raw)?.effectiveCoverUrl,
    (folder as Raw)?.effective_cover_url,
    (folder as Raw)?.resolvedCoverUrl,
    (folder as Raw)?.resolved_cover_url,
    (folder as Raw)?.heroImageUrl,
    (folder as Raw)?.hero_image_url,
    nested && typeof nested === "object" ? (nested as Raw).coverImageUrl : null,
    nested && typeof nested === "object" ? (nested as Raw).coverImage : null,
    nested && typeof nested === "object" ? (nested as Raw).cover : null,
    root.coverImageUrl,
    root.coverImage,
    (root as Raw).cover_image_url,
    (root as Raw).cover_image,
    (root as Raw).cover,
  );

  if (!coverRaw) {
    forEachSettingsBlob(root, folder, nested, (o) => {
      if (coverRaw) return;
      coverRaw = firstNonEmptyCoverRef(
        o.defaultCoverImageUrl,
        o.defaultCoverImage,
        o.default_cover_image_url,
        o.default_cover_image,
      );
    });
  }

  if (!coverRaw && folder) {
    const o = folder as Raw;
    coverRaw = firstNonEmptyCoverRef(
      o.defaultCoverImageUrl,
      o.defaultCoverImage,
      o.default_cover_image_url,
      o.default_cover_image,
    );
  }

  const coverImageUrl = coverRaw ? resolvePublicGalleryImageUrl(coverRaw) : undefined;

  /** Focal may live on `folder`, on the response root, or only on root when folder is shaped oddly. */
  const focalPayload =
    folder && typeof folder === "object"
      ? ({ ...root, ...folder } as Record<string, unknown>)
      : (root as Record<string, unknown>);
  const focal = parseFolderCoverFocal(focalPayload);

  const folderPayload = folder ?? (root as Raw);

  const finalDelivery =
    typeof folderPayload.finalDelivery === "boolean"
      ? folderPayload.finalDelivery
      : typeof root.finalDelivery === "boolean"
        ? root.finalDelivery
        : typeof (folderPayload as Raw).final_delivery === "boolean"
          ? ((folderPayload as Raw).final_delivery as boolean)
          : typeof (root as Raw).final_delivery === "boolean"
            ? ((root as Raw).final_delivery as boolean)
            : undefined;

  const rightsProtection =
    typeof folderPayload.rightsProtection === "boolean"
      ? folderPayload.rightsProtection
      : typeof root.rightsProtection === "boolean"
        ? root.rightsProtection
        : typeof (folderPayload as Raw).rights_protection === "boolean"
          ? ((folderPayload as Raw).rights_protection as boolean)
          : typeof (root as Raw).rights_protection === "boolean"
            ? ((root as Raw).rights_protection as boolean)
            : undefined;

  const bgEnabledRaw =
    folderPayload.backgroundMusicEnabled ?? folder?.backgroundMusicEnabled ?? root.backgroundMusicEnabled;
  const backgroundMusicEnabled = shareTruthyOn(bgEnabledRaw);

  const bgUrlRaw =
    str(folder?.backgroundMusicUrl) ||
    str((folder as Raw | null)?.background_music_url) ||
    str(folderPayload.backgroundMusicUrl) ||
    str((folderPayload as Raw).background_music_url) ||
    str(root.backgroundMusicUrl) ||
    str((root as Raw).background_music_url) ||
    "";
  const backgroundMusicUrl =
    backgroundMusicEnabled && bgUrlRaw ? resolvePublicGalleryImageUrl(bgUrlRaw) : undefined;

  return {
    folderId,
    clientName,
    eventName,
    eventDate: str(folder?.eventDate) || str(root.eventDate) || undefined,
    description: str(folder?.description) || str(root.description) || undefined,
    coverImageUrl,
    coverFocalX: focal.x,
    coverFocalY: focal.y,
    selectionSubmitted,
    canEditSelections,
    selectionLocked,
    finalDelivery,
    rightsProtection,
    backgroundMusicUrl,
    backgroundMusicEnabled,
    assets,
    finals,
    counts,
  };
}

/**
 * Public (no auth) gallery payload for a share link token/slug/code.
 * Backend: `GET /api/share/:token`
 *
 * @param options.baseOrigin — When set (e.g. `https://example.com` from `headers()`), fetch uses
 *   `${baseOrigin}/api/share/...` so server-side metadata / OG works. Otherwise uses {@link apiUrl}.
 */
export async function getShareGallery(
  shareToken: string,
  signal?: AbortSignal,
  options?: { baseOrigin?: string },
): Promise<NormalizedShareGallery> {
  const path = `/api/share/${encodeURIComponent(shareToken)}`;
  const url =
    options?.baseOrigin != null && options.baseOrigin.length > 0
      ? `${options.baseOrigin.replace(/\/$/, "")}${path}`
      : apiUrl(path);
  const res = await fetch(url, {
    method: "GET",
    signal,
    ...(options?.baseOrigin
      ? { next: { revalidate: 120 } }
      : { cache: "no-store" }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Gallery could not be loaded (${res.status})`),
      res.status,
      body,
    );
  }
  const normalized = normalizeShareGalleryBody(body);
  if (!normalized) {
    throw new ShareGalleryError("Unexpected response from server.", res.status, body);
  }
  return normalized;
}

/**
 * Toggle/add one raw file to the client selection set.
 * Backend: `POST /api/share/:token/selections` with `{ rawMediaId }`.
 */
export async function postShareGallerySelection(
  shareToken: string,
  rawMediaId: string,
  signal?: AbortSignal,
): Promise<void> {
  const path = `/api/share/${encodeURIComponent(shareToken)}/selections`;
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawMediaId }),
    signal,
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Could not update selection (${res.status})`),
      res.status,
      body,
    );
  }
}

/**
 * Replace the full client selection set at once.
 * Backend: `POST /api/share/:token/selections/sync` with `{ rawMediaIds }`.
 */
export async function syncShareGallerySelections(
  shareToken: string,
  rawMediaIds: string[],
  signal?: AbortSignal,
): Promise<void> {
  const path = `/api/share/${encodeURIComponent(shareToken)}/selections/sync`;
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawMediaIds }),
    signal,
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Could not sync selections (${res.status})`),
      res.status,
      body,
    );
  }
}

/**
 * Clear client selections.
 * Backend: `DELETE /api/share/:token/selections/`
 */
export async function clearShareGallerySelections(
  shareToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const path = `/api/share/${encodeURIComponent(shareToken)}/selections/`;
  const res = await fetch(apiUrl(path), { method: "DELETE", signal });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Could not clear selections (${res.status})`),
      res.status,
      body,
    );
  }
}

/**
 * Client submits their picks to the photographer.
 * Backend: `POST /api/share/:token/selections/submit`
 */
export async function submitShareGallerySelectionsToPhotographer(
  shareToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const path = `/api/share/${encodeURIComponent(shareToken)}/selections/submit`;
  const res = await fetch(apiUrl(path), { method: "POST", signal });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Could not submit selections (${res.status})`),
      res.status,
      body,
    );
  }
}

/** Download URL for a delivered final (public, same as gallery load — no auth). */
export function getShareFinalDownloadUrl(shareToken: string, finalId: string): string {
  return apiUrl(
    `/api/share/${encodeURIComponent(shareToken)}/finals/${encodeURIComponent(finalId)}/download`,
  );
}

/**
 * Href for “save” on a delivered final.
 * Desktop: `/download` (filename + disposition from API).
 * Coarse-pointer / phones: Prefer {@link ShareGalleryFinal.url} so the asset opens inline and the OS
 * can offer **Save to Photos / Gallery**. The `/download` route is often `attachment`, which iOS/Android
 * send to **Files** instead of the photo library.
 */
export function getShareFinalSaveHref(
  shareToken: string,
  f: ShareGalleryFinal,
  options: { preferInlineImageViewer: boolean },
): string {
  if (!f.locked && options.preferInlineImageViewer && f.url?.trim()) {
    return f.url.trim();
  }
  return getShareFinalDownloadUrl(shareToken, f.id);
}

/** Safe filename (+ extension guess) for a single final (`File` / share sheet). */
function finalizeShareFinalFilename(displayName: string, mimeOrEmpty: string): string {
  const raw = displayName.trim() || "photo";
  const safe = raw.replace(/[/\\?*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "photo";
  if (/\.[a-z0-9]{2,10}$/i.test(safe)) return safe;
  const m = mimeOrEmpty.toLowerCase();
  let ext = ".jpg";
  if (m.includes("png")) ext = ".png";
  else if (m.includes("webp")) ext = ".webp";
  else if (m.includes("gif")) ext = ".gif";
  else if (m.includes("heic") || m.includes("heif")) ext = ".heic";
  return `${safe}${ext}`;
}

/** Same-origin full-quality bytes for Save / Share (no pop-ups). */
export async function fetchShareFinalDownloadBlob(
  shareToken: string,
  f: ShareGalleryFinal,
): Promise<Blob> {
  const res = await fetch(getShareFinalDownloadUrl(shareToken, f.id));
  const body = res.ok ? null : await parseJson(res);
  if (!res.ok) {
    throw new ShareGalleryError(
      extractMessage(body, `Could not download “${f.name}” (${res.status}).`),
      res.status,
      body,
    );
  }
  return res.blob();
}

/**
 * Uses `navigator.share({ files })` when available. Returns `true` if share ran or the user cancelled the sheet.
 */
export async function tryNavigatorShareFinalPhoto(blob: Blob, displayName: string): Promise<boolean> {
  return webSharePhotoFile(blob, displayName);
}

async function webSharePhotoFile(blob: Blob, displayName: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;

  const mime =
    blob.type?.trim() || "image/jpeg";
  const fname = finalizeShareFinalFilename(displayName, mime);

  try {
    const file = new File([blob], fname, { type: mime });
    const payload: ShareData & { files: File[] } = {
      files: [file],
      title: fname,
    };
    if (typeof navigator.canShare === "function" && !navigator.canShare(payload)) {
      return false;
    }
    // If `canShare` is missing (older WebKit), attempt `share({ files })` anyway.
    await navigator.share(payload);
    return true;
  } catch (e) {
    const aborted =
      e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string })?.name === "AbortError";
    // User dismissed share sheet counts as handled.
    if (aborted) return true;
    return false;
  }
}

export type ShareFinalZipEntry = { id: string; name: string };

function safeZipEntryName(original: string, used: Map<string, number>): string {
  const cleaned =
    (original.trim() || "photo").replace(/[/\\?*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "photo";
  const n = (used.get(cleaned) ?? 0) + 1;
  used.set(cleaned, n);
  if (n === 1) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  if (dot > 0) {
    return `${cleaned.slice(0, dot)} (${n})${cleaned.slice(dot)}`;
  }
  return `${cleaned} (${n})`;
}

/**
 * Fetch each final via public download URLs and trigger a single .zip download in the browser.
 * Only pass finals that are unlocked for download.
 */
export async function downloadShareFinalsZip(
  shareToken: string,
  finals: ShareFinalZipEntry[],
): Promise<void> {
  if (finals.length === 0) return;
  if (typeof window === "undefined") return;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Map<string, number>();

  for (const f of finals) {
    const url = getShareFinalDownloadUrl(shareToken, f.id);
    const res = await fetch(url);
    if (!res.ok) {
      const body = await parseJson(res);
      throw new ShareGalleryError(
        extractMessage(body, `Could not download “${f.name}” (${res.status}).`),
        res.status,
        body,
      );
    }
    const buf = await res.arrayBuffer();
    zip.file(safeZipEntryName(f.name || `final-${f.id}`, used), buf);
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeToken = shareToken.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "gallery";
  const filename = `finals-${safeToken}.zip`;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Locked-state preview image (watermarked / limited). Use as `<img src>` when `final.locked`. */
export function getShareFinalLockedPreviewUrl(shareToken: string, finalId: string): string {
  return apiUrl(
    `/api/share/${encodeURIComponent(shareToken)}/finals/${encodeURIComponent(finalId)}/locked-preview`,
  );
}
