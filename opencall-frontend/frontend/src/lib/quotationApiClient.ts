import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/** One priced row on a quotation. A quotation always has at least one. */
export interface QuotationLineItem {
  serviceDescription: string;
  productDescription: string;
  modelNo: string;
  serialNo: string;
  baseAmount: number;
}

/**
 * Which sheet a quotation is: a Visit quotation (the service charge before an engineer goes
 * out, numbered RTPL/<FY>/QEV/<n>) or a Part quotation (the part estimate, RTPL/<FY>/QEN/<n>).
 * The two are the two tabs of the one Quotations section.
 */
export type QuotationKind = "PART" | "VISIT";

export interface Quotation {
  id: string;
  /**
   * Fixed when the quotation is raised, like its number. Absent only from a server that
   * predates Visit quotations, where every quotation is a Part one — read it as PART.
   */
  kind?: QuotationKind;
  quotationNo: string;
  quotationDate: string;
  caseId: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerPhone: string;
  customerEmail: string;
  /**
   * Mirrors of the FIRST line item, kept by the server so anything written before line
   * items existed still reads correctly. `baseAmount` is the SUBTOTAL of every item, which
   * is why the list's Total column needs no change.
   */
  serviceDescription: string;
  productDescription: string;
  modelNo: string;
  serialNo: string;
  baseAmount: number;
  sgstPercent: number;
  cgstPercent: number;
  createdBy: string;
  createdAt: string;
  /** Null until the sheet has been corrected — an unedited quotation has no edit to show. */
  updatedAt?: string | null;
  updatedBy?: string;
  /** Null until mailed from here. Not "sent and undated" — absent means never sent. */
  sentAt?: string | null;
  sentTo?: string;
  sentBy?: string;
  /** Every send including follow-ups, so "chased three times" is visible. */
  sendCount?: number;
  lastSentAt?: string | null;
  /** 'PENDING' | 'PAID' | 'DECLINED' */
  paymentStatus?: string;
  paidAt?: string | null;
  paidBy?: string;
  paymentNote?: string;
  /** 'MANUAL' | 'AUTO' — a person's call, or one inferred from the customer's reply. */
  paymentSource?: string;
  /** The reply that earned the status, so the badge can say why. */
  paymentEvidenceEmailId?: string | null;
  /** Any reply at all. Null while the customer has said nothing. */
  replySeenAt?: string | null;
  /** 'NONE' | 'WEAK' | 'STRONG' — WEAK still needs a person to look. */
  paymentSignal?: string;
  paymentSignalReasons?: string;
  /** Every priced row, in entry order. This is what the form and the printed sheet read. */
  lineItems: QuotationLineItem[];
  /**
   * Its work order's ASP work location ("ASPS01461"), so the page can count by branch. Filled
   * by the list; empty for a quotation with no WO, absent from a server that predates it.
   */
  workLocation?: string;
}

export interface QuotationAutofill {
  caseId: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerPhone: string;
  customerEmail: string;
  productDescription: string;
  modelNo: string;
  serialNo: string;
}

export interface CreateQuotationInput {
  /** Picks the sheet and the number series. The server reads it on create only. */
  kind: QuotationKind;
  quotationDate: string;
  caseId: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerPhone: string;
  customerEmail: string;
  /** One or more priced rows. The server sums them into the quotation's subtotal. */
  lineItems: QuotationLineItem[];
  /** One pair for the whole quotation, applied to the subtotal. */
  sgstPercent: number;
  cgstPercent: number;
}

export interface ListQuotationsResult {
  items: Quotation[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

/**
 * A quotation the OpenCall report raised on its own, waiting for somebody to approve it: a
 * 01-Trade work order at Flex Status "Visit Estimate" waits as a Visit quotation, one at
 * "Visit Quote To Customer" as a Part one. It has no number and no amount until it is approved;
 * approving it raises the real quotation.
 */
export interface QuotationDraft {
  id: string;
  kind: QuotationKind;
  /** The work order as the report shows it, e.g. "WO-036404653". */
  ticketId: string;
  caseId: string;
  /** The Flex Status that raised it. */
  flexStatus: string;
  workLocation: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPincode: string;
  customerPhone: string;
  customerEmail: string;
  productDescription: string;
  modelNo: string;
  serialNo: string;
  part: string;
  /** 'WAITING' | 'APPROVED' | 'REMOVED' — the list holds only waiting ones. */
  status: string;
  createdAt: string;
}

/**
 * How the Records page's count at the status splits: every work order the page shows there is
 * either waiting in the box or listed in `notWaiting` with the reason it is not.
 */
export interface QuotationDraftsReport {
  /** Work orders the Records page shows at the status. */
  onReport: number;
  /** The same by work location (ASP code). Absent from a server that predates it. */
  onReportByLocation?: Record<string, number>;
  notWaiting: Array<{
    ticketId: string;
    /** Its work location on the report (ASP code). */
    workLocation?: string;
    /** QUOTED: already has a quotation of the kind. REMOVED: removed from the box. NOT_RAISED: not yet. */
    reason: "QUOTED" | "REMOVED" | "NOT_RAISED";
    quotationNos: string[];
  }>;
}

export interface ListQuotationDraftsResult {
  items: QuotationDraft[];
  total: number;
  /** For the whole report, whatever the search. Absent from a server that predates it. */
  report?: QuotationDraftsReport;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function autofillQuotation(
  token: string,
  params: { caseId?: string; orderNumber?: string },
): Promise<QuotationAutofill | null> {
  const qs = new URLSearchParams();
  if (params.caseId) qs.set("caseId", params.caseId);
  if (params.orderNumber) qs.set("orderNumber", params.orderNumber);
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/autofill?${qs.toString()}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<QuotationAutofill | null>(response);
}

export async function createQuotation(
  token: string,
  input: CreateQuotationInput,
): Promise<Quotation> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/quotations`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<Quotation>(response);
}

/**
 * Correct a quotation that already exists.
 *
 * Same body as creating one — the edit form is the create form with the values in it — and
 * the running number is not reissued, so the customer's copy still matches.
 */
export async function updateQuotation(
  token: string,
  id: string,
  input: CreateQuotationInput,
): Promise<Quotation> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<Quotation>(response);
}

/**
 * Mail the quotation to the customer, from a region mailbox.
 *
 * `to` is optional: absent means the address on the quotation. `note` rides above the sheet
 * in the same message, for the covering line someone wants to add.
 */
export async function sendQuotation(
  token: string,
  id: string,
  input: { regionCode: string; to?: string; note?: string },
): Promise<Quotation> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/${encodeURIComponent(id)}/send`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<Quotation>(response);
}

/** Record what the customer did about it. A person's call, never inferred from a reply. */
export async function setQuotationPayment(
  token: string,
  id: string,
  input: { status: "PENDING" | "PAID" | "DECLINED"; note?: string },
): Promise<Quotation> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/${encodeURIComponent(id)}/payment`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<Quotation>(response);
}

export async function listQuotations(
  token: string,
  params: {
    search?: string;
    kind?: QuotationKind;
    /** Raised at or after this ISO moment. */
    createdFrom?: string;
    /** Raised before this ISO moment. */
    createdBefore?: string;
    page?: number;
    perPage?: number;
  } = {},
): Promise<ListQuotationsResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.kind) qs.set("kind", params.kind);
  if (params.createdFrom) qs.set("created_from", params.createdFrom);
  if (params.createdBefore) qs.set("created_before", params.createdBefore);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("per_page", String(params.perPage));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations${suffix}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ListQuotationsResult>(response);
}

/** The quotations waiting for approval, newest first. */
export async function listQuotationDrafts(
  token: string,
  params: { kind?: QuotationKind; search?: string } = {},
): Promise<ListQuotationDraftsResult> {
  const qs = new URLSearchParams();
  if (params.kind) qs.set("kind", params.kind);
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/drafts${suffix}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ListQuotationDraftsResult>(response);
}

/**
 * Approve a waiting quotation. The body is the quotation form, as for creating one; the server
 * raises the quotation with the next number of the waiting one's kind and returns it.
 */
export async function approveQuotationDraft(
  token: string,
  id: string,
  input: CreateQuotationInput,
): Promise<Quotation> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/drafts/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  return readJson<Quotation>(response);
}

/** Take a waiting quotation off the list for good: no report raises it again. */
export async function removeQuotationDraft(token: string, id: string): Promise<QuotationDraft> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations/drafts/${encodeURIComponent(id)}/remove`,
    { method: "POST", headers: authHeaders(token) },
  );
  return readJson<QuotationDraft>(response);
}
