import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import { ApiError } from "@/lib/clients-api";

/** Notification document from GET /api/notifications (fields may vary by backend). */
export type ApiNotification = {
  _id?: string;
  id?: string;
  title?: string;
  body?: string;
  message?: string;
  readAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  folder?: string | { _id?: string };
  shareIdentifier?: string;
  shareCode?: string;
  slug?: string;
  booking?: string | { _id?: string };
};

export type ListNotificationsResponse = {
  notifications: ApiNotification[];
  count?: number;
  total?: number;
  unreadCount?: number;
  skip?: number;
  limit?: number;
};

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), { ...init, headers });
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError("Your session has expired. Please log in again.", 401, null);
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
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export function notificationRecordId(n: ApiNotification): string {
  const id = n._id ?? n.id;
  return typeof id === "string" ? id : "";
}

export function notificationTitle(n: ApiNotification): string {
  const t = n.title?.trim();
  if (t) return t;
  return "Notification";
}

export function notificationBody(n: ApiNotification): string {
  const b = n.body?.trim();
  if (b) return b;
  const m = n.message?.trim();
  if (m) return m;
  return "";
}

export function isNotificationUnread(n: ApiNotification): boolean {
  return n.readAt == null || n.readAt === "";
}

export function formatNotificationWhen(iso: string | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function folderRefId(n: ApiNotification): string | undefined {
  const f = n.folder;
  if (typeof f === "string" && f.trim()) return f.trim();
  if (f && typeof f === "object" && typeof f._id === "string" && f._id.trim()) return f._id.trim();
  return undefined;
}

function shareToken(n: ApiNotification): string | undefined {
  const a = n.shareIdentifier?.trim();
  if (a) return a;
  const b = n.shareCode?.trim();
  if (b) return b;
  const c = n.slug?.trim();
  if (c) return c;
  return undefined;
}

function bookingRefId(n: ApiNotification): string | undefined {
  const b = n.booking;
  if (typeof b === "string" && b.trim()) return b.trim();
  if (b && typeof b === "object" && typeof b._id === "string" && b._id.trim()) return b._id.trim();
  return undefined;
}

/** In-app route for a notification, or null when there is no deep link. */
export function notificationTargetHref(n: ApiNotification): string | null {
  const folderId = folderRefId(n);
  const share = shareToken(n);
  const bookingId = bookingRefId(n);

  if (folderId) {
    if (share) return `/g/${encodeURIComponent(share)}`;
    return `/dashboard/folder/${encodeURIComponent(folderId)}`;
  }
  if (bookingId) {
    return `/dashboard/schedules?booking=${encodeURIComponent(bookingId)}`;
  }
  return null;
}

export async function getNotificationsUnreadCount(): Promise<number> {
  const res = await authedFetch("/api/notifications/unread-count", { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load unread count (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as Record<string, unknown>;
  const n = o.unreadCount;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export async function listNotifications(params: {
  limit?: number;
  skip?: number;
  unreadOnly?: boolean;
}): Promise<ListNotificationsResponse> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 30));
  qs.set("skip", String(params.skip ?? 0));
  qs.set("unreadOnly", params.unreadOnly === true ? "true" : "false");
  const res = await authedFetch(`/api/notifications?${qs.toString()}`, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Failed to load notifications (${res.status})`), res.status, body);
  }
  const data = body as ListNotificationsResponse;
  return {
    notifications: Array.isArray(data?.notifications) ? data.notifications : [],
    count: data?.count,
    total: data?.total,
    unreadCount: data?.unreadCount,
    skip: data?.skip,
    limit: data?.limit,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  const safe = id.trim();
  if (!safe) throw new ApiError("Missing notification id", 400, null);
  const res = await authedFetch(`/api/notifications/${encodeURIComponent(safe)}/read`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Could not mark read (${res.status})`), res.status, body);
  }
}

export async function markAllNotificationsRead(): Promise<{ modifiedCount?: number }> {
  const res = await authedFetch("/api/notifications/mark-all-read", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Could not mark all read (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as { modifiedCount?: number };
  return { modifiedCount: typeof o.modifiedCount === "number" ? o.modifiedCount : undefined };
}
