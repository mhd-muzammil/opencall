import type { WarrantyJobDetail } from "@opencall/shared";
import { WEB_API_BASE_URL } from "./api/webApiClient";
import { ApiClientError, readJson } from "./api/http";
import type { ApiErrorBody } from "./api/types";

/**
 * Client for the HP warranty auto-lookup endpoints (`/api/v1/warranty/...`).
 *
 * A job is created by uploading a Flex WIP workbook; a backend worker then looks
 * up each unique serial on HP's site. Progress is polled via `getWarrantyJob`
 * and the finished workbook (with the appended `Warranty Status` / `_Lookup
 * Status` columns) is streamed by `downloadWarrantyJobFile`.
 */

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/** Upload a Flex WIP `.xlsx` and enqueue its serials. */
export async function createWarrantyJob(
  token: string,
  file: File,
): Promise<WarrantyJobDetail> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(url("/api/v1/warranty/jobs"), {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });

  return readJson<WarrantyJobDetail>(response);
}

export async function getWarrantyJob(
  token: string,
  jobId: string,
): Promise<WarrantyJobDetail> {
  const response = await fetch(url(`/api/v1/warranty/jobs/${jobId}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });

  return readJson<WarrantyJobDetail>(response);
}

/** Requeue the job's failed serials so the worker retries them. */
export async function retryWarrantyJob(
  token: string,
  jobId: string,
): Promise<WarrantyJobDetail> {
  const response = await fetch(url(`/api/v1/warranty/jobs/${jobId}/retry`), {
    method: "POST",
    headers: authHeaders(token),
  });

  return readJson<WarrantyJobDetail>(response);
}

/**
 * Download the generated workbook. The server answers 409 until the job is
 * completed, which surfaces here as an `ApiClientError`.
 */
export async function downloadWarrantyJobFile(
  token: string,
  jobId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(url(`/api/v1/warranty/jobs/${jobId}/file`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      body?.error?.message ?? `Download failed (${response.status})`,
      response.status,
      body,
    );
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "warranty-result.xlsx";

  return { blob: await response.blob(), fileName };
}
