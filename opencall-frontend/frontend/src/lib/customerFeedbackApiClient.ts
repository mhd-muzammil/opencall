import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

// Fixed dropdown options — MUST stay in sync with the backend
// (shared/constants/customerFeedback.ts). The backend re-validates every value, so a
// drift here is rejected server-side, not silently stored.
export const CALL_STATUS_OPTIONS: readonly string[] = [
  "Called",
  "Not Reachable",
  "Callback Requested",
  "Wrong Number",
  "Other",
];

export const CUSTOMER_FEEDBACK_OPTIONS: readonly string[] = [
  "Satisfied",
  "Not Satisfied",
  "Issue Pending",
  "No Response",
  "Other",
];

export interface SaveCustomerFeedbackInput {
  woId: string;
  caseId: string;
  callStatus: string;
  feedback: string;
  remarks: string;
}

export async function saveCustomerFeedback(
  token: string,
  input: SaveCustomerFeedbackInput,
): Promise<{ ok: boolean }> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/customer-feedback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return readJson<{ ok: boolean }>(response);
}
