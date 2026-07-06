import { ApiError } from "@/lib/clients-api";
import {
  STUDIO_ADDRESS,
  STUDIO_EMAIL,
  STUDIO_NAME,
  STUDIO_PHONE,
  STUDIO_WEBSITE_URL,
} from "@/lib/branding";
import { authedFetch, extractMessage, parseJson } from "@/lib/http";
import type {
  InvoiceBillTo,
  InvoiceDraft,
  InvoiceLineItem,
  InvoicePaymentStatus,
} from "@/lib/invoices-types";

// ---------------------------------------------------------------------------
// API types (mirror backend responses)
// ---------------------------------------------------------------------------

export type ApiInvoiceBillTo = InvoiceBillTo;

export type ApiInvoiceBilledFrom = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
};

export type ApiInvoiceItem = InvoiceLineItem;

/** List row from `GET /api/invoices`. */
export type ApiInvoiceSummary = {
  _id: string;
  savedAt: string;
  createdAt?: string;
  updatedAt?: string;
  invoiceNo: string;
  invoiceDateISO: string;
  dueDateISO: string;
  shootDateISO?: string;
  bookingId?: string;
  clientId?: string;
  title?: string;
  shootType?: string;
  billTo: ApiInvoiceBillTo;
  totalGHS: number;
  amountPayingGHS?: number;
  paymentStatus?: InvoicePaymentStatus;
  paymentPercent?: number;
  currency: "GHS";
};

/** Full document from `GET /api/invoices/:id` and write responses. */
export type ApiInvoice = ApiInvoiceSummary & {
  photographerId?: string;
  billedFrom: ApiInvoiceBilledFrom;
  notes?: string;
  items: ApiInvoiceItem[];
  taxRate: number;
  subtotalGHS: number;
  taxGHS: number;
};

export type InvoiceMetaResponse = {
  nextInvoiceNoPreview: string;
};

export type ListInvoicesResponse = {
  count: number;
  invoices: ApiInvoiceSummary[];
};

export type ListInvoicesParams = {
  bookingId?: string;
  clientId?: string;
  /** Filter by invoiceDateISO (YYYY-MM-DD). */
  from?: string;
  to?: string;
};

/**
 * Writable invoice fields. Do not send `invoiceNo`, totals, or payment fields —
 * the server assigns / recomputes them.
 */
export type CreateInvoiceBody = {
  bookingId?: string;
  title?: string;
  shootType?: string;
  shootDateISO?: string;
  /** Optional on create; server defaults to today + 7 days. */
  dueDateISO?: string;
  billTo: ApiInvoiceBillTo;
  billedFrom: ApiInvoiceBilledFrom;
  items: ApiInvoiceItem[];
  amountPayingGHS?: number;
  notes?: string;
  taxRate?: number;
};

export type PatchInvoiceBody = Partial<CreateInvoiceBody>;

/** Drop-in replacement for `StoredInvoice` from `invoices-storage.ts`. */
export type StoredInvoiceRow = {
  id: string;
  savedAtISO: string;
  draft: InvoiceDraft;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function defaultBilledFrom(): ApiInvoiceBilledFrom {
  return {
    name: STUDIO_NAME,
    email: STUDIO_EMAIL,
    phone: STUDIO_PHONE,
    website: STUDIO_WEBSITE_URL,
    address: STUDIO_ADDRESS,
  };
}

function normalizeBillTo(raw: unknown): ApiInvoiceBillTo {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    name: str(o.name) ?? "Client",
    email: str(o.email),
    address: str(o.address),
  };
}

function normalizeBilledFrom(raw: unknown): ApiInvoiceBilledFrom {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = defaultBilledFrom();
  return {
    name: str(o.name) ?? base.name,
    email: str(o.email) ?? base.email,
    phone: str(o.phone) ?? base.phone,
    website: str(o.website) ?? base.website,
    address: str(o.address) ?? base.address,
  };
}

function normalizeInvoiceItem(raw: unknown): ApiInvoiceItem | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  return {
    description: str(o.description) ?? "Line item",
    quantity: Math.max(0, num(o.quantity) ?? 1),
    unitPriceGHS: Math.max(0, num(o.unitPriceGHS) ?? num(o.unit_price_ghs) ?? 0),
  };
}

function normalizeInvoiceSummary(raw: unknown): ApiInvoiceSummary {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    _id: str(o._id) ?? str(o.id) ?? "",
    savedAt:
      str(o.savedAt) ?? str(o.saved_at) ?? str(o.updatedAt) ?? str(o.createdAt) ?? new Date().toISOString(),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
    invoiceNo: str(o.invoiceNo) ?? str(o.invoice_no) ?? "",
    invoiceDateISO: str(o.invoiceDateISO) ?? str(o.invoice_date_iso) ?? "",
    dueDateISO: str(o.dueDateISO) ?? str(o.due_date_iso) ?? "",
    shootDateISO: str(o.shootDateISO) ?? str(o.shoot_date_iso),
    bookingId: str(o.bookingId) ?? str(o.booking_id),
    clientId: str(o.clientId) ?? str(o.client_id),
    title: str(o.title),
    shootType: str(o.shootType) ?? str(o.shoot_type),
    billTo: normalizeBillTo(o.billTo ?? o.bill_to),
    totalGHS: num(o.totalGHS) ?? num(o.total_ghs) ?? 0,
    amountPayingGHS: num(o.amountPayingGHS) ?? num(o.amount_paying_ghs),
    paymentStatus: str(o.paymentStatus) as InvoicePaymentStatus | undefined,
    paymentPercent: num(o.paymentPercent) ?? num(o.payment_percent),
    currency: "GHS",
  };
}

function normalizeInvoice(raw: unknown): ApiInvoice {
  const summary = normalizeInvoiceSummary(raw);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const itemsRaw = o.items;
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.map(normalizeInvoiceItem).filter((it): it is ApiInvoiceItem => it != null)
    : [];

  return {
    ...summary,
    photographerId: str(o.photographerId) ?? str(o.photographer_id),
    billedFrom: normalizeBilledFrom(o.billedFrom ?? o.billed_from),
    notes: str(o.notes),
    items,
    taxRate: num(o.taxRate) ?? num(o.tax_rate) ?? 0,
    subtotalGHS: num(o.subtotalGHS) ?? num(o.subtotal_ghs) ?? summary.totalGHS,
    taxGHS: num(o.taxGHS) ?? num(o.tax_ghs) ?? 0,
  };
}

export function apiInvoiceToDraft(inv: ApiInvoice): InvoiceDraft {
  const billedFrom = inv.billedFrom?.name ? inv.billedFrom : defaultBilledFrom();
  const items =
    inv.items?.length > 0
      ? inv.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPriceGHS: it.unitPriceGHS,
        }))
      : [];

  return {
    currency: "GHS",
    invoiceNo: inv.invoiceNo,
    invoiceDateISO: inv.invoiceDateISO,
    dueDateISO: inv.dueDateISO,
    shootDateISO: inv.shootDateISO,
    bookingId: inv.bookingId,
    title: inv.title,
    shootType: inv.shootType,
    billTo: {
      name: inv.billTo?.name ?? "Client",
      email: inv.billTo?.email,
      address: inv.billTo?.address,
    },
    billedFrom: { ...billedFrom },
    notes: inv.notes,
    items,
    taxRate: inv.taxRate ?? 0,
    subtotalGHS: inv.subtotalGHS,
    taxGHS: inv.taxGHS,
    totalGHS: inv.totalGHS,
    amountPayingGHS: inv.amountPayingGHS,
    paymentStatus: inv.paymentStatus,
    paymentPercent: inv.paymentPercent,
  };
}

export function apiInvoiceToStoredRow(inv: ApiInvoice): StoredInvoiceRow {
  return {
    id: inv._id,
    savedAtISO: inv.savedAt,
    draft: apiInvoiceToDraft(inv),
  };
}

/**
 * Minimal list row for the history table. Open / edit should call
 * {@link getInvoiceForEdit} to load the full draft.
 */
export function apiSummaryToStoredRow(summary: ApiInvoiceSummary): StoredInvoiceRow {
  return {
    id: summary._id,
    savedAtISO: summary.savedAt,
    draft: {
      currency: "GHS",
      invoiceNo: summary.invoiceNo,
      invoiceDateISO: summary.invoiceDateISO,
      dueDateISO: summary.dueDateISO,
      shootDateISO: summary.shootDateISO,
      bookingId: summary.bookingId,
      title: summary.title,
      shootType: summary.shootType,
      billTo: summary.billTo,
      billedFrom: { name: "" },
      items: [],
      taxRate: 0,
      subtotalGHS: summary.totalGHS,
      taxGHS: 0,
      totalGHS: summary.totalGHS,
      amountPayingGHS: summary.amountPayingGHS,
      paymentStatus: summary.paymentStatus,
      paymentPercent: summary.paymentPercent,
    },
  };
}

/** Map a local `InvoiceDraft` (from the form builder) to a POST/PATCH body. */
export function draftToApiWriteBody(draft: InvoiceDraft): CreateInvoiceBody {
  return {
    bookingId: draft.bookingId,
    title: draft.title,
    shootType: draft.shootType,
    shootDateISO: draft.shootDateISO,
    dueDateISO: draft.dueDateISO,
    billTo: draft.billTo,
    billedFrom: draft.billedFrom,
    items: draft.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPriceGHS: it.unitPriceGHS,
    })),
    amountPayingGHS: draft.amountPayingGHS ?? 0,
    notes: draft.notes,
    taxRate: draft.taxRate ?? 0,
  };
}

function normalizeInvoiceResponse(body: unknown): ApiInvoice {
  const o = body as { invoice?: unknown };
  if (o.invoice && typeof o.invoice === "object") return normalizeInvoice(o.invoice);
  return normalizeInvoice(body);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getInvoiceMeta(): Promise<InvoiceMetaResponse> {
  const res = await authedFetch("/api/invoices/meta", { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load invoice meta (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as Record<string, unknown>;
  return {
    nextInvoiceNoPreview:
      typeof o.nextInvoiceNoPreview === "string" ? o.nextInvoiceNoPreview : "",
  };
}

export async function listInvoices(
  params: ListInvoicesParams = {},
): Promise<ListInvoicesResponse> {
  const qs = new URLSearchParams();
  if (params.bookingId) qs.set("bookingId", params.bookingId);
  if (params.clientId) qs.set("clientId", params.clientId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const query = qs.toString();
  const path = query ? `/api/invoices?${query}` : "/api/invoices";

  const res = await authedFetch(path, { method: "GET" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load invoices (${res.status})`),
      res.status,
      body,
    );
  }
  const data = body as ListInvoicesResponse & { invoices?: unknown[] };
  const invoices = Array.isArray(data?.invoices)
    ? data.invoices.map(normalizeInvoiceSummary)
    : [];
  return {
    count: data?.count ?? invoices.length,
    invoices,
  };
}

/** List invoices as `StoredInvoiceRow` for the history table (summary rows). */
export async function listInvoicesAsStoredRows(): Promise<StoredInvoiceRow[]> {
  const { invoices } = await listInvoices();
  return invoices.map(apiSummaryToStoredRow);
}

export async function getInvoice(id: string): Promise<ApiInvoice> {
  const res = await authedFetch(`/api/invoices/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Failed to load invoice (${res.status})`),
      res.status,
      body,
    );
  }
  return normalizeInvoiceResponse(body);
}

/** Full invoice for edit / preview — preferred over list summary rows. */
export async function getInvoiceForEdit(id: string): Promise<StoredInvoiceRow> {
  const inv = await getInvoice(id);
  return apiInvoiceToStoredRow(inv);
}

export async function createInvoice(
  input: CreateInvoiceBody,
): Promise<{ message?: string; invoice: ApiInvoice }> {
  const res = await authedFetch("/api/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Could not create invoice (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as { message?: string; invoice?: ApiInvoice };
  return {
    message: o.message,
    invoice: normalizeInvoiceResponse(body),
  };
}

/** Create from a local `InvoiceDraft` built by `createInvoiceFromForm`. */
export async function createInvoiceFromDraft(
  draft: InvoiceDraft,
): Promise<{ message?: string; invoice: ApiInvoice; row: StoredInvoiceRow }> {
  const result = await createInvoice(draftToApiWriteBody(draft));
  return {
    ...result,
    row: apiInvoiceToStoredRow(result.invoice),
  };
}

export async function replaceInvoice(
  id: string,
  input: CreateInvoiceBody,
): Promise<{ message?: string; invoice: ApiInvoice }> {
  const res = await authedFetch(`/api/invoices/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Could not replace invoice (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as { message?: string; invoice?: ApiInvoice };
  return {
    message: o.message,
    invoice: normalizeInvoiceResponse(body),
  };
}

export async function patchInvoice(
  id: string,
  input: PatchInvoiceBody,
): Promise<{ message?: string; invoice: ApiInvoice }> {
  const res = await authedFetch(`/api/invoices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Could not update invoice (${res.status})`),
      res.status,
      body,
    );
  }
  const o = body as { message?: string; invoice?: ApiInvoice };
  return {
    message: o.message,
    invoice: normalizeInvoiceResponse(body),
  };
}

/** Update from a local `InvoiceDraft` (e.g. after `createInvoiceFromForm` on edit). */
export async function updateInvoiceFromDraft(
  id: string,
  draft: InvoiceDraft,
): Promise<{ message?: string; invoice: ApiInvoice; row: StoredInvoiceRow }> {
  const result = await patchInvoice(id, draftToApiWriteBody(draft));
  return {
    ...result,
    row: apiInvoiceToStoredRow(result.invoice),
  };
}

export async function deleteInvoice(id: string): Promise<void> {
  const res = await authedFetch(`/api/invoices/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractMessage(body, `Could not delete invoice (${res.status})`),
      res.status,
      body,
    );
  }
}
