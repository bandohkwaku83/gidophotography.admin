import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import {
  GALLERY_PUBLIC_ORIGIN_HEADER,
  galleryPublicOriginHeaderValue,
} from "@/lib/public-site-origin";

/**
 * Base class for failures returned by an authenticated API call.
 *
 * Specific modules (clients, folders, share gallery, etc.) extend this so consumer code
 * can still narrow with `err instanceof FoldersApiError` if it wants module-specific
 * handling. New consumers should prefer `instanceof HttpError` when only the status /
 * message matters.
 */
export class HttpError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.body = body;
  }
}

/** Safe JSON parse — returns null on non-JSON / empty bodies. */
export async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Extract a human-readable error string from a JSON error body, falling back when no
 * recognisable field is present. Looks at `message`, `error`, `detail` (in order) so the
 * function works with both this app's API and other common backend conventions.
 */
export function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["message", "error", "detail"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return fallback;
}

/**
 * Authenticated fetch — attaches `Authorization: Bearer <token>`, sets a default
 * `Content-Type: application/json` when there is a body, and centralises 401 handling
 * (`clearAuth()` + browser navigation to `/login`).
 *
 * Caller is responsible for parsing the response and throwing typed errors.
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof Blob) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const galleryOrigin = galleryPublicOriginHeaderValue();
  if (galleryOrigin) {
    headers.set(GALLERY_PUBLIC_ORIGIN_HEADER, galleryOrigin);
  }

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new HttpError("Your session has expired. Please log in again.", 401, null);
  }

  return res;
}

type HttpErrorCtor<E extends HttpError> = new (message: string, status: number, body: unknown) => E;

/**
 * Convenience: do an authenticated request, parse JSON, throw a typed error on non-2xx.
 *
 * @example
 * const { clients } = await authedJson<{ clients: ApiClient[] }>("/api/clients", { method: "GET" }, "Failed to load clients");
 */
export async function authedJson<T>(
  path: string,
  init: RequestInit = {},
  fallbackError = "Request failed",
  ErrorCtor: HttpErrorCtor<HttpError> = HttpError,
): Promise<T> {
  const res = await authedFetch(path, init);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ErrorCtor(
      extractMessage(body, `${fallbackError} (${res.status})`),
      res.status,
      body,
    );
  }
  return body as T;
}
