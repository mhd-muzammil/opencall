import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

export interface CatalogPart {
  id: string;
  partNumber: string;
  description: string;
  category: string;
  price: number;
  hsnCode: string;
  igst: string;
  cgst: string;
  sgst: string;
  eoslFlag: string;
  validity: string | null;
  partsStatus: string;
}

export interface ListCatalogPartsResult {
  items: CatalogPart[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface PartsImportResult {
  totalRows: number;
  imported: number;
  skippedEmpty: number;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function listCatalogParts(
  token: string,
  params: { search?: string; page?: number; perPage?: number } = {},
): Promise<ListCatalogPartsResult> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("per_page", String(params.perPage));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/parts-catalog${suffix}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<ListCatalogPartsResult>(response);
}

export async function importCatalogParts(
  token: string,
  file: File,
): Promise<PartsImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/parts-catalog/import`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  return readJson<PartsImportResult>(response);
}

export async function deleteAllCatalogParts(
  token: string,
): Promise<{ deleted: number }> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/parts-catalog`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return readJson<{ deleted: number }>(response);
}
