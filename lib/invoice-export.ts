import {
  STUDIO_ADDRESS,
  STUDIO_EMAIL,
  STUDIO_LOGO_SRC,
  STUDIO_NAME,
  STUDIO_PHONE,
  STUDIO_TAGLINE,
  STUDIO_WEBSITE_URL,
} from "@/lib/branding";
import type { InvoiceDraft } from "@/lib/invoices-types";
import type { jsPDF } from "jspdf";

const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const FAINT: [number, number, number] = [161, 161, 170];
const LINE: [number, number, number] = [212, 212, 216];
const LINE_LIGHT: [number, number, number] = [244, 244, 245];

/** jsPDF built-in fonts lack the cedi sign — use plain "GHS" + figures. */
export function formatGhsPdf(n: number): string {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `GHS ${grouped}.${frac}`;
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

async function loadImageDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function studioLines(invoice: InvoiceDraft): string[] {
  const from = invoice.billedFrom;
  return [
    from.address ?? STUDIO_ADDRESS,
    from.phone ?? STUDIO_PHONE,
    from.email ?? STUDIO_EMAIL,
    from.website ?? STUDIO_WEBSITE_URL,
  ].filter(Boolean);
}

function setFont(pdf: jsPDF, family: "times" | "helvetica", style: "normal" | "bold" | "italic", size: number) {
  pdf.setFont(family, style);
  pdf.setFontSize(size);
}

function hLine(pdf: jsPDF, x1: number, x2: number, y: number, color: [number, number, number] = LINE, w = 0.15) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(w);
  pdf.line(x1, y, x2, y);
}

function labelCaps(pdf: jsPDF, text: string, x: number, y: number) {
  setFont(pdf, "helvetica", "bold", 7);
  pdf.setTextColor(...FAINT);
  pdf.text(text.toUpperCase(), x, y);
}

function bodyText(pdf: jsPDF, text: string, x: number, y: number, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) {
  setFont(pdf, "times", opts?.bold ? "bold" : "normal", opts?.size ?? 10);
  pdf.setTextColor(...(opts?.color ?? INK));
  pdf.text(text, x, y);
}

function moneyText(pdf: jsPDF, amount: number, x: number, y: number, opts?: { bold?: boolean; size?: number }) {
  setFont(pdf, "times", opts?.bold ? "bold" : "normal", opts?.size ?? 10);
  pdf.setTextColor(...INK);
  pdf.text(formatGhsPdf(amount), x, y, { align: "right" });
}

export function invoicePdfFilename(invoice: InvoiceDraft): string {
  const safe = invoice.invoiceNo.replace(/[^a-zA-Z0-9-_]+/g, "-");
  return `${safe || "invoice"}.pdf`;
}

export function invoiceShareMessage(invoice: InvoiceDraft): string {
  const paid = invoice.amountPayingGHS ?? 0;
  const balance = Math.max(0, Math.round((invoice.totalGHS - paid) * 100) / 100);
  const lines = [
    `Invoice ${invoice.invoiceNo}`,
    `From: ${invoice.billedFrom.name}`,
    `Bill to: ${invoice.billTo.name}`,
    `Issued: ${formatDateShort(invoice.invoiceDateISO)}`,
    invoice.shootDateISO ? `Shoot date: ${formatDateShort(invoice.shootDateISO)}` : null,
    `Total: ${formatGhsPdf(invoice.totalGHS)}`,
    paid > 0 ? `Paid: ${formatGhsPdf(paid)}` : null,
    `Balance due: ${formatGhsPdf(balance)}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Vector PDF — single A4 page, Times body + clean column grid. */
export async function generateInvoicePdfBlobFromDraft(invoice: InvoiceDraft): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const right = pageW - margin;

  // Column anchors (mm from left)
  const colQty = right - 62;
  const colRate = right - 42;
  const colAmt = right;
  const colDescEnd = colQty - 4;

  const studioName = invoice.billedFrom.name?.trim() || STUDIO_NAME;
  let y = margin;

  // ── Header ──────────────────────────────────────────────────────────────
  const logo = await loadImageDataUrl(STUDIO_LOGO_SRC);
  if (logo) {
    pdf.addImage(logo, "PNG", margin, y, 44, 15);
  }

  setFont(pdf, "helvetica", "bold", 26);
  pdf.setTextColor(...INK);
  pdf.text("Invoice", right, y + 7, { align: "right" });
  setFont(pdf, "times", "normal", 10);
  pdf.setTextColor(...MUTED);
  pdf.text(invoice.invoiceNo, right, y + 13, { align: "right" });

  y += logo ? 22 : 14;
  bodyText(pdf, studioName, margin, y, { bold: true, size: 11 });
  y += 5;
  setFont(pdf, "times", "normal", 9);
  pdf.setTextColor(...MUTED);
  for (const line of studioLines(invoice)) {
    pdf.text(line, margin, y);
    y += 4.2;
  }

  y += 8;
  hLine(pdf, margin, right, y);
  y += 9;

  // ── Meta strip ──────────────────────────────────────────────────────────
  const metaItems: { label: string; value: string }[] = [
    { label: "Issued", value: formatDateShort(invoice.invoiceDateISO) },
  ];
  if (invoice.dueDateISO) {
    metaItems.push({ label: "Due", value: formatDateShort(invoice.dueDateISO) });
  }
  if (invoice.shootDateISO) {
    metaItems.push({ label: "Shoot date", value: formatDateShort(invoice.shootDateISO) });
  }
  if (invoice.shootType) {
    metaItems.push({ label: "Shoot type", value: invoice.shootType });
  }

  const metaColW = (right - margin) / Math.min(metaItems.length, 4);
  metaItems.slice(0, 4).forEach((m, i) => {
    const x = margin + i * metaColW;
    labelCaps(pdf, m.label, x, y);
    bodyText(pdf, m.value, x, y + 4.5, { size: 9.5 });
  });
  y += 14;
  hLine(pdf, margin, right, y);
  y += 12;

  // ── Bill to ─────────────────────────────────────────────────────────────
  labelCaps(pdf, "Bill to", margin, y);
  y += 6;
  bodyText(pdf, invoice.billTo.name, margin, y, { bold: true, size: 12 });
  y += 5.5;
  setFont(pdf, "times", "normal", 9.5);
  pdf.setTextColor(...MUTED);
  if (invoice.billTo.address) {
    pdf.text(invoice.billTo.address, margin, y);
    y += 4.5;
  }
  if (invoice.billTo.email) {
    pdf.text(invoice.billTo.email, margin, y);
    y += 4.5;
  }
  y += 10;

  // ── Line items table ────────────────────────────────────────────────────
  labelCaps(pdf, "Description", margin, y);
  setFont(pdf, "helvetica", "bold", 7);
  pdf.setTextColor(...FAINT);
  pdf.text("QTY", colQty, y, { align: "right" });
  pdf.text("RATE", colRate, y, { align: "right" });
  pdf.text("AMOUNT", colAmt, y, { align: "right" });
  y += 3;
  hLine(pdf, margin, right, y, LINE, 0.25);
  y += 7;

  setFont(pdf, "times", "normal", 10);
  pdf.setTextColor(...INK);

  for (const it of invoice.items) {
    const lineTotal = it.quantity * it.unitPriceGHS;
    const descLines = pdf.splitTextToSize(it.description, colDescEnd - margin) as string[];
    const rowTop = y;

    pdf.text(descLines, margin, rowTop);
    pdf.text(String(it.quantity), colQty, rowTop, { align: "right" });
    moneyText(pdf, it.unitPriceGHS, colRate, rowTop);
    moneyText(pdf, lineTotal, colAmt, rowTop, { bold: true });

    const rowH = Math.max(descLines.length * 4.8, 6);
    y = rowTop + rowH + 2;
    hLine(pdf, margin, right, y, LINE_LIGHT, 0.1);
    y += 5;
  }

  y += 6;

  // ── Totals (right block) ────────────────────────────────────────────────
  const totalsLeft = right - 78;
  const totalsLabelX = totalsLeft;
  const totalsValX = right;

  const addTotalRow = (label: string, amount: number, emphasis?: "total" | "due") => {
    const bold = emphasis != null;
    const size = emphasis === "total" || emphasis === "due" ? 12 : 9.5;
    setFont(pdf, "times", bold ? "bold" : "normal", size);
    pdf.setTextColor(...(emphasis ? INK : MUTED));
    pdf.text(label, totalsLabelX, y);
    moneyText(pdf, amount, totalsValX, y, { bold, size });
    y += emphasis ? 8 : 6;
  };

  addTotalRow("Subtotal", invoice.subtotalGHS);
  if (invoice.taxRate > 0) {
    addTotalRow(`Tax (${Math.round(invoice.taxRate * 100)}%)`, invoice.taxGHS);
  }

  y += 1;
  hLine(pdf, totalsLeft, right, y, INK, 0.35);
  y += 7;
  addTotalRow("Total", invoice.totalGHS, "total");

  const amountPaid = invoice.amountPayingGHS ?? 0;
  const balanceDue = Math.max(0, Math.round((invoice.totalGHS - amountPaid) * 100) / 100);

  if (invoice.amountPayingGHS != null && amountPaid > 0) {
    y += 2;
    hLine(pdf, totalsLeft, right, y, LINE, 0.15);
    y += 7;
    addTotalRow("Amount paid", amountPaid);
    y += 1;
    hLine(pdf, totalsLeft, right, y, LINE, 0.15);
    y += 7;
  }

  addTotalRow("Amount due", balanceDue, "due");

  // ── Footer ──────────────────────────────────────────────────────────────
  y += 14;
  hLine(pdf, margin, right, y);
  y += 8;
  const notes =
    invoice.notes?.trim() ||
    `Thank you for choosing ${STUDIO_NAME}. All payments must be made in full before commencement of the shoot.`;
  setFont(pdf, "times", "italic", 8.5);
  pdf.setTextColor(...MUTED);
  const noteLines = pdf.splitTextToSize(`Thank you for your business. ${notes}`, right - margin);
  pdf.text(noteLines, margin, y);

  return pdf.output("blob");
}

/** @deprecated Use {@link generateInvoicePdfBlobFromDraft}. */
export async function generateInvoicePdfBlob(
  _element: HTMLElement,
  invoice?: InvoiceDraft,
): Promise<Blob> {
  if (!invoice) throw new Error("Invoice data is required to generate PDF.");
  return generateInvoicePdfBlobFromDraft(invoice);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type SharePdfResult = "shared" | "unsupported" | "aborted";

function invoicePdfFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: "application/pdf" });
}

/** Share the PDF file only — no text body (some apps prefer text over files if both are set). */
export async function shareInvoicePdfFile(blob: Blob, filename: string): Promise<SharePdfResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }

  const file = invoicePdfFile(blob, filename);
  const payload: ShareData & { files: File[] } = { files: [file] };

  if (typeof navigator.canShare === "function" && !navigator.canShare(payload)) {
    return "unsupported";
  }

  try {
    await navigator.share(payload);
    return "shared";
  } catch (e) {
    const aborted =
      e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string })?.name === "AbortError";
    if (aborted) return "aborted";
    return "unsupported";
  }
}

function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Opens WhatsApp without prefilling a text message — attach the downloaded PDF in the app. */
export function openWhatsAppApp() {
  const mobile = isMobileUa();
  const url = mobile ? "whatsapp://send" : "https://web.whatsapp.com/";
  if (mobile) {
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Opens the default email client — mailto cannot attach files; pair with a PDF download. */
export function openEmailClientForInvoice(invoice: InvoiceDraft) {
  const subject = encodeURIComponent(`Invoice ${invoice.invoiceNo} — ${invoice.billedFrom.name}`);
  const to = invoice.billTo.email?.trim() ? encodeURIComponent(invoice.billTo.email.trim()) : "";
  window.location.href = `mailto:${to}?subject=${subject}`;
}

// Legacy alias for share message / preview components
export function formatGhs(n: number): string {
  return formatGhsPdf(n);
}
