"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { EmailIcon, WhatsAppIcon } from "@/components/invoices/invoice-icons";
import { useToast } from "@/components/toast-provider";
import {
  downloadBlob,
  generateInvoicePdfBlobFromDraft,
  invoicePdfFilename,
  openEmailClientForInvoice,
  openWhatsAppApp,
  shareInvoicePdfFile,
} from "@/lib/invoice-export";
import type { InvoiceDraft } from "@/lib/invoices-types";
import { cn } from "@/lib/utils";

type Props = {
  invoice: InvoiceDraft;
  className?: string;
};

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";

export function InvoiceShareActions({ invoice, className }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<"download" | "whatsapp" | "email" | null>(null);

  async function buildPdf() {
    const blob = await generateInvoicePdfBlobFromDraft(invoice);
    const filename = invoicePdfFilename(invoice);
    return { blob, filename };
  }

  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const { blob, filename } = await buildPdf();
      downloadBlob(blob, filename);
      showToast("Invoice downloaded.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download invoice.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sharePdfViaApp(hint: "whatsapp" | "email") {
    const { blob, filename } = await buildPdf();
    const result = await shareInvoicePdfFile(blob, filename);

    if (result === "shared" || result === "aborted") return;

    downloadBlob(blob, filename);
    if (hint === "email") {
      openEmailClientForInvoice(invoice);
      showToast("PDF downloaded — attach it in your email app.", "info");
      return;
    }
    openWhatsAppApp();
    showToast("PDF downloaded — attach it in WhatsApp.", "info");
  }

  async function handleWhatsApp() {
    if (busy) return;
    setBusy("whatsapp");
    try {
      await sharePdfViaApp("whatsapp");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not share PDF via WhatsApp.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleEmail() {
    if (busy) return;
    setBusy("email");
    try {
      await sharePdfViaApp("email");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not share PDF via email.", "error");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {busy === "download" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        Download PDF
      </button>
      <button
        type="button"
        onClick={() => void handleWhatsApp()}
        disabled={disabled}
        className={cn(iconBtn, "text-[#25D366] hover:bg-[#25D366]/10 dark:hover:bg-[#25D366]/15")}
        aria-label="Share PDF via WhatsApp"
        title="Share PDF via WhatsApp"
      >
        {busy === "whatsapp" ? (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" aria-hidden />
        ) : (
          <WhatsAppIcon />
        )}
      </button>
      <button
        type="button"
        onClick={() => void handleEmail()}
        disabled={disabled}
        className={cn(iconBtn, "text-zinc-600 dark:text-zinc-300")}
        aria-label="Share PDF via email"
        title="Share PDF via email"
      >
        {busy === "email" ? (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" aria-hidden />
        ) : (
          <EmailIcon />
        )}
      </button>
    </div>
  );
}
