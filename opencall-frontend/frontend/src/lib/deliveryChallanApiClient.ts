import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * OpenCall's five regions, which are also the branches a challan is raised from — in the
 * order every picker and the Branch details view lists them. A challan's number counts per
 * branch AND per financial year, so the branch is part of the number, not a label on it.
 */
export const BRANCH_KEYS = ["chennai", "vellore", "salem", "kanchipuram", "hosur"] as const;
export type BranchKey = (typeof BRANCH_KEYS)[number];

export const BRANCH_LABELS: Readonly<Record<BranchKey, string>> = {
  chennai: "Chennai",
  vellore: "Vellore",
  salem: "Salem",
  kanchipuram: "Kanchipuram",
  hosur: "Hosur",
};

/** A branch's letterhead as it stands now — what the Branch details view shows and edits. */
export interface ChallanBranch {
  branchKey: BranchKey;
  name: string;
  /** The first line of the letterhead, e.g. "Renderways Technologies –". */
  companyLine: string;
  /** One address line per line of text. */
  addressLines: string;
  gstin: string;
  contact: string;
  email: string;
  /** Null until a super admin has changed it — the seeded details have no editor. */
  updatedAt: string | null;
  updatedBy: string;
}

/**
 * The letterhead as it stood when the challan was raised. Each challan keeps its own copy,
 * so correcting a branch's details later never changes a challan already handed over.
 */
export interface ChallanBranchHeader {
  branchKey: BranchKey;
  name: string;
  companyLine: string;
  addressLines: string;
  gstin: string;
  contact: string;
  email: string;
}

/** One row of goods. All text, printed exactly as typed — a quantity of "01" stays "01". */
export interface DeliveryChallanItem {
  description: string;
  hsnSac: string;
  qty: string;
  rate: string;
  per: string;
}

export interface DeliveryChallan {
  id: string;
  branchKey: BranchKey;
  /** The Indian financial year (April–March) the number belongs to, e.g. "2026-2027". */
  finYear: string;
  /** The number within this branch and financial year, from 1. Never reissued on an edit. */
  dcSeq: number;
  /** YYYY-MM-DD */
  challanDate: string;
  branchHeader: ChallanBranchHeader;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  /**
   * One line per case or product — a challan can carry several replacements, and these
   * print side by side on the sheet.
   */
  caseIds: string;
  productSerials: string;
  productNumbers: string;
  productNames: string;
  refNoDate: string;
  modeTerms: string;
  otherReferences: string;
  items: DeliveryChallanItem[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  /** Null until the challan has been corrected. */
  updatedAt: string | null;
}

/**
 * What the form sends, to create a challan or to correct one. The server allocates the
 * number and financial year on create, and keeps both — and the branch — on an edit.
 */
export interface DeliveryChallanInput {
  branchKey: BranchKey;
  challanDate: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  caseIds: string;
  productSerials: string;
  productNumbers: string;
  productNames: string;
  refNoDate: string;
  modeTerms: string;
  otherReferences: string;
  items: DeliveryChallanItem[];
}

/** One case's details, for the form to add to the challan. */
export interface DeliveryChallanAutofill {
  caseId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  productSerial: string;
  productNumber: string;
  productName: string;
  /** The case's part lines, with HSN/SAC where the parts catalog knows the part. */
  items: DeliveryChallanItem[];
}

export interface ChallanBranchInput {
  name: string;
  companyLine: string;
  addressLines: string;
  gstin: string;
  contact: string;
  email: string;
}

export interface ListDeliveryChallansResult {
  items: DeliveryChallan[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Newest first. `branch` absent means every branch. */
export async function listDeliveryChallans(
  token: string,
  params: { search?: string; branch?: BranchKey; page?: number; pageSize?: number } = {},
): Promise<ListDeliveryChallansResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.branch) qs.set("branch", params.branch);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/delivery-challans${suffix}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ListDeliveryChallansResult>(response);
}

export async function getDeliveryChallan(token: string, id: string): Promise<DeliveryChallan> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/delivery-challans/${encodeURIComponent(id)}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<DeliveryChallan>(response);
}

export async function createDeliveryChallan(
  token: string,
  input: DeliveryChallanInput,
): Promise<DeliveryChallan> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/delivery-challans`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<DeliveryChallan>(response);
}

/**
 * Correct a challan that already exists.
 *
 * Same body as creating one. The branch and number never change, and the server refuses
 * a date that falls in another financial year — the number belongs to the year it was
 * issued in — with a message the form shows as it comes.
 */
export async function updateDeliveryChallan(
  token: string,
  id: string,
  input: DeliveryChallanInput,
): Promise<DeliveryChallan> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/delivery-challans/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<DeliveryChallan>(response);
}

/** One case's customer, product and part lines. Null when no case matches. */
export async function autofillDeliveryChallan(
  token: string,
  params: { caseId?: string; orderNumber?: string },
): Promise<DeliveryChallanAutofill | null> {
  const qs = new URLSearchParams();
  if (params.caseId) qs.set("caseId", params.caseId);
  if (params.orderNumber) qs.set("orderNumber", params.orderNumber);
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/delivery-challans/autofill?${qs.toString()}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<DeliveryChallanAutofill | null>(response);
}

/** All five branches' letterheads. */
export async function listChallanBranches(token: string): Promise<ChallanBranch[]> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/delivery-challans/branches`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<ChallanBranch[]>(response);
}

/** Change a branch's letterhead. SUPER_ADMIN only — the server refuses anyone else. */
export async function updateChallanBranch(
  token: string,
  branchKey: BranchKey,
  input: ChallanBranchInput,
): Promise<ChallanBranch> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/delivery-challans/branches/${encodeURIComponent(branchKey)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<ChallanBranch>(response);
}
