import type { BookedShoot, ShootKind } from "@/components/schedules/booking-types";
import { KIND_META, SHOOT_KINDS_ORDER } from "@/components/schedules/booking-types";
import { STUDIO_ADDRESS, STUDIO_EMAIL, STUDIO_NAME, STUDIO_PHONE, STUDIO_TAGLINE, STUDIO_WEBSITE_URL } from "@/lib/branding";
import type { InvoiceDraft, InvoiceLineItem, InvoicePaymentStatus } from "@/lib/invoices-types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function nextInvoiceNo(): string {
  const n = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${new Date().getFullYear()}-${n}`;
}

function baseRateGHS(kind: ShootKind): number {
  const map: Record<ShootKind, number> = {
    wedding: 1500,
    portraits: 800,
    outdoor: 900,
    birthday: 700,
    graduation: 650,
    christening: 750,
    commercial: 1200,
    other: 600,
  };
  return map[kind] ?? 600;
}

function billedFromBlock() {
  return {
    name: STUDIO_NAME,
    email: STUDIO_EMAIL,
    phone: STUDIO_PHONE,
    website: STUDIO_WEBSITE_URL,
    address: STUDIO_ADDRESS,
  };
}

export function paymentStatusFromAmounts(
  totalGHS: number,
  amountPayingGHS: number,
): { status: InvoicePaymentStatus; percent: number } {
  if (totalGHS <= 0) return { status: "pending", percent: 0 };
  const percent = Math.min(100, Math.round((amountPayingGHS / totalGHS) * 100));
  if (amountPayingGHS >= totalGHS) return { status: "paid", percent: 100 };
  if (amountPayingGHS > 0) return { status: "partial", percent };
  return { status: "pending", percent: 0 };
}

export function defaultTotalForBooking(b: BookedShoot): number {
  if (b.amountGHS != null && b.amountGHS > 0) return b.amountGHS;
  return baseRateGHS(b.kind);
}

export type InvoiceFormInput = {
  title: string;
  shootKind: ShootKind;
  clientName: string;
  shootDateISO: string;
  bookingId?: string;
  bookingLocation?: string;
  items: InvoiceLineItem[];
  amountPayingGHS: number;
  /** When editing, keep the original invoice identity and dates. */
  preserve?: {
    invoiceNo: string;
    invoiceDateISO: string;
    dueDateISO: string;
  };
};

function normalizeItems(items: InvoiceLineItem[]): InvoiceLineItem[] {
  return items.map((it) => ({
    description: it.description.trim() || "Line item",
    quantity: Math.max(0, it.quantity),
    unitPriceGHS: Math.max(0, it.unitPriceGHS),
  }));
}

function subtotalFromItems(items: InvoiceLineItem[]): number {
  return normalizeItems(items).reduce((sum, it) => sum + it.quantity * it.unitPriceGHS, 0);
}

export function defaultLineItemsForBooking(b: BookedShoot): InvoiceLineItem[] {
  const shootLabel = KIND_META[b.kind].label;
  const amount = defaultTotalForBooking(b);
  return [
    {
      description: `${b.title} — ${shootLabel}`,
      quantity: 1,
      unitPriceGHS: amount,
    },
  ];
}

export function shootKindFromShootTypeLabel(label?: string): ShootKind {
  if (!label) return "portraits";
  for (const k of SHOOT_KINDS_ORDER) {
    if (KIND_META[k].label === label) return k;
  }
  return "other";
}

export function invoiceDraftToFormState(
  draft: InvoiceDraft,
  clients: { _id: string; name: string }[],
  todayISO: string,
) {
  const client = clients.find(
    (c) => c.name.trim().toLowerCase() === draft.billTo.name.trim().toLowerCase(),
  );
  return {
    selectedBookingId: draft.bookingId ?? "",
    title: draft.title ?? "",
    shootKind: shootKindFromShootTypeLabel(draft.shootType),
    clientId: client?._id ?? "",
    shootDateISO: draft.shootDateISO ?? todayISO,
    lineItems:
      draft.items.length > 0 ? draft.items : [{ description: "", quantity: 1, unitPriceGHS: 0 }],
    amountPaying: draft.amountPayingGHS != null ? String(draft.amountPayingGHS) : "",
  };
}

export function createInvoiceFromForm(input: InvoiceFormInput): InvoiceDraft {
  const issuedDate = input.preserve?.invoiceDateISO ?? todayIso();
  const dueDate = input.preserve?.dueDateISO ?? addDaysIso(issuedDate, 7);
  const invoiceNo = input.preserve?.invoiceNo ?? nextInvoiceNo();
  const shootLabel = KIND_META[input.shootKind].label;
  const title = input.title.trim() || "Photography session";
  const items = normalizeItems(input.items);
  const subtotalGHS = Math.round(subtotalFromItems(items) * 100) / 100;
  const amountPaying = Math.min(Math.max(0, input.amountPayingGHS), subtotalGHS);
  const payment = paymentStatusFromAmounts(subtotalGHS, amountPaying);

  return {
    currency: "GHS",
    invoiceNo,
    invoiceDateISO: issuedDate,
    dueDateISO: dueDate,
    shootDateISO: input.shootDateISO,
    bookingId: input.bookingId,
    title,
    shootType: shootLabel,
    billTo: {
      name: input.clientName.trim() || "Client",
      address: input.bookingLocation?.trim() || undefined,
    },
    billedFrom: billedFromBlock(),
    notes: `Thank you for choosing ${STUDIO_NAME}! (${STUDIO_TAGLINE})`,
    items,
    taxRate: 0,
    subtotalGHS,
    taxGHS: 0,
    totalGHS: subtotalGHS,
    amountPayingGHS: amountPaying,
    paymentStatus: payment.status,
    paymentPercent: payment.percent,
  };
}
