import { apiUrl, sameOriginUploadsUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import { authedFetch, extractMessage, parseJson } from "@/lib/http";

import {
  resolveCoverUrl,
  type FolderMediaDuplicatePreviewKind,
} from "@/lib/folders/helpers";
import {
  type ApiFolder,
  type ApiFolderMedia,
  type ApiFolderSet,
  type BulkMediaSoftDeleteResult,
  type CreateFolderInput,
  type DuplicateUploadAction,
  FoldersApiError,
  type FolderMoveToTrashResult,
  type ListFoldersResponse,
  type ListFoldersTrashResponse,
  type ListFoldersMediaTrashParams,
  type ListFoldersMediaTrashResponse,
  type MediaSoftDeleteResult,
  type PurgeFoldersTrashPayload,
  type TrashFolderRow,
  type TrashMediaRow,
  type TrashPurgeResult,
  type TrashPurgeSkippedItem,
  type UpdateFolderInput,
} from "@/lib/folders/types";

// Re-export the public surface so existing `from "@/lib/folders-api"` imports keep working.
export * from "@/lib/folders/types";
export * from "@/lib/folders/helpers";

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

function readIsoField(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readRetentionDays(o: Record<string, unknown>): number {
  const raw = o.retentionDays ?? o.retention_days;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 30;
}

function parseMediaSoftDelete(body: unknown, fallbackKind: string): MediaSoftDeleteResult {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  let id = "";
  let kind = fallbackKind;
  const del = o.deleted;
  if (del && typeof del === "object") {
    const d = del as Record<string, unknown>;
    id = String(d._id ?? d.id ?? "");
    if (typeof d.kind === "string" && d.kind) kind = d.kind;
  }
  return {
    message: extractMessage(body, "Moved to trash."),
    deleted: { _id: id, kind },
    restoreBefore: readIsoField(o, "restoreBefore", "restore_before"),
  };
}

function parseBulkMediaSoftDelete(body: unknown): BulkMediaSoftDeleteResult {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const dc = o.deletedCount ?? o.deleted_count;
  const deletedCount =
    typeof dc === "number" && Number.isFinite(dc) ? Math.max(0, Math.floor(dc)) : 0;
  return {
    message: extractMessage(body, "Items moved to trash."),
    deletedCount,
    restoreBefore: readIsoField(o, "restoreBefore", "restore_before"),
  };
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

/** First non-empty string from object for any of the given keys (in order). */
function firstStringFrom(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Pick a raw image URL string for trashed media (aligned with folder grid / ApiFolderMedia).
 */
function pickTrashMediaImageRaw(
  media: Record<string, unknown> | null,
  root: Record<string, unknown>,
): string {
  const file =
    root.file && typeof root.file === "object" ? (root.file as Record<string, unknown>) : null;
  const objects = [media, file, root];
  const keyGroups = [
    ["thumbUrl", "thumb_url", "thumbnailUrl", "thumbnail_url", "thumbnail"],
    ["displayUrl", "display_url"],
    ["previewUrl", "preview_url"],
    ["url", "src", "image", "imageUrl", "image_url", "path", "filePath", "file_path", "publicUrl", "public_url"],
  ];
  for (const keys of keyGroups) {
    for (const obj of objects) {
      const s = firstStringFrom(obj, keys);
      if (s) return s;
    }
  }
  return "";
}

function resolveTrashMediaSrc(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return resolveCoverUrl(trimmed) || sameOriginUploadsUrl(trimmed);
}

function parseTrashMediaRow(entry: unknown): TrashMediaRow | null {
  if (!entry || typeof entry !== "object") return null;
  const r = entry as Record<string, unknown>;
  const media = r.media && typeof r.media === "object" ? (r.media as Record<string, unknown>) : null;
  const folderRaw = r.folder;
  const folder = folderRaw && typeof folderRaw === "object" ? (folderRaw as ApiFolder) : undefined;

  const folderId =
    typeof r.folderId === "string" && r.folderId
      ? r.folderId
      : typeof r.folder_id === "string" && r.folder_id
        ? r.folder_id
        : typeof folder?._id === "string" && folder._id
          ? folder._id
          : "";

  const mediaId =
    typeof r.mediaId === "string" && r.mediaId
      ? r.mediaId
      : typeof r.media_id === "string" && r.media_id
        ? r.media_id
        : media && typeof media._id === "string" && media._id
          ? media._id
          : typeof r._id === "string" && r._id
            ? r._id
            : "";

  if (!folderId || !mediaId) return null;

  const kind =
    typeof r.kind === "string" && r.kind
      ? r.kind
      : media && typeof media.kind === "string" && media.kind
        ? media.kind
        : "raw";

  const resolvedSrc = resolveTrashMediaSrc(pickTrashMediaImageRaw(media, r));
  const url = resolvedSrc || undefined;
  const thumbUrl = resolvedSrc || undefined;

  let originalFilename: string | undefined;
  if (media) {
    if (typeof media.originalFilename === "string" && media.originalFilename) {
      originalFilename = media.originalFilename;
    } else if (typeof media.original_filename === "string" && media.original_filename) {
      originalFilename = media.original_filename;
    } else if (typeof media.originalName === "string" && media.originalName) {
      originalFilename = media.originalName;
    } else if (typeof media.filename === "string" && media.filename) {
      originalFilename = media.filename;
    } else if (typeof media.name === "string" && media.name) {
      originalFilename = media.name;
    }
  }
  if (!originalFilename && typeof r.originalFilename === "string" && r.originalFilename) {
    originalFilename = r.originalFilename;
  }

  return {
    folderId,
    folder,
    mediaId,
    kind,
    deletedAt: readIsoField(r, "deletedAt", "deleted_at"),
    restoreBefore: readIsoField(r, "restoreBefore", "restore_before"),
    url,
    thumbUrl,
    originalFilename,
  };
}

function parseTrashMediaRowList(raw: unknown): TrashMediaRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TrashMediaRow[] = [];
  for (const row of raw) {
    const parsed = parseTrashMediaRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function listFoldersTrash(
  options: { mediaLimit?: number } = {},
): Promise<ListFoldersTrashResponse> {
  const qs = new URLSearchParams();
  if (options.mediaLimit != null) {
    const n = Math.min(500, Math.max(1, Math.floor(options.mediaLimit)));
    qs.set("mediaLimit", String(n));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await authedFetch(`/api/folders/trash${suffix}`, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to load trash (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const retentionDays = readRetentionDays(o);
  const rawRows = Array.isArray(o.folders) ? o.folders : [];
  const folders: TrashFolderRow[] = [];
  for (const row of rawRows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const folderRaw = r.folder;
    if (!folderRaw || typeof folderRaw !== "object") continue;
    folders.push({
      folder: folderRaw as ApiFolder,
      deletedAt: readIsoField(r, "deletedAt", "deleted_at"),
      restoreBefore: readIsoField(r, "restoreBefore", "restore_before"),
    });
  }
  const count = typeof o.count === "number" && Number.isFinite(o.count) ? o.count : folders.length;

  const dmSource = o.deletedMedia ?? o.deleted_media;
  const deletedMedia = parseTrashMediaRowList(dmSource);

  const dmt = o.deletedMediaTotal ?? o.deleted_media_total;
  const deletedMediaTotal =
    typeof dmt === "number" && Number.isFinite(dmt)
      ? Math.max(0, Math.floor(dmt))
      : deletedMedia.length;

  const dmpl = o.deletedMediaPreviewLimit ?? o.deleted_media_preview_limit;
  const deletedMediaPreviewLimit =
    typeof dmpl === "number" && Number.isFinite(dmpl)
      ? Math.max(0, Math.floor(dmpl))
      : deletedMedia.length;

  const dmph = o.deletedMediaPagingHint ?? o.deleted_media_paging_hint;
  const deletedMediaPagingHint =
    typeof dmph === "string" && dmph.trim() ? dmph.trim() : undefined;

  return {
    retentionDays,
    count,
    folders,
    deletedMedia,
    deletedMediaTotal,
    deletedMediaPreviewLimit,
    deletedMediaPagingHint,
  };
}

export async function listFoldersMediaTrash(
  params: ListFoldersMediaTrashParams = {},
): Promise<ListFoldersMediaTrashResponse> {
  const qs = new URLSearchParams();
  if (params.page != null) qs.set("page", String(Math.max(1, Math.floor(params.page))));
  if (params.limit != null) {
    qs.set("limit", String(Math.min(500, Math.max(1, Math.floor(params.limit)))));
  }
  if (params.folderId?.trim()) qs.set("folderId", params.folderId.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await authedFetch(`/api/folders/media/trash${suffix}`, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to load trashed media (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawItems = Array.isArray(o.items)
    ? o.items
    : Array.isArray(o.media)
      ? o.media
      : Array.isArray(o.deletedMedia)
        ? o.deletedMedia
        : Array.isArray(o.rows)
          ? o.rows
          : Array.isArray(o.data)
            ? o.data
            : [];
  const items = parseTrashMediaRowList(rawItems);

  const totalRaw = o.total ?? o.count ?? o.deletedMediaTotal ?? o.totalCount;
  const total =
    typeof totalRaw === "number" && Number.isFinite(totalRaw)
      ? Math.max(0, Math.floor(totalRaw))
      : items.length;

  const pageRaw = o.page ?? o.currentPage ?? o.current_page;
  const page =
    typeof pageRaw === "number" && Number.isFinite(pageRaw)
      ? Math.max(1, Math.floor(pageRaw))
      : 1;

  const limitRaw = o.limit ?? o.pageSize ?? o.page_size;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.max(1, Math.floor(limitRaw))
      : params.limit ?? 50;

  return { items, total, page, limit };
}

/** Restore a gallery from trash (`POST /api/folders/:id/restore`). */
export async function restoreFolderFromTrash(folderId: string): Promise<ApiFolder> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Restore failed (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "folder" in body) {
    return (body as { folder: ApiFolder }).folder;
  }
  return body as ApiFolder;
}

/** Restore a single soft-deleted media row (`POST /api/folders/:folderId/media/:mediaId/restore`). */
export async function restoreFolderTrashedMedia(
  folderId: string,
  mediaId: string,
): Promise<{ message: string; kind: string; mediaId: string }> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/${encodeURIComponent(mediaId)}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Restore failed (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    message: extractMessage(body, "Media restored"),
    kind: typeof o.kind === "string" ? o.kind : "",
    mediaId:
      typeof o.mediaId === "string"
        ? o.mediaId
        : typeof o.media_id === "string"
          ? o.media_id
          : mediaId,
  };
}

function parseTrashPurgeResult(body: unknown): TrashPurgeResult {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const skippedRaw = o.skipped;
  const skipped: TrashPurgeSkippedItem[] = [];
  if (Array.isArray(skippedRaw)) {
    for (const item of skippedRaw) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      const reason = typeof s.reason === "string" ? s.reason : "";
      skipped.push({
        folderId:
          typeof s.folderId === "string"
            ? s.folderId
            : typeof s.folder_id === "string"
              ? s.folder_id
              : undefined,
        mediaId:
          typeof s.mediaId === "string"
            ? s.mediaId
            : typeof s.media_id === "string"
              ? s.media_id
              : undefined,
        reason,
      });
    }
  }
  const pfc = o.purgedFolderCount ?? o.purged_folder_count;
  const pmc = o.purgedMediaCount ?? o.purged_media_count;
  return {
    message: extractMessage(body, "Trash purge completed."),
    purgedFolderCount:
      typeof pfc === "number" && Number.isFinite(pfc) ? Math.max(0, Math.floor(pfc)) : 0,
    purgedMediaCount:
      typeof pmc === "number" && Number.isFinite(pmc) ? Math.max(0, Math.floor(pmc)) : 0,
    skipped: skipped.length ? skipped : undefined,
  };
}

function buildPurgeTrashJsonBody(payload: PurgeFoldersTrashPayload): Record<string, unknown> {
  if ("all" in payload && payload.all === true) {
    return { all: true };
  }
  if ("purgeAll" in payload && payload.purgeAll === true) {
    return { purgeAll: true };
  }
  const sel = payload as { folderIds?: string[]; mediaIds?: string[] };
  const folderIds = sel.folderIds ?? [];
  const mediaIds = sel.mediaIds ?? [];
  const body: Record<string, unknown> = {};
  const f = folderIds.filter((id) => typeof id === "string" && id.trim());
  const m = mediaIds.filter((id) => typeof id === "string" && id.trim());
  if (f.length) body.folderIds = f;
  if (m.length) body.mediaIds = m;
  return body;
}

/**
 * Permanently purge soft-deleted folders and/or media (`POST /api/folders/trash/purge`).
 * Use `{ all: true }` to empty all trash, or pass `folderIds` / `mediaIds` for a partial purge.
 */
export async function purgeFoldersTrash(payload: PurgeFoldersTrashPayload): Promise<TrashPurgeResult> {
  const jsonBody = buildPurgeTrashJsonBody(payload);
  const res = await authedFetch("/api/folders/trash/purge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Trash purge failed (${res.status})`),
      res.status,
      body,
    );
  }
  return parseTrashPurgeResult(body);
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

export async function deleteFolder(id: string): Promise<FolderMoveToTrashResult> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to move gallery to trash (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const folderRaw = o.folder;
  if (!folderRaw || typeof folderRaw !== "object") {
    throw new FoldersApiError("Invalid response from server.", res.status, body);
  }
  return {
    message: extractMessage(
      body,
      "Gallery moved to trash; restore within the retention window or it will be permanently deleted.",
    ),
    deletedAt: readIsoField(o, "deletedAt", "deleted_at"),
    restoreBefore: readIsoField(o, "restoreBefore", "restore_before"),
    retentionDays: readRetentionDays(o),
    folder: folderRaw as ApiFolder,
  };
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
  input: {
    selectionLocked?: boolean;
    clearSelectionSubmit?: boolean;
    /** `null` clears the cap (unlimited). */
    maxClientSelections?: number | null;
  },
): Promise<ApiFolder> {
  const payload: Record<string, unknown> = {};
  if (input.selectionLocked !== undefined) payload.selectionLocked = input.selectionLocked;
  if (input.clearSelectionSubmit !== undefined) {
    payload.clearSelectionSubmit = input.clearSelectionSubmit;
  }
  if (input.maxClientSelections !== undefined) {
    payload.maxClientSelections = input.maxClientSelections;
  }
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/share`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
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
  /** Target sub-gallery for raw uploads; omit or null = General (uncategorized). */
  setId?: string | null;
  duplicateAction?: DuplicateUploadAction;
  /**
   * When true, each HTTP upload sends explicit `uploadComplete`: `false` on all but the last
   * file in this run, `true` on the last—so upload SMS (raw/final) schedules once per gallery batch.
   * When false/omitted, the field is not sent (legacy; server may debounce or require explicit complete via env).
   */
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

/** 1-based index of the file currently uploading, with total count in this batch (sequential uploads). */
export type FolderMediaBatchProgress = {
  fileIndex: number;
  fileCount: number;
};

/** Extract duplicate-skip count from a single upload JSON response. */
import { readIgnoredDuplicatesCount } from "@/lib/folders/helpers";

function readHasConflicts(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const nested =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;
  const pick = (x: Record<string, unknown>) => x.hasConflicts ?? x.has_conflicts;
  const raw = pick(o) ?? (nested ? pick(nested) : undefined);
  return raw === true || raw === "true";
}

function readConflictingFilenamesFromDuplicatePreview(body: unknown): string[] | undefined {
  const normalize = (raw: unknown): string[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const names = raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      uniq.push(n);
    }
    return uniq.length > 0 ? uniq : undefined;
  };

  const tryRecord = (r: Record<string, unknown> | null): string[] | undefined => {
    if (!r) return undefined;
    return (
      normalize(r.conflictingFilenames) ??
      normalize(r.conflicting_filenames) ??
      normalize(r.duplicateFilenames) ??
      normalize(r.duplicate_filenames) ??
      normalize(r.conflicts)
    );
  };

  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  const nested =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;
  return tryRecord(o) ?? tryRecord(nested);
}

/**
 * Check whether any of the given filenames already exist for this folder before uploading bytes.
 * POST body: `{ kind, filenames }` (names only).
 */
export async function postFolderMediaDuplicatePreview(
  folderId: string,
  input: {
    kind: FolderMediaDuplicatePreviewKind;
    filenames: string[];
    setId?: string | null;
  },
): Promise<{ hasConflicts: boolean; conflictingFilenames?: string[] }> {
  const requestBody: Record<string, unknown> = {
    kind: input.kind,
    filenames: input.filenames,
  };
  if (input.setId !== undefined) {
    requestBody.setId = input.setId;
  }
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/duplicate-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );
  const responseBody = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(responseBody, `Duplicate preview failed (${res.status})`),
      res.status,
      responseBody,
    );
  }
  const apiNames = readConflictingFilenamesFromDuplicatePreview(responseBody);
  return {
    hasConflicts: readHasConflicts(responseBody),
    ...(apiNames?.length ? { conflictingFilenames: apiNames } : {}),
  };
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
  if (opts?.setId !== undefined) {
    fd.append("setId", opts.setId == null ? "" : opts.setId);
  }
  if (opts?.duplicateAction) {
    fd.append("duplicateAction", opts.duplicateAction);
  }
  if (!opts?.markUploadComplete || fileCount <= 0) return;
  if (fileIndex === fileCount - 1) {
    fd.append("uploadComplete", "true");
  } else {
    fd.append("uploadComplete", "false");
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
  onProgress?: (
    loaded: number,
    total: number,
    lengthComputable: boolean,
    batch?: FolderMediaBatchProgress,
  ) => void,
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
    const batch: FolderMediaBatchProgress = { fileIndex: i + 1, fileCount: n };
    onProgress?.(bytesDone, totalBytes, true, batch);
    const fd = new FormData();
    fd.append("files", file);
    appendFolderUploadFormFields(fd, formOptions, i, n);
    lastBody = await authedFormDataPostWithProgress(path, fd, (loaded) => {
      onProgress?.(bytesDone + loaded, totalBytes, true, batch);
    });
    ignoredDuplicatesCount += readIgnoredDuplicatesCount(lastBody);
    bytesDone += file.size;
    onProgress?.(bytesDone, totalBytes, true, batch);
  }
  return { lastBody, ignoredDuplicatesCount };
}

export async function uploadFolderFinalMedia(
  folderId: string,
  files: File[],
  onProgress?: (
    loaded: number,
    total: number,
    lengthComputable: boolean,
    batch?: FolderMediaBatchProgress,
  ) => void,
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
    const batch: FolderMediaBatchProgress = { fileIndex: i + 1, fileCount: n };
    onProgress?.(bytesDone, totalBytes, true, batch);
    const fd = new FormData();
    fd.append("files", file);
    if (selectionMediaId !== undefined && selectionMediaId !== "") {
      fd.append("selectionMediaId", selectionMediaId);
    }
    appendFinalDeliveryMultipartFields(fd, formOptions);
    appendFolderUploadFormFields(fd, formOptions, i, n);
    lastBody = await authedFormDataPostWithProgress(path, fd, (loaded) => {
      onProgress?.(bytesDone + loaded, totalBytes, true, batch);
    });
    ignoredDuplicatesCount += readIgnoredDuplicatesCount(lastBody);
    bytesDone += file.size;
    onProgress?.(bytesDone, totalBytes, true, batch);
  }
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
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Could not unlock final delivery (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

export async function deleteFolderRawMedia(
  folderId: string,
  mediaId: string,
): Promise<MediaSoftDeleteResult> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/raw/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete photo (${res.status})`),
      res.status,
      body,
    );
  }
  return parseMediaSoftDelete(body, "raw");
}

export async function deleteFolderFinalMedia(
  folderId: string,
  mediaId: string,
): Promise<MediaSoftDeleteResult> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/final/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete final (${res.status})`),
      res.status,
      body,
    );
  }
  return parseMediaSoftDelete(body, "final");
}

/** Deletes every raw upload in the folder (`DELETE …/media/raw`). */
export async function deleteAllFolderRawMedia(folderId: string): Promise<BulkMediaSoftDeleteResult> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/raw`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete all raw photos (${res.status})`),
      res.status,
      body,
    );
  }
  return parseBulkMediaSoftDelete(body);
}

/** Deletes every final in the folder (`DELETE …/media/final`). */
export async function deleteAllFolderFinalMedia(
  folderId: string,
): Promise<BulkMediaSoftDeleteResult> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/media/final`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete all finals (${res.status})`),
      res.status,
      body,
    );
  }
  return parseBulkMediaSoftDelete(body);
}

export async function patchFolderStatus(folderId: string, status: string): Promise<ApiFolder> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to update status (${res.status})`),
      res.status,
      body,
    );
  }
  return unwrapFolder(body);
}

function mergeSetsIntoFolder(folder: ApiFolder, body: unknown): ApiFolder {
  if (!body || typeof body !== "object") return folder;
  const o = body as Record<string, unknown>;
  const nested =
    o.folder && typeof o.folder === "object" ? (o.folder as Record<string, unknown>) : o;
  const sets = nested.sets;
  if (!Array.isArray(sets)) return folder;
  return {
    ...folder,
    sets: sets as ApiFolder["sets"],
    generalMediaCount:
      typeof nested.generalMediaCount === "number"
        ? nested.generalMediaCount
        : folder.generalMediaCount,
    totalRawMediaCount:
      typeof nested.totalRawMediaCount === "number"
        ? nested.totalRawMediaCount
        : folder.totalRawMediaCount,
  };
}

function normalizeFolderSet(row: unknown): ApiFolderSet | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = typeof o._id === "string" ? o._id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !name) return null;
  return {
    _id: id,
    name,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : undefined,
    mediaCount: typeof o.mediaCount === "number" ? o.mediaCount : undefined,
    rawCount: typeof o.rawCount === "number" ? o.rawCount : undefined,
    selectionCount: typeof o.selectionCount === "number" ? o.selectionCount : undefined,
    finalCount: typeof o.finalCount === "number" ? o.finalCount : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  };
}

export async function listFolderSets(folderId: string): Promise<ApiFolderSet[]> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/sets`, {
    method: "GET",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to list sets (${res.status})`),
      res.status,
      body,
    );
  }
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested =
    root.folder && typeof root.folder === "object"
      ? (root.folder as Record<string, unknown>)
      : root;
  const rawSets =
    (Array.isArray(nested.sets) ? nested.sets : null) ??
    (Array.isArray(root.sets) ? root.sets : null) ??
    (Array.isArray(body) ? body : null) ??
    [];
  const sets = rawSets.map(normalizeFolderSet).filter((s): s is ApiFolderSet => !!s);
  return sets.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function createFolderSet(
  folderId: string,
  name: string,
): Promise<{ folder: ApiFolder; set: ApiFolderSet }> {
  const res = await authedFetch(`/api/folders/${encodeURIComponent(folderId)}/sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to create set (${res.status})`),
      res.status,
      body,
    );
  }
  const folder = await getFolder(folderId);
  const setRaw =
    body && typeof body === "object" && "set" in body
      ? normalizeFolderSet((body as { set: unknown }).set)
      : null;
  if (!setRaw?._id) {
    const sets = await listFolderSets(folderId);
    const exact = sets.find((s) => s.name === name.trim());
    const fallback = exact ?? sets[sets.length - 1];
    if (!fallback) {
      throw new FoldersApiError("Unexpected response from server.", res.status, body);
    }
    return { folder: mergeSetsIntoFolder(folder, body), set: fallback };
  }
  return { folder: mergeSetsIntoFolder(folder, body), set: setRaw };
}

export async function updateFolderSet(
  folderId: string,
  setId: string,
  input: { name?: string; sortOrder?: number },
): Promise<ApiFolder> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/sets/${encodeURIComponent(setId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to update set (${res.status})`),
      res.status,
      body,
    );
  }
  const folder = await getFolder(folderId);
  return mergeSetsIntoFolder(folder, body);
}

export async function deleteFolderSet(folderId: string, setId: string): Promise<ApiFolder> {
  const res = await authedFetch(
    `/api/folders/${encodeURIComponent(folderId)}/sets/${encodeURIComponent(setId)}`,
    { method: "DELETE" },
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new FoldersApiError(
      extractMessage(body, `Failed to delete set (${res.status})`),
      res.status,
      body,
    );
  }
  const folder = await getFolder(folderId);
  return mergeSetsIntoFolder(folder, body);
}
