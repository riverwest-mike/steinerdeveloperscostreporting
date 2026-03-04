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

/** AppFolio next_page_url is sometimes a relative path — make it absolute. */
function resolveNextUrl(nextPageUrl: string): string {
  if (nextPageUrl.startsWith("http")) return nextPageUrl;
  return `https://${APPFOLIO_DATABASE_URL}${nextPageUrl}`;
}

function getAuthHeader() {
  const token = Buffer.from(`${APPFOLIO_CLIENT_ID}:${APPFOLIO_CLIENT_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

/* ─── Types ────────────────────────────────────────────── */

/** Matches the actual snake_case fields returned by AppFolio bill_detail.json */
export interface BillDetailRow {
  payable_invoice_detail_id: number;
  txn_id: number;
  property_id: number;
  property_name: string;
  payee_name: string;
  account_number: string;
  account_name: string;
  bill_date: string;
  due_date: string;
  payment_date: string | null;
  /** String like "3327.50" */
  paid: string;
  /** String like "0.00" */
  unpaid: string;
  check_number: string | null;
  approval_status: string;
  reference_number: string | null;
  description: string | null;
  other_payment_type: string | null;
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
    const pageRes = await fetch(resolveNextUrl(nextUrl), {
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

/* ─── Vendor Ledger report ─────────────────────────────── */

/**
 * Row returned by AppFolio vendor_ledger.json report.
 * The Project Cost Category field contains the construction cost code + name,
 * e.g. "010700 Survey" or "020300 Environmental".
 *
 * AppFolio may return this as "project_cost_category" or "Project_Cost_Category"
 * depending on the API version. Use getProjectCostCategory() to read it safely.
 */
export interface VendorLedgerRow {
  payable_invoice_detail_id: number;
  txn_id: number;
  property_id: number;
  property_name: string;
  payee_name: string;
  account_number: string;
  account_name: string;
  bill_date: string;
  due_date: string;
  payment_date: string | null;
  /** String like "3327.50" */
  paid: string;
  /** String like "0.00" */
  unpaid: string;
  check_number: string | null;
  description: string | null;
  // Lowercase variant
  project_cost_category?: string | null;
  // Mixed-case variant (AppFolio sometimes returns Pascal_Snake_Case)
  Project_Cost_Category?: string | null;
  [key: string]: unknown;
}

/**
 * Read the Project Cost Category field from a VendorLedgerRow regardless of
 * the capitalisation AppFolio uses in the JSON response.
 * Tries every known variant; returns null when none is present.
 */
export function getProjectCostCategory(row: VendorLedgerRow): string | null {
  return (
    (row.project_cost_category as string | null | undefined) ??
    (row.Project_Cost_Category as string | null | undefined) ??
    // Catch any other mixed-case/camelCase variants via the index signature
    (row["projectCostCategory"] as string | null | undefined) ??
    (row["cost_category"] as string | null | undefined) ??
    null
  );
}

export interface FetchVendorLedgerOptions {
  propertyIds?: string[];
  fromDate: string;
  toDate: string;
  paymentStatus?: "Paid" | "Unpaid" | "All";
}

export async function fetchVendorLedger(
  opts: FetchVendorLedgerOptions
): Promise<VendorLedgerRow[]> {
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

  const url = `${baseUrl}/vendor_ledger.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio vendor_ledger ${res.status}: ${text}`);
  }

  const data: PaginatedResponse<VendorLedgerRow> = await res.json();
  const all = [...data.results];

  let nextUrl = data.next_page_url;
  while (nextUrl) {
    const pageRes = await fetch(resolveNextUrl(nextUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
      cache: "no-store",
    });
    if (!pageRes.ok) break;
    const pageData: PaginatedResponse<VendorLedgerRow> = await pageRes.json();
    all.push(...pageData.results);
    nextUrl = pageData.next_page_url;
  }

  return all;
}

/**
 * Parse an AppFolio cost_category string like "010700 Survey" into
 * { code: "010700", name: "Survey" }.
 * Returns nulls if the value is blank or doesn't start with digits.
 */
export function parseCostCategory(raw: string | null | undefined): {
  code: string | null;
  name: string | null;
} {
  if (!raw || !raw.trim()) return { code: null, name: null };
  const trimmed = raw.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { code: trimmed, name: null };
  return {
    code: trimmed.slice(0, spaceIdx),
    name: trimmed.slice(spaceIdx + 1).trim() || null,
  };
}

/* ─── Balance Sheet report ─────────────────────────────── */

/**
 * Row returned by AppFolio balance_sheet.json report.
 * Represents one GL account's balance at a point in time.
 */
export interface BalanceSheetRow {
  property_id: string;
  property_name: string;
  account_id: string;
  account_name: string;
  account_number: string | null;
  /** e.g. "Asset", "Liability", "Equity" */
  account_type: string;
  balance: number;
  [key: string]: unknown;
}

export async function fetchBalanceSheet(opts: {
  propertyIds?: string[];
  asOfDate: string;            // YYYY-MM-DD
  accountingBasis: "Cash" | "Accrual";
}): Promise<BalanceSheetRow[]> {
  const baseUrl = getBaseUrl();

  const params: Record<string, unknown> = {
    as_of_date: opts.asOfDate,
    accounting_basis: opts.accountingBasis,
    paginate_results: true,
  };

  if (opts.propertyIds && opts.propertyIds.length > 0) {
    params.properties = { properties_ids: opts.propertyIds };
  }

  const url = `${baseUrl}/balance_sheet.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio balance_sheet ${res.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: unknown = await res.json();

  // Normalise whichever shape AppFolio returns into a flat BalanceSheetRow[].
  // Log the top-level shape so any future mismatch is diagnosable.
  const rows = extractRows(raw);
  if (rows === null) {
    const shape = raw && typeof raw === "object"
      ? `keys: ${Object.keys(raw as object).join(", ")}`
      : `type: ${typeof raw}`;
    throw new Error(
      `AppFolio balance_sheet: unexpected response shape (${shape}). ` +
      `Raw (first 500 chars): ${JSON.stringify(raw).slice(0, 500)}`
    );
  }

  // Follow pagination if the standard paginated envelope was used
  if (
    raw && typeof raw === "object" && "next_page_url" in (raw as object) &&
    (raw as { next_page_url: string | null }).next_page_url
  ) {
    let nextUrl: string | null = (raw as { next_page_url: string | null }).next_page_url;
    while (nextUrl) {
      const pageRes = await fetch(resolveNextUrl(nextUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: getAuthHeader() },
        cache: "no-store",
      });
      if (!pageRes.ok) break;
      const pageRaw: unknown = await pageRes.json();
      const pageRows = extractRows(pageRaw);
      if (pageRows) rows.push(...pageRows);
      nextUrl = (pageRaw && typeof pageRaw === "object" && "next_page_url" in (pageRaw as object))
        ? (pageRaw as { next_page_url: string | null }).next_page_url
        : null;
    }
  }

  return rows;
}

/**
 * Try every known AppFolio response shape for the balance_sheet report and
 * return a flat BalanceSheetRow[]. Returns null if the shape is unrecognised.
 */
function extractRows(raw: unknown): BalanceSheetRow[] | null {
  if (!raw || typeof raw !== "object") return null;

  // Shape 1: standard paginated envelope { results: [...], next_page_url }
  if ("results" in (raw as object) && Array.isArray((raw as { results: unknown }).results)) {
    return (raw as { results: BalanceSheetRow[] }).results;
  }

  // Shape 2: direct array
  if (Array.isArray(raw)) return raw as BalanceSheetRow[];

  // Shape 3: { data: [...] }
  if ("data" in (raw as object) && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: BalanceSheetRow[] }).data;
  }

  // Shape 4: { balance_sheet: [...] }  — named root key
  if ("balance_sheet" in (raw as object) && Array.isArray((raw as { balance_sheet: unknown }).balance_sheet)) {
    return (raw as { balance_sheet: BalanceSheetRow[] }).balance_sheet;
  }

  // Shape 5: { balance_sheet: { sections: [{ accounts: [...] }] } } — nested sections
  if (
    "balance_sheet" in (raw as object) &&
    typeof (raw as { balance_sheet: unknown }).balance_sheet === "object"
  ) {
    const bs = (raw as { balance_sheet: { sections?: { section_name?: string; accounts?: BalanceSheetRow[] }[] } }).balance_sheet;
    if (bs.sections && Array.isArray(bs.sections)) {
      const flattened: BalanceSheetRow[] = [];
      for (const section of bs.sections) {
        const type = section.section_name ?? "Other";
        for (const acct of section.accounts ?? []) {
          flattened.push({ ...acct, account_type: acct.account_type ?? type });
        }
      }
      return flattened;
    }
  }

  return null;
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
    const pageRes = await fetch(resolveNextUrl(nextUrl), {
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
