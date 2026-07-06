import type { InvoiceDraft } from "@/lib/invoices-types";

const STORAGE_KEY = "gidostorage:invoices";

export type StoredInvoice = {
  id: string;
  savedAtISO: string;
  draft: InvoiceDraft;
};

function readAll(): StoredInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is StoredInvoice =>
        Boolean(row && typeof row === "object" && typeof row.id === "string" && row.draft),
    );
  } catch {
    return [];
  }
}

function writeAll(rows: StoredInvoice[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function listStoredInvoices(): StoredInvoice[] {
  return readAll().sort((a, b) => b.savedAtISO.localeCompare(a.savedAtISO));
}

export function saveStoredInvoice(draft: InvoiceDraft): StoredInvoice {
  const row: StoredInvoice = {
    id: crypto.randomUUID(),
    savedAtISO: new Date().toISOString(),
    draft,
  };
  const next = [row, ...readAll()];
  writeAll(next);
  return row;
}

export function getStoredInvoice(id: string): StoredInvoice | null {
  return readAll().find((row) => row.id === id) ?? null;
}

export function updateStoredInvoice(id: string, draft: InvoiceDraft): StoredInvoice | null {
  const rows = readAll();
  const idx = rows.findIndex((row) => row.id === id);
  if (idx === -1) return null;
  const updated: StoredInvoice = {
    ...rows[idx],
    savedAtISO: new Date().toISOString(),
    draft,
  };
  rows[idx] = updated;
  writeAll(rows);
  return updated;
}

export function deleteStoredInvoice(id: string) {
  writeAll(readAll().filter((row) => row.id !== id));
}
