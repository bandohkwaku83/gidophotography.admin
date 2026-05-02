import { apiUrl } from "@/lib/api";
import { clearAuth, getAuthToken } from "@/lib/auth-demo";

export type ApiClient = {
  _id: string;
  name: string;
  email: string;
  contact: string;
  location: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ClientInput = {
  name: string;
  email: string;
  contact: string;
  location: string;
};

export type ListClientsResponse = {
  count: number;
  clients: ApiClient[];
};

export class ApiError extends Error {
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

export async function listClients(search = ""): Promise<ListClientsResponse> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await authedFetch(`/api/clients${qs}`, { method: "GET" });
  const body = await parseJson(res);
  console.log("[clients:list] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load clients (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as ListClientsResponse;
  return {
    count: data?.count ?? data?.clients?.length ?? 0,
    clients: Array.isArray(data?.clients) ? data.clients : [],
  };
}

export async function getClient(id: string): Promise<ApiClient> {
  const res = await authedFetch(`/api/clients/${encodeURIComponent(id)}`, { method: "GET" });
  const body = await parseJson(res);
  console.log("[clients:get] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load client (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "client" in body) {
    return (body as { client: ApiClient }).client;
  }
  return body as ApiClient;
}

export async function createClient(input: ClientInput): Promise<ApiClient> {
  const res = await authedFetch("/api/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  console.log("[clients:create] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to create client (${res.status})`),
      res.status,
      body,
    );
  }
  if (body && typeof body === "object" && "client" in body) {
    return (body as { client: ApiClient }).client;
  }
  return body as ApiClient;
}

export async function updateClient(
  id: string,
  input: Partial<ClientInput>,
): Promise<ApiClient> {
  const res = await authedFetch(`/api/clients/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  console.log("[clients:update] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to update client (${res.status})`),
      res.status,
      body,
    );
  }
  return (body as { client: ApiClient }).client;
}

export async function deleteClient(id: string): Promise<ApiClient> {
  const res = await authedFetch(`/api/clients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await parseJson(res);
  console.log("[clients:delete] response", { status: res.status, ok: res.ok, body });
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to delete client (${res.status})`),
      res.status,
      body,
    );
  }
  return (body as { client: ApiClient }).client;
}
