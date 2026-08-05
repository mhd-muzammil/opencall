import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson, ApiClientError } from "./api/http";
import type {
  ApiErrorBody,
  DropdownEngineer,
  DropdownRtplStatus,
  EditedReportRowResponse,
  GeneratedReportResponse,
  RegionEodStateResponse,
  RtplStatusChange,
} from "./api/types";
import type { RecordColumnCatalog, RecordLayout } from "./recordLayoutApiClient";
import type { ReportRowPatchValues } from "../features/dashboard/types/dashboard.types";

export type DataScope = "overall" | "warranty" | "trade";
export type PermissionLevel = "view" | "edit";

export interface AccessRole {
  id: string;
  name: string;
  description: string | null;
  defaultSections: string[];
  defaultDataScope: DataScope;
  defaultPermissionLevel: PermissionLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpecialAccessRecord {
  id: string;
  username: string;
  roleId: string | null;
  roleName: string | null;
  sections: string[];
  allRegions: boolean;
  regions: string[];
  dataScope: DataScope;
  permissionLevel: PermissionLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpecialAccessOptions {
  sections: { key: string; label: string; group: string }[];
  dataScopes: { value: DataScope; label: string; description: string }[];
  permissionLevels: { value: PermissionLevel; label: string; description: string }[];
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

/** For 204 No Content endpoints (readJson expects a `{ data }` envelope). */
async function sendNoContent(
  path: string,
  token: string,
  method: string,
): Promise<void> {
  const response = await fetch(url(path), {
    method,
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      body?.error?.message ?? `Request failed ${response.status}`,
      response.status,
      body,
    );
  }
}

const BASE = "/api/v1/admin/special-access";

export async function getSpecialAccessOptions(
  token: string,
): Promise<SpecialAccessOptions> {
  const response = await fetch(url(`${BASE}/options`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessOptions>(response);
}

// --------------------------- roles ---------------------------

export async function listAccessRoles(
  token: string,
  includeInactive = false,
): Promise<AccessRole[]> {
  const qs = includeInactive ? "?includeInactive=true" : "";
  const response = await fetch(url(`${BASE}/roles${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<AccessRole[]>(response);
}

export interface CreateAccessRoleInput {
  name: string;
  description?: string | null;
  defaultSections: string[];
  defaultDataScope: DataScope;
  defaultPermissionLevel: PermissionLevel;
}

export async function createAccessRole(
  token: string,
  input: CreateAccessRoleInput,
): Promise<AccessRole> {
  const response = await fetch(url(`${BASE}/roles`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<AccessRole>(response);
}

export type UpdateAccessRoleInput = Partial<CreateAccessRoleInput> & {
  isActive?: boolean;
};

export async function updateAccessRole(
  token: string,
  id: string,
  input: UpdateAccessRoleInput,
): Promise<AccessRole> {
  const response = await fetch(url(`${BASE}/roles/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<AccessRole>(response);
}

export function deleteAccessRole(token: string, id: string): Promise<void> {
  return sendNoContent(`${BASE}/roles/${id}`, token, "DELETE");
}

// --------------------------- logins ---------------------------

export async function listSpecialAccess(
  token: string,
): Promise<SpecialAccessRecord[]> {
  const response = await fetch(url(`${BASE}/logins`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessRecord[]>(response);
}

export interface CreateSpecialAccessInput {
  username: string;
  password: string;
  roleId?: string | null;
  sections: string[];
  allRegions: boolean;
  regions: string[];
  dataScope: DataScope;
  permissionLevel: PermissionLevel;
}

export async function createSpecialAccess(
  token: string,
  input: CreateSpecialAccessInput,
): Promise<SpecialAccessRecord> {
  const response = await fetch(url(`${BASE}/logins`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<SpecialAccessRecord>(response);
}

export interface UpdateSpecialAccessInput {
  roleId?: string | null;
  sections?: string[];
  allRegions?: boolean;
  regions?: string[];
  dataScope?: DataScope;
  permissionLevel?: PermissionLevel;
  isActive?: boolean;
}

export async function updateSpecialAccess(
  token: string,
  id: string,
  input: UpdateSpecialAccessInput,
): Promise<SpecialAccessRecord> {
  const response = await fetch(url(`${BASE}/logins/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<SpecialAccessRecord>(response);
}

export async function resetSpecialAccessPassword(
  token: string,
  id: string,
  password: string,
): Promise<SpecialAccessRecord> {
  const response = await fetch(url(`${BASE}/logins/${id}/password`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ password }),
  });
  return readJson<SpecialAccessRecord>(response);
}

export function deleteSpecialAccess(token: string, id: string): Promise<void> {
  return sendNoContent(`${BASE}/logins/${id}`, token, "DELETE");
}

// --------------- operational endpoints (special-access logins) ---------------

export interface SpecialAccessMe {
  id: string;
  username: string;
  roleId: string | null;
  roleName: string | null;
  sections: string[];
  allRegions: boolean;
  regions: string[];
  dataScope: DataScope;
  permissionLevel: PermissionLevel;
}

export interface SpecialAccessScopedReport {
  report: GeneratedReportResponse | null;
  dataScope: DataScope;
  permissionLevel: PermissionLevel;
  /** The day the returned report covers; null when there is no report at all. */
  reportDate: string | null;
}

export async function fetchSpecialAccessMe(token: string): Promise<SpecialAccessMe> {
  const response = await fetch(url("/api/v1/special-access/me"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessMe>(response);
}

/**
 * The scoped report. `reportDate` (YYYY-MM-DD) opens a past day; omit it for the
 * latest. Past days are otherwise unreachable for special access — /report-history
 * and /reports/daily-call-plan/generate are both user-only.
 */
export async function fetchSpecialAccessReport(
  token: string,
  reportDate?: string,
): Promise<SpecialAccessScopedReport> {
  const path = reportDate
    ? `/api/v1/special-access/report?date=${encodeURIComponent(reportDate)}`
    : "/api/v1/special-access/report";
  const response = await fetch(url(path), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessScopedReport>(response);
}

/** Days this credential may open, newest first. Drives its date pickers. */
export async function fetchSpecialAccessReportDates(
  token: string,
): Promise<string[]> {
  const response = await fetch(url("/api/v1/special-access/report-dates"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return (await readJson<{ dates: string[] }>(response)).dates;
}

/**
 * RTPL status activity, scoped to the credential's regions. Mirrors
 * GET /report-rows/rtpl-status-changes, which is role-guarded — the feed used to
 * be left permanently empty rather than fire a call that could only 401.
 */
export async function getSpecialAccessRtplStatusChanges(input: {
  token: string;
  reportId: string;
  changeDate?: string;
  limit?: number;
}): Promise<RtplStatusChange[]> {
  const params = new URLSearchParams({ reportId: input.reportId });
  if (input.changeDate) params.set("changeDate", input.changeDate);
  if (input.limit) params.set("limit", String(input.limit));

  const response = await fetch(
    url(`/api/v1/special-access/rtpl-status-changes?${params.toString()}`),
    { headers: authHeaders(input.token), cache: "no-store" },
  );
  return readJson<RtplStatusChange[]>(response);
}

// --- Work Order Details & Entry reference data (engineer + RTPL status pickers) ---
// The admin dropdown endpoints are role-guarded, so a special-access token 401s on them
// and the entry modal used to open with an empty Engineer picker and the hard-coded RTPL
// status list. These are the scoped equivalents; engineers come back scoped to the
// credential's granted regions.

export async function getSpecialAccessEngineersDropdown(
  token: string,
): Promise<{ engineers: DropdownEngineer[] }> {
  const response = await fetch(url("/api/v1/special-access/engineers/dropdown"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<{ engineers: DropdownEngineer[] }>(response);
}

export async function getSpecialAccessRtplStatusesDropdown(
  token: string,
): Promise<{ statuses: DropdownRtplStatus[] }> {
  const response = await fetch(url("/api/v1/special-access/rtpl-statuses/dropdown"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<{ statuses: DropdownRtplStatus[] }>(response);
}

// ----------- Record Format (a special-access login's own grid layout) -----------
// Same shape as the user-only /record-layout endpoints, but scoped to the
// credential. Only affects that credential's own records grid and Excel export.

const SA_LAYOUT = "/api/v1/special-access/record-layout";

export async function getSpecialAccessRecordColumnsCatalog(
  token: string,
): Promise<RecordColumnCatalog> {
  const response = await fetch(url(`${SA_LAYOUT}/catalog`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RecordColumnCatalog>(response);
}

export async function getSpecialAccessRecordLayout(
  token: string,
): Promise<RecordLayout | null> {
  const response = await fetch(url(SA_LAYOUT), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RecordLayout | null>(response);
}

export async function saveSpecialAccessRecordLayout(
  token: string,
  orderedColumns: string[],
): Promise<RecordLayout> {
  const response = await fetch(url(SA_LAYOUT), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ orderedColumns }),
  });
  return readJson<RecordLayout>(response);
}

export async function resetSpecialAccessRecordLayout(token: string): Promise<void> {
  await fetch(url(SA_LAYOUT), { method: "DELETE", headers: authHeaders(token) });
}

// ----------------- Final EOD for a special-access login -----------------
// GET /reports/:date/eod-state and POST /regions/:id/eod/close are role-guarded, so
// they 401 for special access: the productivity view could not tell which regions
// were frozen, and the Final EOD button was absent entirely. These scoped
// equivalents return only granted regions, and the close is rejected server-side
// unless the credential has `edit` permission and the `productivity` grant.

export async function getSpecialAccessRegionEodState(
  token: string,
  workingDate: string,
): Promise<RegionEodStateResponse> {
  const response = await fetch(
    url(`/api/v1/special-access/eod-state/${encodeURIComponent(workingDate)}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<RegionEodStateResponse>(response);
}

export async function closeSpecialAccessRegionEod(
  token: string,
  regionId: string,
  workingDate: string,
): Promise<unknown> {
  const response = await fetch(
    url(`/api/v1/special-access/regions/${encodeURIComponent(regionId)}/eod/close`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ workingDate }),
    },
  );
  return readJson<unknown>(response);
}

// ---------- Records table "Save Entry" for a special-access login ----------
// Same payload and response as the user-only PATCH /report-rows/:id. The backend
// re-checks the credential's permission level, granted regions and data scope, so a
// view-only or out-of-scope edit is rejected there, not here.

export async function updateSpecialAccessReportRow(input: {
  token: string;
  rowId: string;
  values: ReportRowPatchValues;
}): Promise<EditedReportRowResponse> {
  const response = await fetch(
    url(`/api/v1/special-access/report-rows/${input.rowId}`),
    {
      method: "PATCH",
      headers: authHeaders(input.token),
      body: JSON.stringify(input.values),
    },
  );
  return readJson<EditedReportRowResponse>(response);
}
