import { WEB_API_BASE_URL } from "./api/webApiClient";

export type RcaSeverity = "ok" | "warn" | "critical";

export type RcaStatusFilter = "all" | "stale" | "critical" | "active";

export type RcaTrackedField =
  | "rtpl_status"
  | "segment"
  | "engineer"
  | "location"
  | "case_created_time"
  | "hp_owner_status"
  | "customer_mail"
  | "rca"
  | "remarks"
  | "manual_notes";

export type RcaActionKind =
  | "FIRST_APPEARANCE"
  | "MANUAL_EDIT"
  | "FRESH_FROM_UPLOAD"
  | "CARRIED_FORWARD"
  | "NO_CHANGE";

export interface RcaCaseSummary {
  ticketId: string;
  ticketKey: string;
  caseId: string | null;
  customerName: string | null;
  accountName: string | null;
  customerMail: string | null;
  contact: string | null;
  workLocation: string | null;
  regionId: string | null;
  regionName: string | null;
  regionCode: string | null;
  engineer: string | null;
  status: string | null;
  segment: string | null;
  location: string | null;
  product: string | null;
  remarks: string | null;
  manualNotes: string | null;
  rca: string | null;
  caseCreatedTime: string | null;
  latestReportId: string;
  latestReportDate: string;
  firstSeenDate: string | null;
  daysOpen: number;
  daysSinceLastAction: number;
  lastActionAt: string | null;
  lastActionUserId: string | null;
  lastActionUsername: string | null;
  lastActionEmail: string | null;
  totalAppearances: number;
  totalActions: number;
  manualFieldsCompleted: boolean;
  carriedForwardFields: RcaTrackedField[];
  severity: RcaSeverity;
  isStale: boolean;
}

export interface RcaListSummary {
  generatedAt: string;
  latestReportDate: string | null;
  totalOpen: number;
  totalStale: number;
  totalCritical: number;
  avgDaysSinceLastAction: number;
  avgDaysOpen: number;
  staleThresholdDays: number;
  criticalThresholdDays: number;
  recencyWindowDays: number;
  regionsCovered: number;
}

export interface RcaListResult {
  summary: RcaListSummary;
  rows: RcaCaseSummary[];
  total: number;
  staleCount: number;
  criticalCount: number;
}

export interface RcaTimelineEntry {
  reportId: string;
  reportDate: string;
  reportCreatedAt: string;
  regionId: string | null;
  regionName: string | null;
  regionCode: string | null;
  workLocation: string | null;
  status: string | null;
  engineer: string | null;
  location: string | null;
  segment: string | null;
  remarks: string | null;
  manualNotes: string | null;
  rca: string | null;
  customerMail: string | null;
  caseId: string | null;
  caseCreatedTime: string | null;
  matchStatus: string;
  carriedForwardFields: RcaTrackedField[];
  manualFieldsCompleted: boolean;
  manualFieldsMissing: RcaTrackedField[];
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByUsername: string | null;
  updatedByEmail: string | null;
  dayNo: number;
  daysSincePreviousEntry: number;
  changedFields: RcaTrackedField[];
  actionTaken: boolean;
  actionKind: RcaActionKind;
}

export interface RcaTimelineResponse {
  ticketId: string;
  caseId: string | null;
  customerName: string | null;
  accountName: string | null;
  customerMail: string | null;
  workLocation: string | null;
  regionId: string | null;
  regionName: string | null;
  regionCode: string | null;
  caseCreatedTime: string | null;
  firstSeenDate: string | null;
  latestReportDate: string | null;
  currentStatus: string | null;
  currentEngineer: string | null;
  currentRca: string | null;
  daysOpen: number;
  daysSinceLastAction: number;
  totalAppearances: number;
  totalActions: number;
  isStale: boolean;
  severity: RcaSeverity;
  entries: RcaTimelineEntry[];
}

export interface ListRcaCasesFilters {
  regionId?: string;
  status?: RcaStatusFilter;
  search?: string;
  limit?: number;
  offset?: number;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: { data?: T; error?: { message?: string } } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body?.error?.message ?? `Request failed ${response.status}`;
    throw new Error(message);
  }
  if (!body || body.data === undefined) {
    throw new Error("Unexpected API response");
  }
  return body.data;
}

export async function listRcaCases(
  token: string,
  filters: ListRcaCasesFilters = {},
): Promise<RcaListResult> {
  const params = new URLSearchParams();
  if (filters.regionId) params.set("regionId", filters.regionId);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const qs = params.toString();
  const response = await fetch(
    url(`/api/v1/admin/rca/cases${qs ? `?${qs}` : ""}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<RcaListResult>(response);
}

export async function getRcaTimeline(
  token: string,
  ticketId: string,
): Promise<RcaTimelineResponse> {
  const response = await fetch(
    url(`/api/v1/admin/rca/cases/${encodeURIComponent(ticketId)}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<RcaTimelineResponse>(response);
}
