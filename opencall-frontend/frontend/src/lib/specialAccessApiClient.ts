import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson, ApiClientError } from "./api/http";
import type { ApiErrorBody, GeneratedReportResponse } from "./api/types";

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
