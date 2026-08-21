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

export interface Quotation {
  id: string;
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
  params: { search?: string; page?: number; perPage?: number } = {},
): Promise<ListQuotationsResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("per_page", String(params.perPage));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/quotations${suffix}`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<ListQuotationsResult>(response);
}
