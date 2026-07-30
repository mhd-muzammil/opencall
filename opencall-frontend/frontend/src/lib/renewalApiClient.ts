import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * AMC / Warranty Renewal Pipeline client.
 *
 * Types are declared here rather than imported from `@opencall/shared` because the
 * frontend's copy of the shared package does not carry them (same reason
 * `partsCatalogApiClient` and `quotationApiClient` declare their own). They mirror
 * `shared/src/types/renewal.ts` on the API side, which re-validates everything anyway.
 */

export type RenewalLeadStatus =
  | "New"
  | "Contacted"
  | "Quoted"
  | "Won"
  | "Lost"
  | "Not Interested";

export const RENEWAL_LEAD_STATUSES: readonly RenewalLeadStatus[] = [
  "New",
  "Contacted",
  "Quoted",
  "Won",
  "Lost",
  "Not Interested",
];

export type RenewalWindow =
  | "EXPIRING_30"
  | "EXPIRING_60"
  | "EXPIRING_90"
  | "EXPIRED"
  | "ALL";

export interface RenewalLeadRow {
  serial: string;
  startDate: string | null;
  endDate: string;
  daysLeft: number;
  productNumber: string | null;
  customerName: string;
  accountName: string;
  contact: string;
  customerMail: string;
  product: string;
  workLocation: string;
  regionName: string;
  ticketId: string;
  lastSeenDate: string | null;
  status: RenewalLeadStatus;
  owner: string;
  remarks: string;
  updatedAt: string | null;
}

export interface RenewalPipelineSummary {
  total: number;
  expiring30: number;
  expiring60: number;
  expiring90: number;
  expired: number;
  byStatus: Record<RenewalLeadStatus, number>;
}

export interface RenewalPipelineResponse {
  rows: RenewalLeadRow[];
  summary: RenewalPipelineSummary;
  available: boolean;
}

export interface SaveRenewalLeadResponse {
  serial: string;
  status: RenewalLeadStatus;
  owner: string;
  remarks: string;
  updatedAt: string;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function getRenewalPipeline(
  token: string,
  params: {
    window?: RenewalWindow;
    status?: RenewalLeadStatus | "ALL";
    search?: string;
  } = {},
): Promise<RenewalPipelineResponse> {
  const qs = new URLSearchParams();
  if (params.window) qs.set("window", params.window);
  if (params.status && params.status !== "ALL") qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/renewal/leads${suffix}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RenewalPipelineResponse>(response);
}

export async function saveRenewalLead(
  token: string,
  input: {
    serial: string;
    status: RenewalLeadStatus;
    owner: string;
    remarks: string;
  },
): Promise<SaveRenewalLeadResponse> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/renewal/leads`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<SaveRenewalLeadResponse>(response);
}
