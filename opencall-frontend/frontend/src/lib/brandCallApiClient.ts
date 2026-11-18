import { WEB_API_BASE_URL } from "./api/webApiClient";
import { ApiClientError, readJson } from "./api/http";

/**
 * Acer calls a SUPER_ADMIN pastes in on the Records page's Acer tab
 * (backend: /api/v1/brand-calls). Once saved they become rows of the daily report and
 * are worked like HP calls through the usual report-row edits.
 */

/** The fields of one Acer call, in the portal's column order. */
export interface AcerCallFields {
  caseId: string;
  customerName: string;
  callStatus: string;
  serviceType: string;
  model: string;
  productCategory: string;
  serialNumber: string;
  issueDescription: string;
  warrantyStatus: string;
  fullAddress: string;
  pincode: string;
  altContact: string;
  primaryContact: string;
}

export interface AcerCallPreview extends AcerCallFields {
  lineNumber: number;
  ticketId: string;
  regionCode: string;
  regionReason: string;
  sourceLine: string;
  errors: string[];
  warnings: string[];
  existing: { createdAt: string; closedAt: string | null; deletedAt: string | null } | null;
}

export interface AcerPastePreview {
  calls: AcerCallPreview[];
  ignoredLines: { lineNumber: number; text: string }[];
  regions: { code: string; name: string }[];
}

export interface SavedBrandCall extends AcerCallFields {
  id: string;
  brand: string;
  ticketId: string;
  regionCode: string;
  createdAt: string;
  createdBy: string;
  closedAt: string | null;
  closedStatus: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  deletedAt: string | null;
}

/** A saved call with how its latest report row stands (the All calls list). */
export interface AcerCallListItem extends SavedBrandCall {
  engineer: string | null;
  morningStatus: string | null;
  eveningStatus: string | null;
  remarks: string | null;
  lastReportDate: string | null;
}

export interface CreateAcerCallsResult {
  created: SavedBrandCall[];
  reopened: SavedBrandCall[];
  skippedExisting: string[];
}

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function previewAcerCalls(token: string, text: string): Promise<AcerPastePreview> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/brand-calls/acer/preview`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ text }),
    cache: "no-store",
  });
  return readJson<AcerPastePreview>(response);
}

export async function createAcerCalls(
  token: string,
  calls: ReadonlyArray<AcerCallFields & { regionCode: string; sourceLine?: string }>,
): Promise<CreateAcerCallsResult> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/brand-calls/acer`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ calls }),
    cache: "no-store",
  });
  return readJson<CreateAcerCallsResult>(response);
}

/** The per-call problems a refused save lists, when the server sent them. */
export function saveProblems(error: unknown): string[] {
  if (!(error instanceof ApiClientError)) return [];
  const problems = (error.details as { problems?: unknown } | null)?.problems;
  return Array.isArray(problems) ? problems.map(String) : [];
}

export async function listAcerCalls(
  token: string,
  params: { status: "open" | "closed" | "all"; search?: string; limit?: number },
): Promise<AcerCallListItem[]> {
  const qs = new URLSearchParams({ status: params.status });
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/brand-calls/acer?${qs.toString()}`, {
    headers: headers(token),
    cache: "no-store",
  });
  return readJson<AcerCallListItem[]>(response);
}

export async function updateAcerCall(
  token: string,
  id: string,
  fields: Omit<AcerCallFields, "caseId"> & { regionCode: string },
): Promise<SavedBrandCall> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/brand-calls/acer/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(fields),
    cache: "no-store",
  });
  return readJson<SavedBrandCall>(response);
}

export async function deleteAcerCall(token: string, id: string): Promise<SavedBrandCall> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/brand-calls/acer/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(token),
    cache: "no-store",
  });
  return readJson<SavedBrandCall>(response);
}

export async function reopenAcerCall(token: string, id: string): Promise<SavedBrandCall> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/brand-calls/acer/${encodeURIComponent(id)}/reopen`,
    { method: "POST", headers: headers(token), cache: "no-store" },
  );
  return readJson<SavedBrandCall>(response);
}
