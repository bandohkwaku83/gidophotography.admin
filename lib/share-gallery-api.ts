import { apiUrl, API_BASE_URL, sameOriginUploadsUrl } from "@/lib/api";
import { parseFolderCoverFocal } from "@/lib/folders-api";

export type ShareGalleryAsset = {
  id: string;
  originalName: string;
  thumbUrl: string;
  selection: "SELECTED" | "UNSELECTED";
};

export type ShareGalleryFinal = {
  id: string;
  name: string;
  /** Full-resolution URL when unlocked; may still be present when locked for admin-style APIs. */
  url: string;
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
  assets: ShareGalleryAsset[];
  finals: ShareGalleryFinal[];
  counts?: { uploads: number; selected: number; finals: number };
};

type Raw = Record<string, unknown>;

export class ShareGalleryError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail;
  }
  return fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown, defaultVal = false): boolean {
  return typeof v === "boolean" ? v : defaultVal;
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
  const thumbRaw =
    str(o.thumbUrl) ||
    str(o.thumbnail) ||
    str(o.url) ||
    str(o.previewUrl) ||
    str(o.image) ||
    str(o.src);
  const thumbUrl = resolvePublicGalleryImageUrl(thumbRaw);
  if (!thumbUrl) return null;

  const sel = str(o.selection).toUpperCase();
  const selected =
    bool(o.selected) ||
    sel === "SELECTED" ||
    str(o.clientSelection).toUpperCase() === "SELECTED";

  return {
    id,
    originalName,
    thumbUrl,
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

  const coverRaw =
    str(folder?.coverImageUrl) ||
    str(folder?.coverImage) ||
    str((folder as Raw)?.cover_image_url) ||
    str((folder as Raw)?.cover_image) ||
    str(root.coverImageUrl) ||
    str(root.coverImage) ||
    str((root as Raw).cover_image_url) ||
    str((root as Raw).cover_image) ||
    (nested && typeof nested === "object"
      ? str((nested as Raw).coverImageUrl) || str((nested as Raw).coverImage)
      : "");
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
  console.log("[share:get]", { path, status: res.status, ok: res.ok, body });
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
  console.log("[share:selections:post]", { path, status: res.status, body });
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
  console.log("[share:selections:sync]", { path, status: res.status, body });
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
  console.log("[share:selections:clear]", { path, status: res.status, body });
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
  console.log("[share:selections:submit]", { path, status: res.status, body });
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

/** Locked-state preview image (watermarked / limited). Use as `<img src>` when `final.locked`. */
export function getShareFinalLockedPreviewUrl(shareToken: string, finalId: string): string {
  return apiUrl(
    `/api/share/${encodeURIComponent(shareToken)}/finals/${encodeURIComponent(finalId)}/locked-preview`,
  );
}
