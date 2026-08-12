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
