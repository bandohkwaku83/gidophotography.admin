"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import type { StoredInvoiceRow } from "@/lib/invoices-api";
import { cn } from "@/lib/utils";

function formatGhs(n: number): string {
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function paymentLabel(status: StoredInvoiceRow["draft"]["paymentStatus"]): string {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  return "Pending";
}

type Props = {
  invoices: StoredInvoiceRow[];
  loading?: boolean;
  onCreate: () => void;
  onOpen: (row: StoredInvoiceRow) => void;
  onDelete: (id: string) => void;
};

export function InvoiceHistoryList({ invoices, loading, onCreate, onOpen, onDelete }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            View past invoices or create a new one for a client.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create invoice
        </button>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading invoices…</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex min-h-[320px] flex-col items-center justify-center px-8 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <FileText className="h-7 w-7 text-zinc-300 dark:text-zinc-600" aria-hidden />
            </div>
            <p className="mt-6 text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">No invoices yet</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Create your first invoice to record a charge and share it with clients.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create invoice
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <th className="px-4 py-3 sm:px-5">Invoice</th>
                  <th className="px-4 py-3 sm:px-5">Client</th>
                  <th className="px-4 py-3 sm:px-5">Issued</th>
                  <th className="px-4 py-3 text-right sm:px-5">Total</th>
                  <th className="px-4 py-3 sm:px-5">Status</th>
                  <th className="px-4 py-3 text-right sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((row) => {
                  const status = row.draft.paymentStatus;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 transition hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <button
                          type="button"
                          onClick={() => onOpen(row)}
                          className="font-mono text-sm font-medium text-zinc-900 hover:text-brand dark:text-zinc-100 dark:hover:text-brand-on-dark"
                        >
                          {row.draft.invoiceNo}
                        </button>
                        {row.draft.title ? (
                          <p className="mt-0.5 max-w-[200px] truncate text-xs text-zinc-500">{row.draft.title}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-700 dark:text-zinc-300 sm:px-5">{row.draft.billTo.name}</td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 sm:px-5">
                        {formatDate(row.draft.invoiceDateISO)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100 sm:px-5">
                        {formatGhs(row.draft.totalGHS)}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                            status === "paid" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                            status === "partial" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                            (!status || status === "pending") &&
                              "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                          )}
                        >
                          {paymentLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right sm:px-5">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpen(row)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            aria-label={`Delete invoice ${row.draft.invoiceNo}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
