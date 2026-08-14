import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Import + per-ASP summary for the Flex RAW export — the historical Flex data the
 * standalone raw-data dashboard is built from. It is the third closed-call source on the
 * Closed Calls region cards, alongside OpenCall's own closed count and the imported
 * closure dates.
 */

export interface FlexRawSyncResult {
  totalRows: number;
  imported: number;
  skippedNoData: number;
  closed: number;
  cancelled: number;
  resolved: number;
  open: number;
  generatedAt: string | null;
}

export interface FlexRawAspCount {
  aspCode: string;
  total: number;
  closed: number;
  cancelled: number;
  resolved: number;
  open: number;
}

export interface FlexRawAspMonthCount extends FlexRawAspCount {
  month: string;
}

export interface FlexRawSummary {
  total: number;
  closed: number;
  byAsp: FlexRawAspCount[];
  byAspMonth: FlexRawAspMonthCount[];
  months: string[];
  /**
   * True when the requested from/to range was actually applied day-precise
   * against each row's WO Closed date. An older backend (or a not-yet-migrated
   * table) omits it — the caller must then fall back to month-level mapping.
   */
  dayPrecise?: boolean;
  /** Closed rows with no usable close date — invisible to ANY day range. */
  undatedClosed?: number;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

/**
 * Pulls the raw closed-call data from the raw-data project's API (server-side) and
 * refreshes the stored records. Replaces the old manual Excel upload.
 */
export async function syncFlexRawData(token: string): Promise<FlexRawSyncResult> {
  const response = await fetch(url("/api/v1/flex-raw/sync"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<FlexRawSyncResult>(response);
}

export async function getFlexRawSummary(
  token: string,
  params: { from?: string; to?: string } = {},
): Promise<FlexRawSummary> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const query = qs.toString();
  const response = await fetch(url(`/api/v1/flex-raw/summary${query ? `?${query}` : ""}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<FlexRawSummary>(response);
}

export interface FlexRawRecordRow {
  ticketNo: string;
  caseId: string;
  workLocation: string;
  callStatus: string;
  month: string;
  /** WO Closed date ("YYYY-MM-DD"); null/absent on rows or backends without one. */
  closedOn?: string | null;
}

export interface FlexRawRecordList {
  rows: FlexRawRecordRow[];
  total: number;
}

/** The raw records behind a "Raw data closures" count (defaults to closed status). */
export async function getFlexRawRecords(
  token: string,
  params: {
    asp?: string;
    from?: string;
    to?: string;
    /** Day bounds on the WO Closed date — stricter than the month bounds. */
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  },
): Promise<FlexRawRecordList> {
  const qs = new URLSearchParams();
  if (params.asp) qs.set("asp", params.asp);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.status !== undefined) qs.set("status", params.status);
  const response = await fetch(url(`/api/v1/flex-raw/records?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<FlexRawRecordList>(response);
}
