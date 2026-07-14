import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson, ApiClientError } from "./api/http";
import type {
  ApiErrorBody,
  EditedReportRowResponse,
  GeneratedReportResponse,
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
}

export async function fetchSpecialAccessMe(token: string): Promise<SpecialAccessMe> {
  const response = await fetch(url("/api/v1/special-access/me"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessMe>(response);
}

export async function fetchSpecialAccessReport(
  token: string,
): Promise<SpecialAccessScopedReport> {
  const response = await fetch(url("/api/v1/special-access/report"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<SpecialAccessScopedReport>(response);
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
