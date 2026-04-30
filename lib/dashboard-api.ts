import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import type { ApiClient } from "@/lib/clients-api";
import type { ApiFolder } from "@/lib/folders-api";

export type DashboardUser = {
  _id: string;
  name: string;
  email: string;
};

export type DashboardStats = {
  totalClients: number;
  totalGalleries: number;
  inProgressGalleries: number;
  completedGalleries: number;
};

export type DashboardRecentGallery = {
  id: string;
  title?: string;
  clientName: string;
  coverImageUrl?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type DashboardActivityItem = {
  action: string;
  targetType: string;
  targetName?: string;
  galleryId?: string;
  at: string;
};

export type DashboardResponse = {
  user: DashboardUser;
  serverDate: string;
  stats: DashboardStats;
  recentGalleries: DashboardRecentGallery[];
  activity: DashboardActivityItem[];
};

export class DashboardApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Map dashboard recent gallery row to {@link ApiFolder} for shared card UI. */
export function dashboardRecentGalleryToApiFolder(g: DashboardRecentGallery): ApiFolder {
  const title = g.title?.trim() || "";
  const clientObj: ApiClient = {
    _id: `${g.id}-client`,
    name: g.clientName,
    email: "",
    contact: "",
    location: "",
  };
  return {
    _id: g.id,
    client: clientObj,
    eventName: title,
    eventDate: (g.createdAt ?? "").slice(0, 10),
    description: g.clientName,
    coverImageUrl: g.coverImageUrl,
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export function activityItemToLabel(a: DashboardActivityItem): string {
  const target = a.targetName?.trim() || a.targetType;
  return `${a.action} · ${target}`;
}

/**
 * GET /api/dashboard — aggregated stats, recent galleries, activity.
 * Requires a stored Bearer token. Uses same-origin `/api/dashboard` (Next rewrite → backend).
 */
export async function fetchDashboard(): Promise<DashboardResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new DashboardApiError("Not authenticated", 401, null);
  }

  const res = await fetch(apiUrl("/api/dashboard"), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new DashboardApiError("Your session has expired. Please log in again.", 401, null);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Dashboard request failed (${res.status})`;
    throw new DashboardApiError(msg, res.status, body);
  }

  return body as DashboardResponse;
}
