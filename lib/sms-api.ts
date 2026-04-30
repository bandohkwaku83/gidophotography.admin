import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";

export type SmsPlaceholder = {
  key: string;
  token: string;
  label: string;
};

export type SmsRecipientTypeOption = {
  id: string;
  label: string;
};

export type SmsMeta = {
  placeholders: SmsPlaceholder[];
  recipientTypes: SmsRecipientTypeOption[];
  configured: boolean;
};

export type SmsMessageRow = {
  _id: string;
  recipientName: string;
  recipientPhone: string;
  recipientKind: string;
  message: string;
  messageLength: number;
  status: string;
  costGHS: number;
  errorMessage?: string;
  client?: string;
  folder?: string;
  recipientType?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ListSmsMessagesResponse = {
  messages: SmsMessageRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type SendSmsInput = {
  recipientType: string;
  message: string;
  folderId?: string;
  clientId?: string;
};

export type SendSmsResponse = {
  message: string;
  summary: { sent: number; failed: number; skipped: number };
  results: Array<{ id: string; clientId: string; status: string }>;
  skipped: unknown[];
};

export class SmsApiError extends Error {
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
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new SmsApiError("Your session has expired. Please log in again.", 401, null);
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

export async function getSmsMeta(): Promise<SmsMeta> {
  const res = await authedFetch("/api/sms/meta", { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new SmsApiError(
      extractMessage(body, `Failed to load SMS settings (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as Partial<SmsMeta>;
  return {
    placeholders: Array.isArray(data.placeholders) ? data.placeholders : [],
    recipientTypes: Array.isArray(data.recipientTypes) ? data.recipientTypes : [],
    configured: Boolean(data.configured),
  };
}

export async function listSmsMessages(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: "" | "sent" | "failed" | "skipped";
}): Promise<ListSmsMessagesResponse> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 10));
  qs.set("search", params.search ?? "");
  qs.set("status", params.status ?? "");
  const res = await authedFetch(`/api/sms/messages?${qs.toString()}`, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new SmsApiError(
      extractMessage(body, `Failed to load messages (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as Partial<ListSmsMessagesResponse>;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const p = data.pagination;
  return {
    messages,
    pagination: {
      page: typeof p?.page === "number" ? p.page : 1,
      limit: typeof p?.limit === "number" ? p.limit : 10,
      total: typeof p?.total === "number" ? p.total : messages.length,
      totalPages: typeof p?.totalPages === "number" ? p.totalPages : 1,
    },
  };
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResponse> {
  const payload: Record<string, string> = {
    recipientType: input.recipientType,
    message: input.message,
    folderId: input.folderId ?? "",
  };
  /** Backend matches folder APIs: Mongo ref field is `client`. */
  if (input.clientId) payload.client = input.clientId;

  const res = await authedFetch("/api/sms/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new SmsApiError(
      extractMessage(body, `Send failed (${res.status})`),
      res.status,
      body,
    );
  }
  return body as SendSmsResponse;
}
