"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Input, Select } from "antd";
import { ArrowLeft, ArrowRight, Plus, Trash2, UserPlus } from "lucide-react";
import { DashboardPage } from "@/components/photographer/dashboard-page";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import { InvoiceHistoryList } from "@/components/invoices/invoice-history-list";
import { InvoicePreview, InvoicePreviewEmpty } from "@/components/invoices/invoice-preview";
import { InvoiceShareActions } from "@/components/invoices/invoice-share-actions";
import { useToast } from "@/components/toast-provider";
import { KIND_META, SHOOT_KINDS_ORDER, type ShootKind } from "@/components/schedules/booking-types";
import type { BookedShoot } from "@/components/schedules/booking-types";
import {
  apiShootTypeToKind,
  getBooking,
  getBookingsMeta,
  listAdvanceBookings,
  mapApiBookingToBookedShoot,
  type BookingShootTypeMeta,
} from "@/lib/bookings-api";
import { listClients, type ApiClient } from "@/lib/clients-api";
import {
  createInvoiceFromForm,
  defaultLineItemsForBooking,
  invoiceDraftToFormState,
  paymentStatusFromAmounts,
  shootKindFromShootTypeLabel,
} from "@/lib/invoices-dummy";
import type { InvoiceDraft, InvoiceLineItem, InvoicePaymentStatus } from "@/lib/invoices-types";
import { ApiError } from "@/lib/clients-api";
import {
  createInvoiceFromDraft,
  deleteInvoice,
  getInvoiceForEdit,
  getInvoiceMeta,
  listInvoicesAsStoredRows,
  updateInvoiceFromDraft,
  type StoredInvoiceRow,
} from "@/lib/invoices-api";
import { cn } from "@/lib/utils";

type PageView = "list" | "create";
type CreateMode = "new" | "edit";

function isoFromInputOrToday(v: string | undefined): string {
  const t = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const today = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  const s = (v ?? "").trim();
  return s || today;
}

function formatIsoDateLabel(iso: string): string {
  const s = iso.trim();
  if (!s) return "—";
  try {
    const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return s;
  }
}

function defaultShootTypeId(meta: BookingShootTypeMeta[]): string {
  if (meta.length > 0) return meta[0].id;
  return "portraits";
}

function shootTypeIdForBooking(b: BookedShoot, meta: BookingShootTypeMeta[]): string {
  if (meta.length > 0) {
    const byKind = meta.find((t) => apiShootTypeToKind(t.id) === b.kind);
    if (byKind) return byKind.id;
    const byLabel = meta.find((t) => t.label === KIND_META[b.kind].label);
    if (byLabel) return byLabel.id;
  }
  return b.kind;
}

function shootTypeIdFromDraftLabel(label: string | undefined, meta: BookingShootTypeMeta[]): string {
  const t = label?.trim();
  if (!t) return defaultShootTypeId(meta);
  if (meta.length > 0) {
    const hit = meta.find((m) => m.label === t || m.id === t);
    if (hit) return hit.id;
  }
  return shootKindFromShootTypeLabel(t);
}

function shootTypeLabelFromId(id: string, meta: BookingShootTypeMeta[]): string {
  const hit = meta.find((m) => m.id === id);
  if (hit) return hit.label;
  const kind = id as ShootKind;
  return KIND_META[kind]?.label ?? id;
}

function shootKindFromTypeId(id: string, meta: BookingShootTypeMeta[]): ShootKind {
  if (meta.length > 0) {
    const hit = meta.find((m) => m.id === id);
    if (hit) return apiShootTypeToKind(hit.id);
  }
  return (id in KIND_META ? id : "other") as ShootKind;
}

function toAmountGHS(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
      <span className="text-red-500"> *</span>
    </span>
  );
}

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </span>
  );
}

function PaymentStatusDisplay({ status, percent }: { status: InvoicePaymentStatus; percent: number }) {
  const label = status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Pending";
  return (
    <div className="flex h-[40px] items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
          status === "paid" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
          status === "partial" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
          status === "pending" && "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
        )}
      >
        {label}
      </span>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{percent}% of total</span>
    </div>
  );
}

function LineItemsEditor({
  items,
  onChange,
}: {
  items: InvoiceLineItem[];
  onChange: (items: InvoiceLineItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 sm:grid sm:grid-cols-[1fr_72px_96px_32px]">
        <span>Description</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Price (GHS)</span>
        <span />
      </div>

      {items.map((it, idx) => (
        <div
          key={idx}
          className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950 sm:grid-cols-[1fr_72px_96px_32px] sm:border-0 sm:bg-transparent sm:p-0"
        >
          <Input
            value={it.description}
            onChange={(e) => {
              const next = [...items];
              next[idx] = { ...next[idx], description: e.target.value };
              onChange(next);
            }}
            placeholder="Item description"
          />
          <Input
            type="number"
            min={0}
            step={1}
            value={it.quantity}
            onChange={(e) => {
              const next = [...items];
              next[idx] = {
                ...next[idx],
                quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              };
              onChange(next);
            }}
            className="text-center"
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            value={it.unitPriceGHS}
            onChange={(e) => {
              const next = [...items];
              next[idx] = { ...next[idx], unitPriceGHS: toAmountGHS(e.target.value) };
              onChange(next);
            }}
            className="text-right"
            placeholder="0.00"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            disabled={items.length <= 1}
            className="flex h-8 w-8 items-center justify-center self-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            aria-label="Remove line item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...items, { description: "", quantity: 1, unitPriceGHS: 0 }])}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-studio-ink transition hover:bg-[#f5f5f5]"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </button>
    </div>
  );
}

function formatGhsDisplay(n: number): string {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `GH₵${n.toFixed(2)}`;
  }
}

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const bookingFocusId = useMemo(() => searchParams.get("booking")?.trim() ?? "", [searchParams]);
  const todayISO = useMemo(() => isoFromInputOrToday(undefined), []);

  const [view, setView] = useState<PageView>("list");
  const [createMode, setCreateMode] = useState<CreateMode>("new");
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<StoredInvoiceRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingInvoiceId, setOpeningInvoiceId] = useState<string | null>(null);
  const [nextInvoiceNoPreview, setNextInvoiceNoPreview] = useState<string | null>(null);

  const [bookingOptionsLoading, setBookingOptionsLoading] = useState(false);
  const [bookingOptions, setBookingOptions] = useState<BookedShoot[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string>(bookingFocusId);
  const [bookingLoadError, setBookingLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [shootTypeId, setShootTypeId] = useState<string>("portraits");
  const [shootTypesMeta, setShootTypesMeta] = useState<BookingShootTypeMeta[]>([]);
  const [shootTypesLoading, setShootTypesLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [shootDateISO, setShootDateISO] = useState(todayISO);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(() => [
    { description: "", quantity: 1, unitPriceGHS: 0 },
  ]);
  const [amountPaying, setAmountPaying] = useState("");

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const previewDocumentRef = useRef<HTMLElement>(null);

  const refreshInvoiceHistory = useCallback(async () => {
    setListLoading(true);
    try {
      const rows = await listInvoicesAsStoredRows();
      setInvoiceHistory(rows);
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load invoices.",
        "error",
      );
      setInvoiceHistory([]);
    } finally {
      setListLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refreshInvoiceHistory();
  }, [refreshInvoiceHistory]);

  useEffect(() => {
    if (view !== "create" || createMode !== "new") {
      setNextInvoiceNoPreview(null);
      return;
    }
    let cancelled = false;
    void getInvoiceMeta()
      .then((meta) => {
        if (!cancelled && meta.nextInvoiceNoPreview) {
          setNextInvoiceNoPreview(meta.nextInvoiceNoPreview);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, createMode]);

  useEffect(() => {
    if (bookingFocusId) {
      setCreateMode("new");
      setView("create");
    }
  }, [bookingFocusId]);

  const refreshAdvanceBookings = useCallback(async () => {
    setBookingOptionsLoading(true);
    setBookingLoadError(null);
    try {
      const res = await listAdvanceBookings();
      setBookingOptions(res.bookings.map(mapApiBookingToBookedShoot));
    } catch (e) {
      setBookingOptions([]);
      setBookingLoadError(e instanceof Error ? e.message : "Could not load bookings.");
    } finally {
      setBookingOptionsLoading(false);
    }
  }, []);

  const applyBookingToForm = useCallback(
    (b: BookedShoot) => {
      setTitle(b.title);
      setShootTypeId(shootTypeIdForBooking(b, shootTypesMeta));
      setClientId(b.clientId);
      setShootDateISO(b.date);
      setLineItems(defaultLineItemsForBooking(b));
      setAmountPaying("");
    },
    [shootTypesMeta],
  );

  const loadBookingById = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const b = await getBooking(id);
        applyBookingToForm(mapApiBookingToBookedShoot(b));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load booking.", "error");
      }
    },
    [applyBookingToForm, showToast],
  );

  useEffect(() => {
    void refreshAdvanceBookings();
  }, [refreshAdvanceBookings]);

  useEffect(() => {
    let cancelled = false;
    setShootTypesLoading(true);
    void getBookingsMeta()
      .then((meta) => {
        if (!cancelled) setShootTypesMeta(meta.shootTypes);
      })
      .catch((e) => {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load shoot types.", "error");
          setShootTypesMeta([]);
        }
      })
      .finally(() => {
        if (!cancelled) setShootTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (shootTypesMeta.length === 0) return;
    setShootTypeId((prev) => {
      if (shootTypesMeta.some((t) => t.id === prev)) return prev;
      const byKind = shootTypesMeta.find((t) => apiShootTypeToKind(t.id) === prev);
      if (byKind) return byKind.id;
      return shootTypesMeta[0].id;
    });
  }, [shootTypesMeta]);

  useEffect(() => {
    if (!bookingFocusId) return;
    void loadBookingById(bookingFocusId);
  }, [bookingFocusId, loadBookingById]);

  useEffect(() => {
    let cancelled = false;
    setClientsLoading(true);
    void (async () => {
      try {
        const res = await listClients("");
        if (!cancelled) setClients(res.clients);
      } catch (e) {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load clients.", "error");
          setClients([]);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const shootTypeSelectOptions = useMemo(() => {
    if (shootTypesMeta.length > 0) {
      return shootTypesMeta.map((t) => ({ value: t.id, label: t.label }));
    }
    return SHOOT_KINDS_ORDER.map((k) => ({ value: k, label: KIND_META[k].label }));
  }, [shootTypesMeta]);

  const resolvedShootKind = useMemo(
    () => shootKindFromTypeId(shootTypeId, shootTypesMeta),
    [shootTypeId, shootTypesMeta],
  );

  const resolvedShootTypeLabel = useMemo(
    () => shootTypeLabelFromId(shootTypeId, shootTypesMeta),
    [shootTypeId, shootTypesMeta],
  );

  const bookingSelectOptions = useMemo(
    () =>
      bookingOptions
        .slice()
        .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
        .map((b) => ({
          value: b.id,
          label: `${b.title} · ${b.clientName} · ${formatIsoDateLabel(b.date)}`,
        })),
    [bookingOptions],
  );

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const clientName = useMemo(() => {
    const c = clients.find((x) => x._id === clientId);
    return c?.name?.trim() ?? "";
  }, [clients, clientId]);

  const linkedBooking = useMemo(
    () => bookingOptions.find((b) => b.id === selectedBookingId) ?? null,
    [bookingOptions, selectedBookingId],
  );

  const itemsSubtotal = useMemo(
    () =>
      Math.round(
        lineItems.reduce((sum, it) => sum + Math.max(0, it.quantity) * Math.max(0, it.unitPriceGHS), 0) * 100,
      ) / 100,
    [lineItems],
  );

  const payingNum = toAmountGHS(amountPaying);
  const payment = useMemo(() => paymentStatusFromAmounts(itemsSubtotal, payingNum), [itemsSubtotal, payingNum]);

  const applyDraftToForm = useCallback(
    (draft: InvoiceDraft) => {
      const state = invoiceDraftToFormState(draft, clients, todayISO);
      setSelectedBookingId(state.selectedBookingId);
      setTitle(state.title);
      setShootTypeId(shootTypeIdFromDraftLabel(draft.shootType, shootTypesMeta));
      setClientId(state.clientId);
      setShootDateISO(state.shootDateISO);
      setLineItems(state.lineItems);
      setAmountPaying(state.amountPaying);
      setInvoiceDraft(draft);
    },
    [clients, todayISO, shootTypesMeta],
  );

  useEffect(() => {
    if (!invoiceDraft?.shootType || shootTypesMeta.length === 0) return;
    setShootTypeId((prev) => {
      if (shootTypesMeta.some((m) => m.id === prev)) return prev;
      return shootTypeIdFromDraftLabel(invoiceDraft.shootType, shootTypesMeta);
    });
  }, [invoiceDraft?.shootType, shootTypesMeta]);

  useEffect(() => {
    if (createMode !== "edit" || !invoiceDraft || clientId) return;
    const match = clients.find(
      (c) => c.name.trim().toLowerCase() === invoiceDraft.billTo.name.trim().toLowerCase(),
    );
    if (match) setClientId(match._id);
  }, [createMode, invoiceDraft, clients, clientId]);

  const canGenerate = Boolean(title.trim() && clientId && shootDateISO && lineItems.length > 0 && itemsSubtotal > 0);

  const livePreviewDraft = useMemo(() => {
    if (!canGenerate || !clientName) return null;
    return createInvoiceFromForm({
      title: title.trim(),
      shootKind: resolvedShootKind,
      shootTypeLabel: resolvedShootTypeLabel,
      clientName,
      shootDateISO,
      bookingId: selectedBookingId || undefined,
      bookingLocation: linkedBooking?.location,
      items: lineItems,
      amountPayingGHS: payingNum,
      preserve:
        editingInvoiceId && invoiceDraft
          ? {
              invoiceNo: invoiceDraft.invoiceNo,
              invoiceDateISO: invoiceDraft.invoiceDateISO,
              dueDateISO: invoiceDraft.dueDateISO,
            }
          : undefined,
    });
  }, [
    canGenerate,
    clientName,
    title,
    resolvedShootKind,
    resolvedShootTypeLabel,
    shootDateISO,
    selectedBookingId,
    linkedBooking?.location,
    lineItems,
    payingNum,
    editingInvoiceId,
    invoiceDraft,
  ]);

  const displayDraft = invoiceDraft ?? livePreviewDraft;
  const canShare = Boolean(displayDraft && displayDraft.items.length > 0);

  function handleBookingLinkChange(id: string | undefined) {
    const nextId = id ?? "";
    setSelectedBookingId(nextId);
    if (!nextId) return;
    const local = bookingOptions.find((b) => b.id === nextId);
    if (local) {
      applyBookingToForm(local);
      return;
    }
    void loadBookingById(nextId);
  }

  async function handleGenerate() {
    if (!canGenerate) {
      showToast("Fill in title, client, date, and at least one priced item.", "error");
      return;
    }
    if (!clientName) {
      showToast("Select a valid client.", "error");
      return;
    }

    const draft = createInvoiceFromForm({
      title: title.trim(),
      shootKind: resolvedShootKind,
      shootTypeLabel: resolvedShootTypeLabel,
      clientName,
      shootDateISO,
      bookingId: selectedBookingId || undefined,
      bookingLocation: linkedBooking?.location,
      items: lineItems,
      amountPayingGHS: payingNum,
      preserve:
        editingInvoiceId && invoiceDraft
          ? {
              invoiceNo: invoiceDraft.invoiceNo,
              invoiceDateISO: invoiceDraft.invoiceDateISO,
              dueDateISO: invoiceDraft.dueDateISO,
            }
          : undefined,
    });

    setSaving(true);
    try {
      if (editingInvoiceId) {
        const { row } = await updateInvoiceFromDraft(editingInvoiceId, draft);
        setInvoiceDraft(row.draft);
        showToast("Invoice updated.", "success");
      } else {
        const { row } = await createInvoiceFromDraft(draft);
        setEditingInvoiceId(row.id);
        setCreateMode("edit");
        setInvoiceDraft(row.draft);
        showToast("Invoice generated.", "success");
      }
      await refreshInvoiceHistory();
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not save invoice.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetCreateForm() {
    setSelectedBookingId("");
    setTitle("");
    setShootTypeId(defaultShootTypeId(shootTypesMeta));
    setClientId("");
    setShootDateISO(todayISO);
    setLineItems([{ description: "", quantity: 1, unitPriceGHS: 0 }]);
    setAmountPaying("");
    setInvoiceDraft(null);
    setEditingInvoiceId(null);
  }

  function openCreateView() {
    resetCreateForm();
    setCreateMode("new");
    setView("create");
  }

  async function openStoredInvoice(row: StoredInvoiceRow) {
    setEditingInvoiceId(row.id);
    setCreateMode("edit");
    setView("create");
    setOpeningInvoiceId(row.id);
    try {
      const full = await getInvoiceForEdit(row.id);
      applyDraftToForm(full.draft);
      setEditingInvoiceId(full.id);
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load invoice.",
        "error",
      );
      setView("list");
      setEditingInvoiceId(null);
    } finally {
      setOpeningInvoiceId(null);
    }
  }

  async function handleDeleteStored(id: string) {
    try {
      await deleteInvoice(id);
      if (editingInvoiceId === id) {
        resetCreateForm();
        setView("list");
      }
      await refreshInvoiceHistory();
      showToast("Invoice removed.", "success");
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not delete invoice.",
        "error",
      );
    }
  }

  function backToList() {
    setView("list");
    setEditingInvoiceId(null);
    setInvoiceDraft(null);
  }

  function handleNewClientSaved(c: ApiClient) {
    if (!c?._id) return;
    setClients((prev) => {
      const without = prev.filter((x) => x._id !== c._id);
      return [...without, c];
    });
    setClientId(c._id);
    setAddClientOpen(false);
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-brand/25 focus:border-brand focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <DashboardPage className="space-y-6 print:max-w-none print:space-y-0">
      {view === "list" ? (
        <InvoiceHistoryList
          invoices={invoiceHistory}
          loading={listLoading}
          onCreate={openCreateView}
          onOpen={(row) => void openStoredInvoice(row)}
          onDelete={(id) => void handleDeleteStored(id)}
        />
      ) : (
        <>
          <div className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={backToList}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Back to invoices"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {createMode === "edit" ? "Edit invoice" : "New invoice"}
                </h1>
                <p className="mt-1 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">
                  {createMode === "edit" && invoiceDraft
                    ? `${invoiceDraft.invoiceNo} · ${invoiceDraft.billTo.name}`
                    : nextInvoiceNoPreview
                      ? `Next invoice: ${nextInvoiceNoPreview}`
                      : "Fill in the details and generate a print-ready invoice."}
                </p>
              </div>
            </div>
          </div>

          <div className="print:!block lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 xl:gap-8">
        <div className="print:hidden space-y-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-5 p-4 sm:p-5">
              {bookingLoadError ? (
                <Alert
                  type="error"
                  showIcon
                  message="Could not load bookings"
                  description={bookingLoadError}
                  action={
                    <button
                      type="button"
                      onClick={() => void refreshAdvanceBookings()}
                      className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Retry
                    </button>
                  }
                />
              ) : null}

              {/* Link booking */}
              <div>
                <OptionalLabel>Link booking</OptionalLabel>
                <Select
                  allowClear
                  loading={bookingOptionsLoading}
                  showSearch
                  optionFilterProp="label"
                  value={selectedBookingId || undefined}
                  placeholder="Select a booking (optional)"
                  options={bookingSelectOptions}
                  onChange={handleBookingLinkChange}
                  className="mt-1.5 w-full"
                  size="large"
                />
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  Optional — pulls title, client, shoot type, date, and line items from a booking.
                </p>
                <Link
                  href="/dashboard/schedules"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-studio-ink transition hover:underline"
                >
                  Show all advance bookings
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>

              {/* Title + shoot type */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <RequiredLabel>Title</RequiredLabel>
                  <Input
                    className="mt-1.5"
                    size="large"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Smith wedding, ceremony"
                  />
                </div>
                <div>
                  <RequiredLabel>Shoot type</RequiredLabel>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={shootTypesLoading}
                    value={shootTypeId || undefined}
                    options={shootTypeSelectOptions}
                    onChange={(v) => setShootTypeId(v)}
                    className="mt-1.5 w-full"
                    size="large"
                    placeholder="Select shoot type"
                  />
                </div>
              </div>

              {/* Client */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <RequiredLabel>Client</RequiredLabel>
                  <button
                    type="button"
                    onClick={() => setAddClientOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 transition hover:text-studio-ink dark:text-zinc-400"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />
                    Add client
                  </button>
                </div>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={clientsLoading}
                  className={cn(inputClass, "disabled:opacity-60")}
                >
                  <option value="" disabled>
                    {clientsLoading ? "Loading clients…" : "Select a client…"}
                  </option>
                  {sortedClients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <RequiredLabel>Date</RequiredLabel>
                <Input
                  className="mt-1.5"
                  type="date"
                  size="large"
                  value={shootDateISO}
                  onChange={(e) => setShootDateISO(e.target.value)}
                />
              </div>

              {/* Line items */}
              <div>
                <RequiredLabel>Items</RequiredLabel>
                <div className="mt-1.5 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <LineItemsEditor items={lineItems} onChange={setLineItems} />
                </div>
                <p className="mt-2 text-right text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  Total: {formatGhsDisplay(itemsSubtotal)}
                </p>
              </div>

              {/* Amount paying + payment status */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <RequiredLabel>Amount paying (GHS)</RequiredLabel>
                  <Input
                    className="mt-1.5"
                    type="number"
                    min={0}
                    step={0.01}
                    size="large"
                    value={amountPaying}
                    onChange={(e) => setAmountPaying(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <OptionalLabel>Payment status</OptionalLabel>
                  <div className="mt-1.5">
                    <PaymentStatusDisplay status={payment.status} percent={payment.percent} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/20 sm:px-5">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canGenerate || saving || openingInvoiceId !== null}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white sm:w-auto"
              >
                {saving
                  ? "Saving…"
                  : createMode === "edit"
                    ? "Update invoice"
                    : "Generate invoice"}
              </button>
              {canShare ? (
                <InvoiceShareActions invoice={displayDraft!} className="sm:hidden" />
              ) : null}
              {invoiceDraft ? (
                <button
                  type="button"
                  onClick={() => setInvoiceDraft(null)}
                  className="ml-auto text-sm font-medium text-zinc-400 transition hover:text-red-500 dark:hover:text-red-400"
                >
                  Clear preview
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="invoice-print-root mt-6 print:mt-0 lg:mt-0">
          <div className="print:hidden mb-3 flex flex-wrap items-center justify-between gap-3 lg:sticky lg:top-4 lg:z-10 lg:mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Preview</h2>
              {displayDraft ? (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                    invoiceDraft
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                  )}
                >
                  {invoiceDraft ? "Saved" : "Draft"}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Empty
                </span>
              )}
            </div>
            {canShare ? (
              <InvoiceShareActions invoice={displayDraft!} className="hidden sm:flex" />
            ) : null}
          </div>

          {displayDraft ? (
            <InvoicePreview ref={previewDocumentRef} invoice={displayDraft} />
          ) : (
            <InvoicePreviewEmpty />
          )}
        </div>
      </div>
        </>
      )}

      <CreateClientModal
        open={addClientOpen}
        client={null}
        onClose={() => setAddClientOpen(false)}
        onSaved={handleNewClientSaved}
      />
    </DashboardPage>
  );
}
