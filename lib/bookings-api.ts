import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";
import type { BookedShoot, ShootKind } from "@/components/schedules/booking-types";
import { KIND_META } from "@/components/schedules/booking-types";
import { ApiError } from "@/lib/clients-api";

export type BookingShootTypeMeta = {
  id: string;
  label: string;
  color: string;
};

export type BookingsMetaResponse = {
  shootTypes: BookingShootTypeMeta[];
  legend: BookingShootTypeMeta[];
  clientsListPath?: string;
};

export type BookingsWeekSummary = {
  bookedCount: number;
  weekStartsAt: string;
  weekEndsAt: string;
};

export type ApiBookingClient = {
  _id: string;
  name: string;
  contact?: string;
  email?: string;
  location?: string;
} | null;

export type ApiBooking = {
  _id: string;
  title: string;
  client: ApiBookingClient;
  shootType: string;
  color?: string;
  startsAt: string;
  endsAt: string | null;
  location?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListBookingsResponse = {
  count?: number;
  bookings: ApiBooking[];
};

export type CreateBookingBody = {
  title: string;
  clientId: string;
  date: string;
  shootType: string;
  start: string;
  end: string;
  location: string;
  description: string;
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

/** Map API `shootType` string (e.g. `Wedding`, `Other`) to app shoot kind. */
export function apiShootTypeToKind(shootType: string): ShootKind {
  const k = shootType.trim().toLowerCase();
  const map: Record<string, ShootKind> = {
    wedding: "wedding",
    portraits: "portraits",
    portrait: "portraits",
    outdoor: "outdoor",
    birthday: "birthday",
    graduation: "graduation",
    commercial: "commercial",
    other: "other",
  };
  return map[k] ?? "other";
}

/** Tailwind dot class for API `color` keys (calendar / legend). */
export function apiColorToDotClass(color?: string): string | null {
  if (!color) return null;
  const c: Record<string, string> = {
    red: "bg-rose-500",
    purple: "bg-violet-500",
    green: "bg-emerald-500",
    pink: "bg-fuchsia-500",
    blue: "bg-indigo-500",
    orange: "bg-amber-500",
    sky: "bg-sky-500",
  };
  return c[color.trim().toLowerCase()] ?? null;
}

/** `HH:mm` (24h) → locale 12h string (e.g. `9:00 AM`) for POST /api/bookings. */
export function formatHmToApi12h(hm: string): string {
  const s = hm.trim();
  if (/am|pm/i.test(s)) return s;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return s;
  const d = new Date(2000, 0, 1, h, min, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Convert API booking → in-app row for schedules UI. */
export function mapApiBookingToBookedShoot(b: ApiBooking): BookedShoot {
  const client = b.client;
  const clientId = client?._id ?? "";
  const clientName = client?.name?.trim() || "Unknown client";

  const start = new Date(b.startsAt);
  const y = start.getFullYear();
  const mo = start.getMonth();
  const day = start.getDate();
  const date = `${y}-${pad2(mo + 1)}-${pad2(day)}`;
  const startTime = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;

  let endTime: string | undefined;
  if (b.endsAt) {
    const end = new Date(b.endsAt);
    endTime = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  }

  return {
    id: b._id,
    title: b.title,
    clientId,
    clientName,
    date,
    startTime,
    endTime,
    location: b.location?.trim() || undefined,
    kind: apiShootTypeToKind(b.shootType),
    description: b.description?.trim() || undefined,
    shootColor: b.color,
  };
}

export function kindToApiShootType(kind: ShootKind): string {
  return KIND_META[kind].label;
}

export async function getBookingsMeta(): Promise<BookingsMetaResponse> {
  const res = await authedFetch("/api/bookings/meta", { method: "GET" });
  const body = await parseJson(res);
  console.log("[bookings:meta] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Failed to load bookings meta (${res.status})`), res.status, body);
  }
  const root = body as Record<string, unknown>;
  const shootTypes = Array.isArray(root.shootTypes) ? (root.shootTypes as BookingShootTypeMeta[]) : [];
  const legend = Array.isArray(root.legend) ? (root.legend as BookingShootTypeMeta[]) : shootTypes;
  const clientsListPath = typeof root.clientsListPath === "string" ? root.clientsListPath : undefined;
  return { shootTypes, legend, clientsListPath };
}

export async function getBookingsWeekSummary(): Promise<BookingsWeekSummary> {
  const res = await authedFetch("/api/bookings/summary/week", { method: "GET" });
  const body = await parseJson(res);
  console.log("[bookings:week] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Failed to load week summary (${res.status})`), res.status, body);
  }
  const o = body as Record<string, unknown>;
  return {
    bookedCount: typeof o.bookedCount === "number" ? o.bookedCount : 0,
    weekStartsAt: typeof o.weekStartsAt === "string" ? o.weekStartsAt : "",
    weekEndsAt: typeof o.weekEndsAt === "string" ? o.weekEndsAt : "",
  };
}

export async function listBookings(params: {
  year: number;
  /** 1–12 (calendar month). */
  month: number;
  type?: string;
  from?: string;
  to?: string;
}): Promise<ListBookingsResponse> {
  const qs = new URLSearchParams();
  qs.set("year", String(params.year));
  qs.set("month", String(params.month));
  qs.set("type", params.type ?? "");
  qs.set("from", params.from ?? "");
  qs.set("to", params.to ?? "");
  const res = await authedFetch(`/api/bookings?${qs.toString()}`, { method: "GET" });
  const body = await parseJson(res);
  console.log("[bookings:list] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Failed to load bookings (${res.status})`), res.status, body);
  }
  const data = body as ListBookingsResponse;
  return {
    count: data?.count ?? data?.bookings?.length ?? 0,
    bookings: Array.isArray(data?.bookings) ? data.bookings : [],
  };
}

export async function getBooking(id: string): Promise<ApiBooking> {
  const res = await authedFetch(`/api/bookings/${encodeURIComponent(id)}`, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Failed to load booking (${res.status})`), res.status, body);
  }
  const o = body as { booking?: ApiBooking };
  if (o.booking && typeof o.booking === "object") return o.booking;
  return body as ApiBooking;
}

export async function createBooking(input: CreateBookingBody): Promise<{ message?: string; booking: ApiBooking }> {
  const res = await authedFetch("/api/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  console.log("[bookings:create] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Could not save booking (${res.status})`), res.status, body);
  }
  const o = body as { message?: string; booking?: ApiBooking };
  if (o.booking && typeof o.booking === "object") {
    return { message: o.message, booking: o.booking };
  }
  return { message: o.message, booking: body as ApiBooking };
}

export async function updateBooking(
  id: string,
  input: Partial<Pick<CreateBookingBody, "title" | "location" | "description">>,
): Promise<{ message?: string; booking: ApiBooking }> {
  const res = await authedFetch(`/api/bookings/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Could not update booking (${res.status})`), res.status, body);
  }
  const o = body as { message?: string; booking?: ApiBooking };
  if (o.booking && typeof o.booking === "object") {
    return { message: o.message, booking: o.booking };
  }
  return { message: o.message, booking: body as ApiBooking };
}

export async function deleteBooking(id: string): Promise<void> {
  const res = await authedFetch(`/api/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(extractMessage(body, `Could not delete booking (${res.status})`), res.status, body);
  }
}
