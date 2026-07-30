import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

// Import + status for the Flex Closure ASP Report closure dates.

export interface ClosureImportResult {
  totalRows: number;
  imported: number;
  skippedNoDate: number;
  skippedNoKey: number;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

export async function importClosureDates(
  token: string,
  file: File,
): Promise<ClosureImportResult> {
  const formData = new FormData();
  formData.append("closureReport", file);
  const response = await fetch(url("/api/v1/closure-dates/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return readJson<ClosureImportResult>(response);
}

export async function getClosureDatesStatus(
  token: string,
): Promise<{ count: number }> {
  const response = await fetch(url("/api/v1/closure-dates/status"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<{ count: number }>(response);
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
  closureDate: string;
  aspCode: string;
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
