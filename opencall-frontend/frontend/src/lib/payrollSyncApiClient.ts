// Standalone client for the "Sync assigned cases to Payroll" backfill. Kept
// separate from the big OpenCallApiClient interface so it stays purely additive
// (no change to existing typed client surface). Mirrors the same base URL +
// Bearer auth + readJson envelope handling.
import { readJson } from "./api/http";
import { WEB_API_BASE_URL } from "./api/webApiClient";

export interface PayrollSyncBulkResult {
  created: number;
  updated: number;
  assigned: number;
  skipped: number;
  total: number;
}

export interface PayrollSyncResult {
  configured: boolean;
  workingDate: string;
  rowsWithEngineer: number;
  payroll?: PayrollSyncBulkResult;
  message?: string;
}

/**
 * Push every engineer-assigned case for one working date into the Payroll app.
 * Idempotent server-side (external_ref = ticketId), so re-running is safe.
 */
export async function syncAssignedCasesToPayroll(
  token: string,
  workingDate: string,
): Promise<PayrollSyncResult> {
  const base = WEB_API_BASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/v1/reports/${workingDate}/payroll-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  return readJson<PayrollSyncResult>(response);
}
