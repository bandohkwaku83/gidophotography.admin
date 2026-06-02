import type { ApiClient } from "@/lib/clients-api";
import { HttpError } from "@/lib/http";

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
  /** Max photos the client may select; null/omitted = unlimited. */
  maxClientSelections?: number | null;
  /** When true, client share treats finals as payment-locked until unlock (some backends nest here). */
  finalsLocked?: boolean;
};

/**
 * Raw / selection / final media row from folder detail API (shape may vary).
 * See `docs/backend-api-watermark-and-media.md`: `url` vs `displayUrl`, nested `selection[].raw`.
 */
export type ApiFolderSet = {
  _id: string;
  name: string;
  sortOrder?: number;
  mediaCount?: number;
  rawCount?: number;
  selectionCount?: number;
  finalCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** Grouped media bucket from folder/share detail (`uploadsBySet`, etc.). */
export type ApiFolderMediaBySetBucket = {
  setId?: string | null;
  setName?: string;
  media?: ApiFolderMedia[];
};

export type ApiFolderMedia = {
  _id?: string;
  id?: string;
  /** Sub-gallery set id for raw uploads; null/omitted = General (uncategorized). */
  setId?: string | null;
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
  /** MIME/content type for image and video handling. */
  mimeType?: string;
  mime_type?: string;
  contentType?: string;
  content_type?: string;
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
  /** Max photos the client may select on the share gallery; null/omitted = unlimited. */
  maxClientSelections?: number | null;
  /** Named sub-galleries within this folder (e.g. “At the park”, “Exclusives”). */
  sets?: ApiFolderSet[];
  /** Raw uploads not assigned to a set. */
  generalMediaCount?: number;
  totalRawMediaCount?: number;
  /** Raw uploads (detail GET). */
  uploads?: ApiFolderMedia[];
  /** Raw uploads grouped by set (detail GET / share GET). */
  uploadsBySet?: ApiFolderMediaBySetBucket[];
  /** Client selection rows (detail GET). */
  selection?: ApiFolderMedia[];
  /** Client selections grouped by set. */
  selectionBySet?: ApiFolderMediaBySetBucket[];
  /** Delivered finals (detail GET). */
  finals?: ApiFolderMedia[];
  /** Finals grouped by set. */
  finalsBySet?: ApiFolderMediaBySetBucket[];
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
  /** When set, folder is in trash (soft-delete). */
  deletedAt?: string | null;
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

/** Response when moving a gallery to trash (`DELETE /api/folders/:id`). */
export type FolderMoveToTrashResult = {
  message: string;
  deletedAt: string;
  restoreBefore: string;
  retentionDays: number;
  folder: ApiFolder;
};

export type TrashFolderRow = {
  folder: ApiFolder;
  deletedAt: string;
  restoreBefore: string;
};

/** Single trashed media row (`deletedBy: "media"`) from trash or media-trash APIs. */
export type TrashMediaRow = {
  folderId: string;
  folder?: ApiFolder;
  mediaId: string;
  kind: string;
  deletedAt: string;
  restoreBefore: string;
  url?: string;
  thumbUrl?: string;
  originalFilename?: string;
};

export type ListFoldersTrashResponse = {
  retentionDays: number;
  count: number;
  folders: TrashFolderRow[];
  deletedMedia: TrashMediaRow[];
  /** Full count of trashed media (may exceed `deletedMedia.length`). */
  deletedMediaTotal: number;
  /** Server chunk size for embedded `deletedMedia` (for aligning paginated fetches). */
  deletedMediaPreviewLimit: number;
  /** When more rows exist than embedded, backend may point at the paginated route. */
  deletedMediaPagingHint?: string;
};

/** Paginated trashed media (`GET /api/folders/media/trash`). */
export type ListFoldersMediaTrashParams = {
  page?: number;
  limit?: number;
  folderId?: string;
};

export type ListFoldersMediaTrashResponse = {
  items: TrashMediaRow[];
  page: number;
  limit: number;
  total: number;
};

/** `POST /api/folders/trash/purge` — permanent delete (not restore). */
export type TrashPurgeSkippedItem = {
  mediaId?: string;
  folderId?: string;
  reason: string;
};

export type TrashPurgeResult = {
  message: string;
  purgedFolderCount: number;
  purgedMediaCount: number;
  skipped?: TrashPurgeSkippedItem[];
};

export type PurgeFoldersTrashPayload =
  | { all: true }
  | { purgeAll: true }
  | { folderIds?: string[]; mediaIds?: string[] };

export type SoftDeletedMediaRef = {
  _id: string;
  kind: string;
};

export type MediaSoftDeleteResult = {
  message: string;
  deleted: SoftDeletedMediaRef;
  restoreBefore: string;
};

export type BulkMediaSoftDeleteResult = {
  message: string;
  deletedCount: number;
  restoreBefore: string;
};

export class FoldersApiError extends HttpError {}
