/**
 * AppFolio V2 Reporting API client.
 *
 * Uses Basic Auth with Client ID + Client Secret.
 * Docs: https://gist.github.com/omnimaxxing/2b016c518b4063fd536549b12694b7b7
 */

const APPFOLIO_CLIENT_ID = process.env.APPFOLIO_CLIENT_ID!;
const APPFOLIO_CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET!;
const APPFOLIO_DATABASE_URL = process.env.APPFOLIO_DATABASE_URL!;

function getBaseUrl() {
  if (!APPFOLIO_CLIENT_ID || !APPFOLIO_CLIENT_SECRET || !APPFOLIO_DATABASE_URL) {
    throw new Error("Missing AppFolio environment variables");
  }
  return `https://${APPFOLIO_DATABASE_URL}/api/v2/reports`;
}

function getAuthHeader() {
  const token = Buffer.from(`${APPFOLIO_CLIENT_ID}:${APPFOLIO_CLIENT_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

/* ─── Types ────────────────────────────────────────────── */

export interface BillDetailRow {
  BillId: string;
  PropertyId: string;
  PropertyName: string;
  VendorName: string;
  GlAccountId: string;
  GlAccountName: string;
  GlAccountNumber: string;
  BillDate: string;
  DueDate: string;
  PaymentDate: string | null;
  InvoiceAmount: number;
  PaidAmount: number;
  UnpaidAmount: number;
  PaymentType: string | null;
  CheckNumber: string | null;
  PaymentStatus: string;
  ReferenceNumber: string | null;
  Description: string | null;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  results: T[];
  next_page_url: string | null;
}

/* ─── Fetcher with pagination ──────────────────────────── */

async function fetchPaginated<T>(url: string): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AppFolio API ${res.status}: ${text}`);
    }

    const data: PaginatedResponse<T> = await res.json();
    all.push(...data.results);
    nextUrl = data.next_page_url ?? null;
  }

  return all;
}

/* ─── Bill Detail report ───────────────────────────────── */

export interface FetchBillDetailOptions {
  /** AppFolio property IDs to filter on */
  propertyIds?: string[];
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
  paymentStatus?: "Paid" | "Unpaid" | "All";
}

export async function fetchBillDetail(
  opts: FetchBillDetailOptions
): Promise<BillDetailRow[]> {
  const baseUrl = getBaseUrl();

  const params: Record<string, unknown> = {
    occurred_on_from: opts.fromDate,
    occurred_on_to: opts.toDate,
    paginate_results: true,
  };

  if (opts.propertyIds && opts.propertyIds.length > 0) {
    params.properties = { properties_ids: opts.propertyIds };
  }

  if (opts.paymentStatus && opts.paymentStatus !== "All") {
    params.payment_status = opts.paymentStatus.toLowerCase();
  }

  const url = `${baseUrl}/bill_detail.json`;

  // POST with body params
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio bill_detail ${res.status}: ${text}`);
  }

  const data: PaginatedResponse<BillDetailRow> = await res.json();
  const all = [...data.results];

  // Follow pagination
  let nextUrl = data.next_page_url;
  while (nextUrl) {
    const pageRes = await fetch(nextUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      cache: "no-store",
    });
    if (!pageRes.ok) break;
    const pageData: PaginatedResponse<BillDetailRow> = await pageRes.json();
    all.push(...pageData.results);
    nextUrl = pageData.next_page_url;
  }

  return all;
}

/* ─── General Ledger report ────────────────────────────── */

export interface GLRow {
  PropertyId: string;
  PropertyName: string;
  GlAccountId: string;
  GlAccountName: string;
  GlAccountNumber: string;
  Date: string;
  Description: string;
  Reference: string;
  Debit: number;
  Credit: number;
  TransactionId: string;
  TransactionType: string;
  [key: string]: unknown;
}

export async function fetchGeneralLedger(opts: {
  propertyIds?: string[];
  fromDate: string;
  toDate: string;
}): Promise<GLRow[]> {
  const baseUrl = getBaseUrl();

  const params: Record<string, unknown> = {
    posted_on_from: opts.fromDate,
    posted_on_to: opts.toDate,
    paginate_results: true,
    accounting_basis: "Accrual",
  };

  if (opts.propertyIds && opts.propertyIds.length > 0) {
    params.properties = { properties_ids: opts.propertyIds };
  }

  const url = `${baseUrl}/general_ledger.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio general_ledger ${res.status}: ${text}`);
  }

  const data: PaginatedResponse<GLRow> = await res.json();
  const all = [...data.results];

  let nextUrl = data.next_page_url;
  while (nextUrl) {
    const pageRes = await fetch(nextUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      cache: "no-store",
    });
    if (!pageRes.ok) break;
    const pageData: PaginatedResponse<GLRow> = await pageRes.json();
    all.push(...pageData.results);
    nextUrl = pageData.next_page_url;
  }

  return all;
}
