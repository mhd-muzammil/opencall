import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * The Reports section's Payroll reads, through OpenCall's server (which holds
 * the Payroll credentials). Read-only and SUPER_ADMIN only.
 */

/** One Payroll attendance record, as the Attendance page receives it. */
export interface AttendanceRecord {
  id?: number;
  employee_id: number | null;
  employee_name: string | null;
  employee_status?: string | null;
  employee_role?: string | null;
  role?: string | null;
  branch: string | null;
  email?: string | null;
  status: string | null;
  intime: string | null;
  outtime: string | null;
  auto_closed_out?: boolean | null;
}

/** One payslip, slimmed to what the Employee Pay Report prints. Figures arrive as numbers or decimal strings. */
export interface PayslipRow {
  id: number;
  employee: number | null;
  month: number;
  year: number;
  status: string | null;
  sent_at?: string | null;
  employee_details: {
    id?: number;
    emp_code?: string | null;
    employee_name?: string | null;
    branch?: string | null;
    status?: string | null;
  } | null;
  [figure: string]: unknown;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function getReportsAttendance(
  token: string,
  from: string,
  to: string,
): Promise<{ configured: boolean; records: AttendanceRecord[] }> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/payroll-tracking/reports/attendance?${qs.toString()}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson(response);
}

export async function getReportsPayslips(
  token: string,
  from: string,
  to: string,
): Promise<{ configured: boolean; payslips: PayslipRow[] }> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/payroll-tracking/reports/payslips?${qs.toString()}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson(response);
}
