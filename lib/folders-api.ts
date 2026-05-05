import { apiUrl, API_BASE_URL, sameOriginUploadsUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import type { ApiClient } from "@/lib/clients-api";
import type { DemoAsset, DemoFinalAsset, FolderStatus } from "@/lib/demo-data";
import type { DuplicateUploadAction } from "@/lib/upload-preferences";

export type { DuplicateUploadAction } from "@/lib/upload-preferences";

export type ApiFolderShare = {
  enabled?: boolean;
  code?: string;
  slug?: string;
  sharedAt?: string | null;
  expiresAt?: string | null;
  viewCount?: number;
  linkExpiryPreset?: string | null;
  selectionSubmittedAt?: string | null;
  selectionLocked?: boolean;
  /** When true, client share treats finals as payment-locked until unlock (some backends nest here). */
  finalsLocked?: boolean;
};

/**
 * Raw / selection / final media row from folder detail API (shape may vary).
 * See `docs/backend-api-watermark-and-media.md`: `url` vs `displayUrl`, nested `selection[].raw`.
 */
export type ApiFolderMedia = {
  _id?: string;
  id?: string;
  filename?: string;
  originalName?: string;
  /** Common on GET folder `uploads` / upload responses */
  originalFilename?: string;
  name?: string;
  /** Whether this final is payment-locked for the client share (downloads disabled until unlock). */
  locked?: boolean;
  /** Primary file URL (often original / full-quality for admin views). */
  url?: string;
  /** When present, preferred URL for UI (e.g. watermarked preview when watermarking is enabled). */
  displayUrl?: string;
  thumbUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  image?: string;
  selected?: boolean;
  selection?: string;
  isSelected?: boolean;
  editStatus?: string;
  clientComment?: string;
  comment?: string;
  /** On selection rows: nested raw file (GET folder detail). */
  raw?: ApiFolderMedia;
  rawMediaId?: string;
};

export type ApiFolder = {
  _id: string;
  /** Usually populated as a full client object; fall back to id string just in case. */
  client: string | ApiClient;
  eventName?: string;
  eventDate: string;
  description: string;
  /** Relative path stored on the server (e.g. "uploads/covers/..."). */
  coverImage?: string;
  /** Fully-qualified URL when available (preferred for rendering). */
  coverImageUrl?: string;
  /** Stored path for optional gallery background music (e.g. uploads/gallery-music/...). */
  backgroundMusic?: string;
  /** Fully-qualified URL when available (admin; empty when disabled). */
  backgroundMusicUrl?: string;
  /** When false, share responses omit playable music URL for clients. Default true when omitted. */
  backgroundMusicEnabled?: boolean;
  /** Focal point for `object-position` on cover (0–100). Omitted = centered. */
  coverFocalX?: number;
  coverFocalY?: number;
  usingDefaultCover?: boolean;
  share?: ApiFolderShare;
  /** Fully-qualified shareable URL (e.g. https://example.com/share/<code>). */
  shareUrl?: string;
  shareExpired?: boolean;
  /** Backend workflow status (e.g. draft, completed). */
  status?: string;
  /** Some responses nest this under `share` only; see {@link ApiFolderShare.selectionLocked}. */
  selectionLocked?: boolean;
  /** Raw uploads (detail GET). */
  uploads?: ApiFolderMedia[];
  /** Client selection rows (detail GET). */
  selection?: ApiFolderMedia[];
  /** Delivered finals (detail GET). */
  finals?: ApiFolderMedia[];
  rawMedia?: ApiFolderMedia[];
  selectionMedia?: ApiFolderMedia[];
  finalMedia?: ApiFolderMedia[];
  /** When false, client gallery may hide final delivery UI until backend enables it. */
  finalDelivery?: boolean;
  /** When true, finals are payment-locked for the client until unlock (some backends send this without per-media `locked`). */
  finalsPaymentLocked?: boolean;
  /** Extra protection hints for client gallery (e.g. discourage saving screenshots). */
  rightsProtection?: boolean;
  /** Nested bucket some APIs use */
  media?: {
    raw?: ApiFolderMedia[];
    selections?: ApiFolderMedia[];
    selection?: ApiFolderMedia[];
    finals?: ApiFolderMedia[];
    final?: ApiFolderMedia[];
  };
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListFoldersResponse = {
  count?: number;
  folders: ApiFolder[];
};

export type CreateFolderInput = {
  clientId: string;
  eventName: string;
  eventDate: string;
  description: string;
  /** Share link expiry preset id, e.g. `30d`, `never` (must match API / share-link-expiry-presets). */
  linkExpiry: string;
  coverImage?: File | null;
  useDefaultCover?: boolean;
  /** 0–100; used with custom cover for client `object-position`. */
  coverFocalX?: number;
  coverFocalY?: number;
};

export type UpdateFolderInput = {
  eventName?: string;
  eventDate?: string;
  description?: string;
  coverImage?: File | null;
  useDefaultCover?: boolean;
  coverFocalX?: number;
  coverFocalY?: number;
  backgroundMusicEnabled?: boolean;
};

export class FoldersApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new FoldersApiError("Your session has expired. Please log in again.", 401, null);
  }

  return res;
}

/** FormData POST with upload progress (fetch does not expose upload progress). */
function authedFormDataPostWithProgress(
  path: string,
  formData: FormData,
  onProgress?: (loaded: number, total: number, lengthComputable: boolean) => void,
): Promise<unknown> {
  const url = apiUrl(path);
  const token = getAuthToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (ev) => {
      onProgress?.(ev.loaded, ev.total, ev.lengthComputable);
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        const t = xhr.responseText;
        if (t) parsed = JSON.parse(t) as unknown;
      } catch {
        parsed = null;
      }

      if (xhr.status === 401) {
        clearAuth();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        reject(new FoldersApiError("Your session has expired. Please log in again.", 401, parsed));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new FoldersApiError(
            extractMessage(parsed, `Request failed (${xhr.status})`),
            xhr.status,
            parsed,
          ),
        );
        return;
      }

      resolve(parsed);
    };

    xhr.onerror = () => {
      reject(new FoldersApiError("Network error while uploading.", 0, null));
    };

    xhr.onabort = () => {
      reject(new FoldersApiError("Upload was cancelled.", 0, null));
    };

    xhr.send(formData);
  });
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return fallback;
}

function buildFormData(
  fields: Record<string, string | boolean | undefined>,
  file?: File | null,
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    fd.append(key, typeof value === "boolean" ? String(value) : value);
  }
  if (file) {
    fd.append("coverImage", file);
  }
  return fd;
}

export async function listFolders(params: {
  clientId?: string;
  search?: string;
} = {}): Promise<ApiFolder[]> {
  const qs = new URLSearchParams();
  if (params.clientId) qs.set("clientId", params.clientId);
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await authedFetch(`/api/folders${suffix}`, { method: "GET" });
  const body = await parseJson(res);
  console.log("[folders:list] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to load folders (${res.status})`),
      res.status,
      body,
    );
  }
  if (Array.isArray(body)) return body as ApiFolder[];
  const data = body as ListFoldersResponse | null;
  return Array.isArray(data?.folders) ? data!.folders : [];
}

export async function getFolder(id: string): Promise<ApiFolder> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(id)}`, { method: "GET" });
  const body = await parseJson(res);
  console.log("[folders:get] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to load folder (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

export async function createFolder(input: CreateFolderInput): Promise<ApiFolder> {
  const useDefault = input.useDefaultCover === true || !input.coverImage;

  let res: Response;
  if (input.coverImage) {
    const fx = input.coverFocalX ?? 50;
    const fy = input.coverFocalY ?? 50;
    const fd = buildFormData(
      {
        client: input.clientId,
        eventName: input.eventName,
        eventDate: input.eventDate,
        description: input.description,
        linkExpiry: input.linkExpiry,
        useDefaultCover: useDefault ? "true" : undefined,
        coverFocalX: String(fx),
        coverFocalY: String(fy),
      },
      input.coverImage,
    );
    res = await authedFetch("/api/folders", { method: "POST", body: fd });
  } else {
    res = await authedFetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: input.clientId,
        eventName: input.eventName,
        eventDate: input.eventDate,
        description: input.description,
        useDefaultCover: true,
        linkExpiry: input.linkExpiry,
      }),
    });
  }

  const body = await parseJson(res);
  console.log("[folders:create] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to create folder (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

export async function updateFolder(
  id: string,
  input: UpdateFolderInput,
): Promise<ApiFolder> {
  const focalFields: Record<string, string> = {};
  if (input.coverFocalX !== undefined) {
    focalFields.coverFocalX = String(input.coverFocalX);
    focalFields.coverFocalY = String(input.coverFocalY ?? 50);
  }
  const fd = buildFormData(
    {
      eventName: input.eventName,
      eventDate: input.eventDate,
      description: input.description,
      useDefaultCover:
        input.useDefaultCover === undefined ? undefined : input.useDefaultCover ? "true" : "false",
      ...focalFields,
      backgroundMusicEnabled: input.backgroundMusicEnabled,
    },
    input.coverImage,
  );

  const res = await authedFetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: fd,
  });

  const body = await parseJson(res);
  console.log("[folders:update] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to update folder (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await parseJson(res);
  console.log("[folders:delete] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete folder (${res.status})`),
      res.status,
      body,
    );
  }
}

/** Multipart PUT: field `backgroundMusic` (one file). Replaces any previous track. */
export async function uploadFolderBackgroundMusic(
  folderId: string,
  file: File,
): Promise<ApiFolder> {
  const fd = new FormData();
  fd.append("backgroundMusic", file);
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/background-music`,
    {
      method: "PUT",
      body: fd,
    },
  );
  const body = await parseJson(res);
  console.log("[folders:background-music:put]", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Could not upload background music (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

export async function deleteFolderBackgroundMusic(folderId: string): Promise<ApiFolder> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/background-music`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  console.log("[folders:background-music:delete]", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Could not remove background music (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

/* ------------------------------------------------------------------ */
/* folder detail / share / media                                       */
/* ------------------------------------------------------------------ */

function unwrapFolder(body: unknown): ApiFolder {
  if (!body || typeof body !== "object") {
    return body as ApiFolder;
  }
  const root = body as Record<string, unknown>;
  if (root.folder && typeof root.folder === "object") {
    return root.folder as ApiFolder;
  }
  const data = root.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.folder && typeof d.folder === "object") {
      return d.folder as ApiFolder;
    }
    if (typeof d._id === "string" || typeof d.id === "string") {
      return data as ApiFolder;
    }
  }
  return body as ApiFolder;
}

export type ShareLinkExpiryPreset = {
  id: string;
  label: string;
  days?: number | null;
};

export const FALLBACK_SHARE_EXPIRY_PRESETS: ShareLinkExpiryPreset[] = [
  { id: "never", label: "Never", days: null },
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "60d", label: "60 days", days: 60 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "180d", label: "180 days", days: 180 },
  { id: "365d", label: "1 year", days: 365 },
];

function normalizeExpiryPresetEntry(x: unknown): ShareLinkExpiryPreset | null {
  if (typeof x === "string") {
    return { id: x, label: x };
  }
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const idRaw =
    typeof o.id === "string"
      ? o.id
      : typeof o.value === "string"
        ? o.value
        : null;
  if (!idRaw) return null;
  const label = typeof o.label === "string" ? o.label : idRaw;
  const days =
    typeof o.days === "number"
      ? o.days
      : o.days === null
        ? null
        : undefined;
  return { id: idRaw, label, days };
}

export async function getShareLinkExpiryPresets(): Promise<ShareLinkExpiryPreset[]> {
  const res = await authedFetch("/api/folders/share-link-expiry-presets", { method: "GET" });
  const body = await parseJson(res);
  console.log("[folders:expiry-presets] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to load expiry presets (${res.status})`),
      res.status,
      body,
    );
  }
  const out: ShareLinkExpiryPreset[] = [];
  const pushFromArray = (arr: unknown[]) => {
    for (const x of arr) {
      const p = normalizeExpiryPresetEntry(x);
      if (p) out.push(p);
    }
  };
  if (Array.isArray(body)) {
    pushFromArray(body);
    return out.length > 0 ? out : [...FALLBACK_SHARE_EXPIRY_PRESETS];
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["presets", "expiryPresets", "data", "options"]) {
      const arr = o[k];
      if (Array.isArray(arr)) {
        pushFromArray(arr);
        break;
      }
    }
  }
  return out.length > 0 ? out : [...FALLBACK_SHARE_EXPIRY_PRESETS];
}

export async function patchFolderShare(
  folderId: string,
  input: { selectionLocked?: boolean; clearSelectionSubmit?: boolean },
): Promise<ApiFolder> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/share`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  console.log("[folders:share:patch] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to update share (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

/** Optional FormData fields for folder raw/final uploads (`duplicateAction`, `uploadComplete`). */
export type UploadFolderMediaFormOptions = {
  duplicateAction?: DuplicateUploadAction;
  /** Append `uploadComplete=true` on the last file only (e.g. SMS / batch hooks). */
  markUploadComplete?: boolean;
};

/** Multipart fields for final delivery payment / lock (sent with each final file in the batch). */
export type FinalDeliveryUploadFields = {
  /** When true, omit balance and lock fields. When false, send amount and lock preference. */
  clientHasPaidForFinals: boolean;
  /** Amount still owed in GHS — required when clientHasPaidForFinals is false (API field name). */
  amountRemainingGHS?: string;
  /** When unpaid: lock previews until payment (backend + SMS flow). */
  lockImagesBeforeUpload?: boolean;
};

export type UploadFolderFinalMediaFormOptions = UploadFolderMediaFormOptions &
  Partial<FinalDeliveryUploadFields> & {
    /** Required when uploading exactly one final linked to a selection row (existing backend behavior). */
    selectionMediaId?: string;
  };

export type UploadFolderMediaResult = {
  lastBody: unknown;
  /** Sum of `ignoredDuplicatesCount` / `ignored_duplicates_count` from each response in the sequence. */
  ignoredDuplicatesCount: number;
};

/** Extract duplicate-skip count from a single upload JSON response. */
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

export type FolderMediaDuplicatePreviewKind = "raw" | "final";

function readHasConflicts(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const nested =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;
  const pick = (x: Record<string, unknown>) => x.hasConflicts ?? x.has_conflicts;
  const raw = pick(o) ?? (nested ? pick(nested) : undefined);
  return raw === true || raw === "true";
}

/**
 * Check whether any of the given filenames already exist for this folder before uploading bytes.
 * POST body: `{ kind, filenames }` (names only).
 */
export async function postFolderMediaDuplicatePreview(
  folderId: string,
  input: { kind: FolderMediaDuplicatePreviewKind; filenames: string[] },
): Promise<{ hasConflicts: boolean }> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/duplicate-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        filenames: input.filenames,
      }),
    },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Duplicate preview failed (${res.status})`),
      res.status,
      body,
    );
  }
  return { hasConflicts: readHasConflicts(body) };
}

export async function regenerateFolderShare(
  folderId: string,
  input: { clearSlug?: boolean; linkExpiry?: string },
): Promise<ApiFolder> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/share/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await parseJson(res);
  console.log("[folders:share:regenerate] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to regenerate share link (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

function appendFolderUploadFormFields(
  fd: FormData,
  opts: UploadFolderMediaFormOptions | undefined,
  fileIndex: number,
  fileCount: number,
): void {
  if (opts?.duplicateAction) {
    fd.append("duplicateAction", opts.duplicateAction);
  }
  if (opts?.markUploadComplete && fileIndex === fileCount - 1) {
    fd.append("uploadComplete", "true");
  }
}

/** Final-delivery payment fields (same on every file in the batch). */
function appendFinalDeliveryMultipartFields(
  fd: FormData,
  opts: UploadFolderFinalMediaFormOptions | undefined,
): void {
  if (!opts || opts.clientHasPaidForFinals === undefined) return;
  fd.append("clientHasPaidForFinals", opts.clientHasPaidForFinals ? "true" : "false");
  if (opts.clientHasPaidForFinals === false) {
    if (opts.amountRemainingGHS != null && String(opts.amountRemainingGHS).trim() !== "") {
      fd.append("amountRemainingGHS", String(opts.amountRemainingGHS).trim());
    }
    fd.append("lockImagesBeforeUpload", opts.lockImagesBeforeUpload === true ? "true" : "false");
  }
}

/**
 * Upload one file per request. A single huge multipart POST often fails when the browser
 * talks to Next.js (`/api` rewrite) instead of the API host directly—Postman hits :8000 and
 * avoids that hop. Sequential uploads do not cap how many images the user can add in one drop.
 */
export async function uploadFolderRawMedia(
  folderId: string,
  files: File[],
  onProgress?: (loaded: number, total: number, lengthComputable: boolean) => void,
  formOptions?: UploadFolderMediaFormOptions,
): Promise<UploadFolderMediaResult | null> {
  if (files.length === 0) {
    return null;
  }
  const path = `/api/folders/${encodeURIComponent(folderId)}/media/raw`;
  const totalBytes = Math.max(1, files.reduce((sum, f) => sum + f.size, 0));
  let bytesDone = 0;
  let lastBody: unknown;
  let ignoredDuplicatesCount = 0;
  const n = files.length;
  for (let i = 0; i < n; i++) {
    const file = files[i];
    const fd = new FormData();
    fd.append("files", file);
    appendFolderUploadFormFields(fd, formOptions, i, n);
    lastBody = await authedFormDataPostWithProgress(path, fd, (loaded) => {
      onProgress?.(bytesDone + loaded, totalBytes, true);
    });
    ignoredDuplicatesCount += readIgnoredDuplicatesCount(lastBody);
    bytesDone += file.size;
    onProgress?.(bytesDone, totalBytes, true);
  }
  console.log("[folders:media:raw] response", {
    ok: true,
    fileCount: files.length,
    ignoredDuplicatesCount,
    body: lastBody,
  });
  return { lastBody, ignoredDuplicatesCount };
}

export async function uploadFolderFinalMedia(
  folderId: string,
  files: File[],
  onProgress?: (loaded: number, total: number, lengthComputable: boolean) => void,
  formOptions?: UploadFolderFinalMediaFormOptions,
): Promise<UploadFolderMediaResult | null> {
  if (files.length === 0) {
    return null;
  }
  const path = `/api/folders/${encodeURIComponent(folderId)}/media/final`;
  const totalBytes = Math.max(1, files.reduce((sum, f) => sum + f.size, 0));
  let bytesDone = 0;
  let lastBody: unknown;
  let ignoredDuplicatesCount = 0;
  const n = files.length;
  const selectionMediaId = formOptions?.selectionMediaId;
  for (let i = 0; i < n; i++) {
    const file = files[i];
    const fd = new FormData();
    fd.append("files", file);
    if (selectionMediaId !== undefined && selectionMediaId !== "") {
      fd.append("selectionMediaId", selectionMediaId);
    }
    appendFinalDeliveryMultipartFields(fd, formOptions);
    appendFolderUploadFormFields(fd, formOptions, i, n);
    lastBody = await authedFormDataPostWithProgress(path, fd, (loaded) => {
      onProgress?.(bytesDone + loaded, totalBytes, true);
    });
    ignoredDuplicatesCount += readIgnoredDuplicatesCount(lastBody);
    bytesDone += file.size;
    onProgress?.(bytesDone, totalBytes, true);
  }
  console.log("[folders:media:final] response", {
    ok: true,
    fileCount: files.length,
    ignoredDuplicatesCount,
    body: lastBody,
  });
  return { lastBody, ignoredDuplicatesCount };
}

/** Admin: lock client final delivery / previews until payment (`PATCH …/final-delivery/lock`). */
export async function lockFolderFinalDelivery(
  folderId: string,
  input: { outstandingAmountGHS: number },
): Promise<ApiFolder> {
  const amount = input.outstandingAmountGHS;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new FoldersApiError("Outstanding amount must be a non-negative number.", 400, null);
  }
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/final-delivery/lock`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outstandingAmountGHS: amount }),
    },
  );
  const body = await parseJson(res);
  console.log("[folders:final-delivery:lock]", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Could not lock final delivery (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

/** Admin: unlock client final delivery after payment confirmed (`PATCH …/final-delivery/unlock`). */
export async function unlockFolderFinalDelivery(folderId: string): Promise<ApiFolder> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/final-delivery/unlock`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await parseJson(res);
  console.log("[folders:final-delivery:unlock]", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Could not unlock final delivery (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

export async function deleteFolderRawMedia(folderId: string, mediaId: string): Promise<void> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/raw/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  console.log("[folders:media:raw:delete] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete photo (${res.status})`),
      res.status,
      body,
    );
  }
}

export async function deleteFolderFinalMedia(folderId: string, mediaId: string): Promise<void> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/final/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  console.log("[folders:media:final:delete] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete final (${res.status})`),
      res.status,
      body,
    );
  }
}

/** Deletes every raw upload in the folder (`DELETE …/media/raw`). */
export async function deleteAllFolderRawMedia(folderId: string): Promise<void> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/raw`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  console.log("[folders:media:raw:deleteAll] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete all raw photos (${res.status})`),
      res.status,
      body,
    );
  }
}

/** Deletes every final in the folder (`DELETE …/media/final`). */
export async function deleteAllFolderFinalMedia(folderId: string): Promise<void> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/final`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  console.log("[folders:media:final:deleteAll] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete all finals (${res.status})`),
      res.status,
      body,
    );
  }
}

export async function patchFolderStatus(folderId: string, status: string): Promise<ApiFolder> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await parseJson(res);
  console.log("[folders:status:patch] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to update status (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

export function extractRawMediaList(folder: ApiFolder): ApiFolderMedia[] {
  const f = folder as Record<string, unknown>;
  for (const k of ["uploads", "rawMedia", "rawFiles", "mediaRaw"]) {
    const v = f[k];
    if (Array.isArray(v)) return v as ApiFolderMedia[];
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
  const nestedRaw = row.raw;
  if (nestedRaw && typeof nestedRaw === "object") {
    const r = nestedRaw as Record<string, unknown>;
    const selectionId =
      (typeof row._id === "string" && row._id) ||
      (typeof row.id === "string" && row.id) ||
      "";
    if (selectionId) {
      return {
        _id: selectionId,
        url: typeof r.url === "string" ? r.url : undefined,
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
        selected: true,
        selection: "SELECTED",
        isSelected: true,
      };
    }
  }
  return item as ApiFolderMedia;
}

export function extractSelectionMediaList(folder: ApiFolder): ApiFolderMedia[] {
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
  const f = folder as Record<string, unknown>;
  for (const k of ["finals", "finalMedia", "finalFiles"]) {
    const v = f[k];
    if (Array.isArray(v)) return v as ApiFolderMedia[];
  }
  const m = f.media;
  if (m && typeof m === "object") {
    const o = m as { finals?: ApiFolderMedia[]; final?: ApiFolderMedia[] };
    if (Array.isArray(o.finals)) return o.finals;
    if (Array.isArray(o.final)) return o.final;
  }
  return [];
}

function apiEditStatusToUi(s?: string): "NONE" | "IN_PROGRESS" | "EDITED" {
  const v = (s || "").toLowerCase().replace(/-/g, "_");
  if (v === "in_progress") return "IN_PROGRESS";
  if (v === "edited" || v === "complete" || v === "completed") return "EDITED";
  return "NONE";
}

/** Map API media row → in-app DemoAsset shape for folder detail UI. */
export function apiFolderMediaToDemoAsset(m: ApiFolderMedia): DemoAsset {
  const id = m._id || m.id || `m-${Math.random().toString(36).slice(2, 10)}`;
  const originalName =
    m.originalName || m.originalFilename || m.filename || m.name || "Photo";
  const thumbRaw = m.thumbUrl || m.thumbnailUrl || m.previewUrl || m.url || m.image || "";
  const thumbUrl = resolveCoverUrl(thumbRaw) || thumbRaw || "";
  const selected =
    m.selected === true ||
    (typeof m.selection === "string" && m.selection.toUpperCase() === "SELECTED") ||
    m.isSelected === true;
  return {
    id,
    originalName,
    selection: selected ? "SELECTED" : "UNSELECTED",
    editState: apiEditStatusToUi(m.editStatus),
    clientComment: m.clientComment || m.comment || "",
    hasEdited: false,
    thumbUrl,
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

function truthyFolderFlag(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

export function apiFolderMediaToFinal(m: ApiFolderMedia): DemoFinalAsset {
  const id = m._id || m.id || `f-${Math.random().toString(36).slice(2, 10)}`;
  const name = m.originalName || m.originalFilename || m.filename || m.name || "Final";
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
  return { id, name, url, locked };
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

/* ------------------------------------------------------------------ */
/* helpers used by UI                                                  */
/* ------------------------------------------------------------------ */

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

/** Absolute share URL on `appOrigin` (clipboard, “Open”, email). */
export function getFolderShareAbsoluteUrl(
  folder: ApiFolder,
  appOrigin: string,
): string | null {
  const path = getFolderSharePath(folder);
  if (!path) return null;
  const origin = appOrigin.replace(/\/$/, "");
  return `${origin}${path}`;
}
