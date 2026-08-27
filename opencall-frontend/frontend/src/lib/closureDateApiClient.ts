import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

// Import + status for the Flex Closure ASP Report closure dates.

export interface ClosureImportResult {
  /** Data rows in the workbook (one per PART ORDER, not per work order). */
  totalRows: number;
  /** Distinct work orders after collapsing those part-order rows. */
  workOrders: number;
  imported: number;
  skippedNoKey: number;
  /** Stored with no closure date — Flex closes cancellations without one. */
  withoutClosureDate: number;
  /** Always 0: a missing closure date is no longer a reason to drop a row. */
  skippedNoDate: number;
  byStatus: { closed: number; cancelled: number; other: number };
  mode: "replace" | "merge";
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

/**
 * Imports a Flex Closure ASP Report from the "Import Closure Dates" button.
 *
 * Sends `merge` explicitly rather than leaning on the server's default: this call
 * used to send no mode at all, the server read that as `replace`, and a partial
 * export therefore wiped the closure history down to whatever that one file held.
 * Saying which mode we want — where the file is chosen — is what stops a server
 * default ever deciding that again.
 *
 * Merge adds and refreshes the closures in the file and touches nothing else. A
 * genuine full-rebuild is a deliberate, separate act (`mode=replace`).
 */
export async function importClosureDates(
  token: string,
  file: File,
): Promise<ClosureImportResult> {
  const formData = new FormData();
  formData.append("closureReport", file);
  formData.append("mode", "merge");
  const response = await fetch(url("/api/v1/closure-dates/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return readJson<ClosureImportResult>(response);
}

export interface ClosureImportStatus {
  count: number;
  /** ISO instant of the most recent import, or null when nothing is stored. */
  lastImportedAt: string | null;
  /** 'AUTO' (the FieldEZ worker) or 'MANUAL' (the import button). */
  lastImportSource: string | null;
  /** YYYY-MM-DD of the latest closure day covered. */
  lastClosedOn: string | null;
  /**
   * ISO instant of the most recent import RUN, imported-0 runs included — the sync
   * liveness signal. `lastImportedAt` only moves when rows were written, which on an
   * empty new-day export is hours behind a perfectly healthy worker. Null from a
   * backend without migration 042 (fall back to `lastImportedAt`).
   */
  lastSyncAt?: string | null;
  /** 'AUTO' / 'MANUAL' — the source of that most recent run. */
  lastSyncSource?: string | null;
  /** Work orders that run imported (0 for an empty export). */
  lastSyncImported?: number | null;
}

export async function getClosureDatesStatus(
  token: string,
): Promise<ClosureImportStatus> {
  const response = await fetch(url("/api/v1/closure-dates/status"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<ClosureImportStatus>(response);
}

export interface ClosureDateSummary {
  /** Every stored closure date, matched to a region or not. */
  total: number;
  /** Closure dates whose WO id / Case id could not be traced to a Work Location. */
  unmatched: number;
  byAsp: Array<{ aspCode: string; count: number }>;
  byAspMonth: Array<{ aspCode: string; month: string; count: number }>;
  /** Distinct months present, ascending ("YYYY-MM"). */
  months: string[];
}

/**
 * Per-ASP breakdown of the imported closure dates, for the Closed Calls region cards.
 * The closure report itself has no region column, so the server recovers each row's
 * Work Location from the report rows (and the imported raw data, when present). Optional
 * day-precise `from` / `to` ("YYYY-MM-DD") scope the counts to a date range.
 */
export async function getClosureDatesSummary(
  token: string,
  params: { from?: string; to?: string } = {},
): Promise<ClosureDateSummary> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(url(`/api/v1/closure-dates/summary${suffix}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<ClosureDateSummary>(response);
}

export interface ClosureDateRecordRow {
  woId: string;
  caseId: string;
  /** DD-MM-YYYY, or '' when Flex closed it without one (a cancellation). */
  closureDate: string;
  aspCode: string;
  /** Flex's own status — explains a blank closure date. */
  closureStatus: string;
}

export interface ClosureDateRecordList {
  rows: ClosureDateRecordRow[];
  total: number;
}

/** The closure dates behind a "FieldEZ data closure" count for a region + month range. */
export async function getClosureDateRecords(
  token: string,
  params: { asp?: string; from?: string; to?: string },
): Promise<ClosureDateRecordList> {
  const qs = new URLSearchParams();
  if (params.asp) qs.set("asp", params.asp);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const response = await fetch(url(`/api/v1/closure-dates/records?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<ClosureDateRecordList>(response);
}

export interface ReconciliationRow {
  ticketId: string;
  caseId: string;
  aspCode: string;
  /** The evening-first RTPL status we closed it under ('' when only Flex closed it). */
  rtplStatus: string;
  /** Flex's own status ('' when Flex has no closure for the day). */
  closureStatus: string;
  closureDate: string;
  /** Hours since we recorded the close — how long Flex has been behind us. */
  hoursSinceClosedHere: number | null;
}

export interface ClosureReconciliation {
  date: string;
  matched: ReconciliationRow[];
  closedHereNotInFlex: ReconciliationRow[];
  closedInFlexNotHere: ReconciliationRow[];
  counts: {
    matched: number;
    closedHereNotInFlex: number;
    closedInFlexNotHere: number;
  };
}

/**
 * "Did Flex agree with us on this day?" — the calls the team marked closed on the Open
 * Call Report versus the closures Flex actually reported. Informational only; nothing is
 * auto-closed on either side.
 */
export async function getClosureReconciliation(
  token: string,
  params: { date: string; to?: string; asp?: string },
): Promise<ClosureReconciliation> {
  const qs = new URLSearchParams({ date: params.date });
  // The last day of the period, inclusive. Sent only when there is one, so a caller asking
  // about a single day gets exactly the request it made before ranges existed.
  if (params.to) qs.set("to", params.to);
  if (params.asp) qs.set("asp", params.asp);
  const response = await fetch(
    url(`/api/v1/closure-dates/reconciliation?${qs.toString()}`),
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  return readJson<ClosureReconciliation>(response);
}
