import { apiUrl } from "@/lib/api";
import { resolveCoverUrl } from "@/lib/folders-api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import {
  setDuplicateUploadPreference,
  type DuplicateUploadAction,
} from "@/lib/upload-preferences";

/** Photographer settings from `GET`/`PUT /api/settings`. See `docs/backend-api-watermark-and-media.md`. */
export type ApiSettings = {
  /** When true, backend should generate watermarked previews for raw uploads (server-side). */
  watermarkPreviewImages: boolean;
  /** Relative path on server when present. */
  defaultCoverImage?: string;
  defaultCoverImageUrl?: string;
  /**
   * Default for `duplicateAction` on gallery uploads when the server stores it.
   * Falls back to {@link getDuplicateUploadPreference} when omitted.
   */
  duplicateUploadAction?: DuplicateUploadAction;
};

export type UpdateSettingsInput = {
  watermarkPreviewImages?: boolean;
  defaultCoverImage?: File | null;
  duplicateUploadAction?: DuplicateUploadAction;
};

export class SettingsApiError extends Error {
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
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new SettingsApiError("Your session has expired. Please log in again.", 401, null);
  }

  return res;
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

function normalizeSettingsPayload(raw: unknown): ApiSettings {
  const obj =
    raw &&
    typeof raw === "object" &&
    "settings" in raw &&
    (raw as { settings: unknown }).settings &&
    typeof (raw as { settings: unknown }).settings === "object"
      ? ((raw as { settings: Record<string, unknown> }).settings as Record<string, unknown>)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

  const dupRaw =
    obj.duplicateUploadAction ?? obj.duplicate_upload_action ?? obj.duplicateAction;
  let duplicateUploadAction: DuplicateUploadAction | undefined;
  if (dupRaw === "replace" || dupRaw === "ignore") {
    duplicateUploadAction = dupRaw;
  }

  const normalized: ApiSettings = {
    watermarkPreviewImages: Boolean(
      obj.watermarkPreviewImages ?? obj.watermark_preview_images,
    ),
    defaultCoverImage:
      typeof obj.defaultCoverImage === "string" ? obj.defaultCoverImage : undefined,
    defaultCoverImageUrl:
      typeof obj.defaultCoverImageUrl === "string" ? obj.defaultCoverImageUrl : undefined,
    duplicateUploadAction,
  };

  if (typeof window !== "undefined" && duplicateUploadAction) {
    setDuplicateUploadPreference(duplicateUploadAction);
  }

  return normalized;
}

/** Best URL to show the default cover from settings (matches folder cover resolution). */
export function getSettingsDefaultCoverUrl(settings: ApiSettings): string | null {
  return (
    resolveCoverUrl(settings.defaultCoverImageUrl ?? null) ??
    resolveCoverUrl(settings.defaultCoverImage ?? null)
  );
}

export async function getSettings(): Promise<ApiSettings> {
  const res = await authedFetch("/api/settings", { method: "GET" });
  const body = await parseJson(res);
  console.log("[settings:get] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new SettingsApiError(
      extractMessage(body, `Failed to load settings (${res.status})`),
      res.status,
      body,
    );
  }
  return normalizeSettingsPayload(body);
}

export async function updateSettings(input: UpdateSettingsInput): Promise<ApiSettings> {
  const coverFile = input.defaultCoverImage;
  const hasFile = coverFile instanceof File;

  let res: Response;
  if (hasFile) {
    const fd = new FormData();
    fd.append("defaultCoverImage", coverFile);
    if (input.watermarkPreviewImages !== undefined) {
      fd.append("watermarkPreviewImages", String(input.watermarkPreviewImages));
    }
    if (input.duplicateUploadAction !== undefined) {
      fd.append("duplicateUploadAction", input.duplicateUploadAction);
    }
    res = await authedFetch("/api/settings", { method: "PUT", body: fd });
  } else {
    const payload: Record<string, boolean | string> = {};
    if (input.watermarkPreviewImages !== undefined) {
      payload.watermarkPreviewImages = input.watermarkPreviewImages;
    }
    if (input.duplicateUploadAction !== undefined) {
      payload.duplicateUploadAction = input.duplicateUploadAction;
    }
    res = await authedFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const body = await parseJson(res);
  console.log("[settings:update] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new SettingsApiError(
      extractMessage(body, `Failed to save settings (${res.status})`),
      res.status,
      body,
    );
  }
  return normalizeSettingsPayload(body);
}
