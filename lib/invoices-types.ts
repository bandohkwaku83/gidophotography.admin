export type InvoiceCurrency = "GHS";

export type InvoiceBillTo = {
  name: string;
  email?: string;
  address?: string;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  /** Unit price, in GHS. */
  unitPriceGHS: number;
};

export type InvoicePaymentStatus = "paid" | "partial" | "pending";

export type InvoiceDraft = {
  currency: InvoiceCurrency;
  invoiceNo: string;
  /** Set automatically when the invoice is generated. */
  invoiceDateISO: string; // YYYY-MM-DD
  dueDateISO: string; // YYYY-MM-DD
  /** Shoot / service date (from booking or manual entry). */
  shootDateISO?: string;
  bookingId?: string;
  title?: string;
  shootType?: string;
  billTo: InvoiceBillTo;

  /** Sender / studio. */
  billedFrom: {
    name: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
  };

  notes?: string;
  items: InvoiceLineItem[];

  /** Computed totals (still stored so preview can be stable). */
  taxRate: number; // e.g. 0.1
  subtotalGHS: number;
  taxGHS: number;
  totalGHS: number;

  amountPayingGHS?: number;
  paymentStatus?: InvoicePaymentStatus;
  paymentPercent?: number;
};

