import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

export interface RecordLayout {
  orderedColumns: string[];
  updatedAt: string;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** The current user's saved records-grid layout, or null when not customised. */
export async function getRecordLayout(token: string): Promise<RecordLayout | null> {
  const response = await fetch(url("/api/v1/record-layout"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RecordLayout | null>(response);
}

export async function saveRecordLayout(
  token: string,
  orderedColumns: string[],
): Promise<RecordLayout> {
  const response = await fetch(url("/api/v1/record-layout"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ orderedColumns }),
  });
  return readJson<RecordLayout>(response);
}

/** Removes the custom layout, reverting the user to the default full layout. */
export async function resetRecordLayout(token: string): Promise<void> {
  await fetch(url("/api/v1/record-layout"), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
