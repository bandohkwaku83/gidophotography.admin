"use client";

import {
  STUDIO_ADDRESS,
  STUDIO_EMAIL,
  STUDIO_LOGO_SRC,
  STUDIO_NAME,
  STUDIO_PHONE,
  STUDIO_WEBSITE_URL,
} from "@/lib/branding";
import type { InvoiceDraft } from "@/lib/invoices-types";
import { formatGhsPdf } from "@/lib/invoice-export";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

function studioContactLines(invoice: InvoiceDraft): string[] {
  return [
    invoice.billedFrom.address ?? STUDIO_ADDRESS,
    invoice.billedFrom.phone ?? STUDIO_PHONE,
    invoice.billedFrom.email ?? STUDIO_EMAIL,
    invoice.billedFrom.website ?? STUDIO_WEBSITE_URL,
  ].filter(Boolean);
}

function formatGhs(n: number): string {
  return formatGhsPdf(n);
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function PartyBlock({
  label,
  name,
  lines,
}: {
  label: string;
  name: string;
  lines: (string | undefined | null)[];
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-zinc-900">{name}</p>
      <div className="mt-1.5 space-y-0.5 text-sm leading-relaxed text-zinc-500">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "default" | "total" | "due";
}) {
  const labelClass =
    emphasis === "total"
      ? "text-base font-semibold text-zinc-900"
      : emphasis === "due"
        ? "text-sm font-semibold uppercase tracking-wide text-zinc-700"
        : "text-zinc-500";
  const valueClass =
    emphasis === "total"
      ? "text-2xl font-bold tabular-nums text-zinc-900"
      : emphasis === "due"
        ? "text-2xl font-bold tabular-nums text-zinc-900"
        : "font-medium tabular-nums text-zinc-900";

  return (
    <div className="flex items-baseline justify-between gap-8 py-1.5">
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export function InvoicePreviewEmpty() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-h-[420px] flex-col items-center justify-center px-8 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <svg
            className="h-7 w-7 text-zinc-300 dark:text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.25}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <p className="mt-6 text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">Invoice preview</p>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Fill in the form and generate to see your print-ready invoice here.
        </p>
      </div>
    </div>
  );
}

export const InvoicePreview = forwardRef<
  HTMLElement,
  { invoice: InvoiceDraft; className?: string }
>(function InvoicePreview({ invoice, className }, ref) {
  const taxPercent = Math.round(invoice.taxRate * 100);
  const amountPaid = invoice.amountPayingGHS ?? 0;
  const balanceDue = Math.max(0, Math.round((invoice.totalGHS - amountPaid) * 100) / 100);
  const paymentTerms =
    invoice.notes?.trim() || "All payments must be made in full before commencement of the shoot.";

  return (
    <article
      ref={ref}
      className={cn(
        "invoice-document relative overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900",
        "shadow-sm print:rounded-none print:border-0 print:shadow-none",
        "print:!border-0 print:!bg-white print:!text-zinc-900",
        className,
      )}
    >
      <div className="px-10 py-10 print:px-0 print:py-0">
        {/* Header — logo + contact left, document identity right */}
        <header className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={STUDIO_LOGO_SRC}
              alt={STUDIO_NAME}
              width={140}
              height={48}
              className="h-10 w-auto object-contain object-left"
            />
            <p className="mt-4 text-[15px] font-semibold text-zinc-900">
              {invoice.billedFrom.name || STUDIO_NAME}
            </p>
            <div className="mt-2 space-y-1 text-sm leading-relaxed text-zinc-600">
              {studioContactLines(invoice).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <h2 className="text-[2rem] font-bold leading-none tracking-tight text-zinc-900">Invoice</h2>
            <p className="mt-2 font-mono text-sm text-zinc-500">{invoice.invoiceNo}</p>
          </div>
        </header>

        {/* Meta strip */}
        <div className="mt-8 grid gap-4 border-y border-zinc-200 py-4 text-sm print:border-zinc-300 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Issued</p>
            <p className="mt-1 font-medium text-zinc-900">{formatDateShort(invoice.invoiceDateISO)}</p>
          </div>
          {invoice.shootDateISO ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Shoot date</p>
              <p className="mt-1 font-medium text-zinc-900">{formatDateShort(invoice.shootDateISO)}</p>
            </div>
          ) : (
            <div />
          )}
          {invoice.shootType ? (
            <div className="sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Shoot type</p>
              <p className="mt-1 font-medium text-zinc-900">{invoice.shootType}</p>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Bill to */}
        <section className="mt-10">
          <PartyBlock
            label="Bill to"
            name={invoice.billTo.name}
            lines={[invoice.billTo.address, invoice.billTo.email]}
          />
        </section>

        {/* Line items */}
        <section className="mt-12">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                <th className="pb-3 pr-4 text-left font-semibold">Description</th>
                <th className="w-16 pb-3 pr-4 text-right font-semibold">Qty</th>
                <th className="hidden w-28 pb-3 pr-4 text-right font-semibold sm:table-cell print:table-cell">Rate</th>
                <th className="w-28 pb-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, idx) => {
                const lineTotal = it.quantity * it.unitPriceGHS;
                return (
                  <tr key={`${idx}-${it.description}`} className="border-b border-zinc-100">
                    <td className="py-4 pr-4 font-medium text-zinc-900">{it.description}</td>
                    <td className="py-4 pr-4 text-right tabular-nums text-zinc-600">{it.quantity}</td>
                    <td className="hidden py-4 pr-4 text-right tabular-nums text-zinc-600 sm:table-cell print:table-cell">
                      {formatGhs(it.unitPriceGHS)}
                    </td>
                    <td className="py-4 text-right tabular-nums text-zinc-900">{formatGhs(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Totals — right-aligned, total is the visual anchor */}
        <section className="mt-10 flex justify-end">
          <div className="w-full max-w-[280px]">
            <TotalRow label="Subtotal" value={formatGhs(invoice.subtotalGHS)} />
            {taxPercent > 0 ? (
              <TotalRow label={`Tax (${taxPercent}%)`} value={formatGhs(invoice.taxGHS)} />
            ) : null}

            <div className="my-3 border-t-2 border-zinc-900" />

            <TotalRow label="Total" value={formatGhs(invoice.totalGHS)} emphasis="total" />

            {invoice.amountPayingGHS != null && amountPaid > 0 ? (
              <div className="mt-4 space-y-0 border-t border-zinc-200 pt-4">
                <TotalRow label="Amount paid" value={formatGhs(amountPaid)} />
                <div className="my-3 border-t border-zinc-200" />
                <TotalRow label="Amount due" value={formatGhs(balanceDue)} emphasis="due" />
              </div>
            ) : (
              <div className="mt-4 border-t border-zinc-200 pt-4">
                <TotalRow label="Amount due" value={formatGhs(balanceDue)} emphasis="due" />
              </div>
            )}
          </div>
        </section>

        <footer className="mt-16 border-t border-zinc-200 pt-6 print:border-zinc-300">
          <p className="max-w-prose text-xs leading-relaxed text-zinc-500">
            Thank you for your business. {paymentTerms}
          </p>
        </footer>
      </div>
    </article>
  );
});
