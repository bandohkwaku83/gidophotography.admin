import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";

export type UsageCategoryBreakdown = {
  bytes: number;
  percent_of_total: number;
};

export type UsageSummaryResponse = {
  total_storage_bytes: number;
  raws_size_bytes: number;
  selections_size_bytes: number;
  finals_size_bytes: number;
  by_category?: {
    raws?: UsageCategoryBreakdown;
    selections?: UsageCategoryBreakdown;
    finals?: UsageCategoryBreakdown;
  };
};

export type UsageGalleryClient = {
  id: string;
  name: string;
};

export type UsageGalleryRow = {
  id: string;
  name: string;
  client: UsageGalleryClient;
  raws_size_bytes: number;
  selections_size_bytes: number;
  finals_size_bytes: number;
  total_size_bytes: number;
};

export type UsageGalleriesResponse = {
  count: number;
  sort_by: string;
  order: string;
  galleries: UsageGalleryRow[];
};

export class UsageApiError extends Error {
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
    throw new UsageApiError("Your session has expired. Please log in again.", 401, null);
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

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function fetchUsageSummary(): Promise<UsageSummaryResponse> {
  const res = await authedFetch("/api/usage/summary", { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new UsageApiError(
      extractMessage(body, `Failed to load usage summary (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as Partial<UsageSummaryResponse>;
  const by = data.by_category;
  return {
    total_storage_bytes: num(data.total_storage_bytes),
    raws_size_bytes: num(data.raws_size_bytes),
    selections_size_bytes: num(data.selections_size_bytes),
    finals_size_bytes: num(data.finals_size_bytes),
    by_category:
      by && typeof by === "object"
        ? {
            raws:
              by.raws && typeof by.raws === "object"
                ? { bytes: num(by.raws.bytes), percent_of_total: num(by.raws.percent_of_total) }
                : undefined,
            selections:
              by.selections && typeof by.selections === "object"
                ? {
                    bytes: num(by.selections.bytes),
                    percent_of_total: num(by.selections.percent_of_total),
                  }
                : undefined,
            finals:
              by.finals && typeof by.finals === "object"
                ? { bytes: num(by.finals.bytes), percent_of_total: num(by.finals.percent_of_total) }
                : undefined,
          }
        : undefined,
  };
}

export type UsageGalleriesSortBy = "total_size" | "name";

export async function fetchUsageGalleries(params: {
  sortBy: UsageGalleriesSortBy;
  order: "asc" | "desc";
  signal?: AbortSignal;
}): Promise<UsageGalleriesResponse> {
  const qs = new URLSearchParams();
  qs.set("sort_by", params.sortBy);
  qs.set("order", params.order);
  const res = await authedFetch(`/api/usage/galleries?${qs.toString()}`, {
    method: "GET",
    signal: params.signal,
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new UsageApiError(
      extractMessage(body, `Failed to load gallery usage (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as Partial<UsageGalleriesResponse>;
  const galleries = Array.isArray(data.galleries) ? data.galleries : [];
  const normalized: UsageGalleryRow[] = galleries.map((g) => {
    const row = g as Partial<UsageGalleryRow>;
    const c = row.client;
    return {
      id: typeof row.id === "string" ? row.id : "",
      name: typeof row.name === "string" ? row.name : "",
      client: {
        id: c && typeof c === "object" && typeof c.id === "string" ? c.id : "",
        name: c && typeof c === "object" && typeof c.name === "string" ? c.name : "",
      },
      raws_size_bytes: num(row.raws_size_bytes),
      selections_size_bytes: num(row.selections_size_bytes),
      finals_size_bytes: num(row.finals_size_bytes),
      total_size_bytes: num(row.total_size_bytes),
    };
  });
  return {
    count: typeof data.count === "number" ? data.count : normalized.length,
    sort_by: typeof data.sort_by === "string" ? data.sort_by : params.sortBy,
    order: typeof data.order === "string" ? data.order : params.order,
    galleries: normalized,
  };
}
