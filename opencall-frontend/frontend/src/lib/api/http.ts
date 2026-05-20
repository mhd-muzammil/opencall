import type { ApiErrorBody } from "./types";

export async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    if (response.status === 422 && body && "data" in body && body.data !== undefined) {
      return body.data as T;
    }
    const errorBody = body as ApiErrorBody | null;
    throw new Error(formatApiError(errorBody, response.status));
  }

  if (!body || !("data" in body)) {
    throw new Error("Unexpected API response");
  }

  return body.data as T;
}

function formatApiError(body: ApiErrorBody | null, status: number): string {
  const message = body?.error?.message ?? `Request failed ${status}`;
  const details = body?.error?.details;

  if (!details || typeof details !== "object") {
    return message;
  }

  const validationErrors = (details as { validationErrors?: unknown }).validationErrors;

  if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
    return message;
  }

  const detailText = validationErrors
    .map((error) => {
      if (!error || typeof error !== "object") {
        return "";
      }

      const entry = error as Record<string, unknown>;
      const source = String(entry.source ?? "Upload batch");
      const issue = String(entry.issue ?? "VALIDATION_ERROR").replace(/_/g, " ");
      const statusText = entry.status ? ` (${String(entry.status)})` : "";
      const countText = typeof entry.errorCount === "number" ? `, ${entry.errorCount} error(s)` : "";

      return `${source}: ${issue}${statusText}${countText}`;
    })
    .filter(Boolean)
    .join("; ");

  return detailText ? `${message}: ${detailText}` : message;
}
