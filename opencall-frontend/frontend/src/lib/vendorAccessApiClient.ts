import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson, ApiClientError } from "./api/http";
import type {
  ApiErrorBody,
  EditedReportRowResponse,
  GeneratedReportResponse,
} from "./api/types";
import type { ReportRowPatchValues } from "../features/dashboard/types/dashboard.types";

export type VendorPermissionLevel = "view" | "update";

export interface VendorAccessRecord {
  id: string;
  username: string;
  sections: string[];
  permissionLevel: VendorPermissionLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorAccessListItem extends VendorAccessRecord {
  assignedCases: number;
}

export interface VendorAccessOptions {
  sections: { key: string; label: string; group: string }[];
  permissionLevels: { value: VendorPermissionLevel; label: string; description: string }[];
}

export interface VendorCaseAssignment {
  id: string;
  vendorAccessId: string;
  normalizedTicketId: string;
  ticketId: string;
  normalizedCaseId: string;
  caseId: string;
  assignedAt: string;
}

export interface VendorScopedReport {
  report: GeneratedReportResponse | null;
  permissionLevel: VendorPermissionLevel;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function sendNoContent(path: string, token: string, method: string): Promise<void> {
  const response = await fetch(url(path), { method, headers: authHeaders(token) });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      body?.error?.message ?? `Request failed ${response.status}`,
      response.status,
      body,
    );
  }
}

// =================================================================== admin
const BASE = "/api/v1/admin/vendor-access";

export async function getVendorAccessOptions(token: string): Promise<VendorAccessOptions> {
  const response = await fetch(url(`${BASE}/options`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorAccessOptions>(response);
}

export async function listVendorAccess(token: string): Promise<VendorAccessListItem[]> {
  const response = await fetch(url(`${BASE}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorAccessListItem[]>(response);
}

export interface CreateVendorAccessInput {
  username: string;
  password: string;
  sections: string[];
  permissionLevel: VendorPermissionLevel;
}

export async function createVendorAccess(
  token: string,
  input: CreateVendorAccessInput,
): Promise<VendorAccessRecord> {
  const response = await fetch(url(`${BASE}`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<VendorAccessRecord>(response);
}

export interface UpdateVendorAccessInput {
  sections?: string[];
  permissionLevel?: VendorPermissionLevel;
  isActive?: boolean;
}

export async function updateVendorAccess(
  token: string,
  id: string,
  input: UpdateVendorAccessInput,
): Promise<VendorAccessRecord> {
  const response = await fetch(url(`${BASE}/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<VendorAccessRecord>(response);
}

export async function resetVendorAccessPassword(
  token: string,
  id: string,
  password: string,
): Promise<VendorAccessRecord> {
  const response = await fetch(url(`${BASE}/${id}/password`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ password }),
  });
  return readJson<VendorAccessRecord>(response);
}

export async function deleteVendorAccess(token: string, id: string): Promise<void> {
  await sendNoContent(`${BASE}/${id}`, token, "DELETE");
}

// ------------------------- case assignments (admin) -----------------------

export async function listVendorAssignments(
  token: string,
  id: string,
): Promise<VendorCaseAssignment[]> {
  const response = await fetch(url(`${BASE}/${id}/assignments`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorCaseAssignment[]>(response);
}

export async function assignVendorCases(
  token: string,
  id: string,
  cases: { ticketId: string; caseId?: string }[],
): Promise<{ assigned: number }> {
  const response = await fetch(url(`${BASE}/${id}/assignments`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ cases }),
  });
  return readJson<{ assigned: number }>(response);
}

export async function unassignVendorCase(
  token: string,
  id: string,
  assignmentId: string,
): Promise<void> {
  await sendNoContent(`${BASE}/${id}/assignments/${assignmentId}`, token, "DELETE");
}

// ============================================================== operational
export interface VendorMe {
  id: string;
  username: string;
  sections: string[];
  permissionLevel: VendorPermissionLevel;
}

export async function fetchVendorMe(token: string): Promise<VendorMe> {
  const response = await fetch(url("/api/v1/vendor-access/me"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorMe>(response);
}

export async function fetchVendorReport(token: string): Promise<VendorScopedReport> {
  const response = await fetch(url("/api/v1/vendor-access/report"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorScopedReport>(response);
}

export async function fetchVendorAssignments(
  token: string,
): Promise<VendorCaseAssignment[]> {
  const response = await fetch(url("/api/v1/vendor-access/assignments"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorCaseAssignment[]>(response);
}

export interface VendorEngineer {
  id: string;
  engineerCode: string | null;
  engineerName: string;
}

/** Active engineers for the vendor case-edit engineer dropdown. */
export async function fetchVendorEngineers(token: string): Promise<VendorEngineer[]> {
  const response = await fetch(url("/api/v1/vendor-access/engineers"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<VendorEngineer[]>(response);
}

export async function updateVendorReportRow(params: {
  token: string;
  rowId: string;
  values: ReportRowPatchValues;
}): Promise<EditedReportRowResponse> {
  const response = await fetch(
    url(`/api/v1/vendor-access/report-rows/${params.rowId}`),
    {
      method: "PATCH",
      headers: authHeaders(params.token),
      body: JSON.stringify(params.values),
    },
  );
  return readJson<EditedReportRowResponse>(response);
}
