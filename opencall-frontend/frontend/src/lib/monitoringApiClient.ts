import { WEB_API_BASE_URL } from "./api/webApiClient";

export type ActivityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "USER_CREATED"
  | "USER_PROFILE_UPDATED"
  | "USER_ROLE_CHANGED"
  | "USER_REGION_REASSIGNED"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "UPLOAD_CREATED"
  | "REPORT_GENERATED"
  | "REPORT_ROW_EDITED";

export interface MonitoringDashboardSummary {
  activeRegions: number;
  totalRegions: number;
  totalActiveUsers: number;
  totalReports30d: number;
  totalPendingManualEntries: number;
}

export interface RtplMetric {
  rtplStatus: string;
  count: number;
}

export interface RegionDashboardEntry {
  regionId: string;
  regionCode: string;
  regionName: string;
  regionIsActive: boolean;
  activeUserCount: number;
  recentLoginCount24h: number;
  reportCount30d: number;
  failedBatchCount30d: number;
  pendingManualEntries: number;
  lastLoginAt: string | null;
  lastUploadAt: string | null;
  lastReportGeneratedAt: string | null;
  rtplMetrics: RtplMetric[];
}

export interface RecentLoginRow {
  userId: string;
  username: string | null;
  email: string;
  role: "SUPER_ADMIN" | "REGION_ADMIN";
  regionId: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
}

export interface RecentUploadRow {
  batchId: string;
  originalFileName: string;
  sourceType: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
  regionId?: string | null;
}

export interface RecentReportRow {
  reportId: string;
  reportDate: string;
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  createdAt: string;
  regionId?: string | null;
}

export interface MonitoringDashboard {
  generatedAt: string;
  summary: MonitoringDashboardSummary;
  regions: RegionDashboardEntry[];
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
}

export interface ActivityRow {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: "SUPER_ADMIN" | "REGION_ADMIN" | null;
  actorUsername: string | null;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  eventType: ActivityEventType;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  status: "SUCCESS" | "FAILURE";
}

export interface ListActivityResult {
  rows: ActivityRow[];
  total: number;
}

export interface RegionDrillDown {
  region: RegionDashboardEntry;
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
  recentActivity: ActivityRow[];
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

export async function getMonitoringDashboard(
  token: string,
  _regionId: string | null,
  limit: number,
): Promise<MonitoringDashboard> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const response = await fetch(
    url(`/api/v1/admin/monitoring/dashboard${qs ? `?${qs}` : ""}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<MonitoringDashboard>(response);
}

export async function getRegionDrillDown(
  token: string,
  regionId: string,
  limit: number,
): Promise<RegionDrillDown> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const response = await fetch(
    url(
      `/api/v1/admin/monitoring/regions/${regionId}${qs ? `?${qs}` : ""}`,
    ),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<RegionDrillDown>(response);
}

export interface ListActivityFilters {
  regionId?: string;
  actorUserId?: string;
  eventType?: ActivityEventType;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listActivity(
  token: string,
  filters: ListActivityFilters = {},
): Promise<ListActivityResult> {
  const params = new URLSearchParams();
  if (filters.regionId) params.set("regionId", filters.regionId);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const qs = params.toString();
  const response = await fetch(
    url(`/api/v1/admin/activity${qs ? `?${qs}` : ""}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ListActivityResult>(response);
}
