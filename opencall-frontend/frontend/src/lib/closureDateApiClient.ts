import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

// Import + status for the Flex Closure ASP Report closure dates.

export interface ClosureImportResult {
  totalRows: number;
  imported: number;
  skippedNoDate: number;
  skippedNoKey: number;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

export async function importClosureDates(
  token: string,
  file: File,
): Promise<ClosureImportResult> {
  const formData = new FormData();
  formData.append("closureReport", file);
  const response = await fetch(url("/api/v1/closure-dates/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return readJson<ClosureImportResult>(response);
}

export async function getClosureDatesStatus(
  token: string,
): Promise<{ count: number }> {
  const response = await fetch(url("/api/v1/closure-dates/status"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson<{ count: number }>(response);
}
