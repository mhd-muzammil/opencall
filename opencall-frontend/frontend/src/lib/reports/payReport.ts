/**
 * The Pay Report: Payroll's Employee Pay Report, read-only -- the same column
 * groups in the same order (payroll_frontend
 * src/components/Payslip/EmployeePayReport.jsx, as of 2026-11-10).
 */
import type { PayslipRow } from "../reportsApiClient";

export type PayColumnKind = "money" | "days";

export interface PayColumn {
  key: string;
  label: string;
  kind: PayColumnKind;
  /** Absent / Half Day come from attendance; "—" when Payroll sent none. */
  fromAttendance?: boolean;
}

export interface PayGroup {
  label: string;
  tone: "days" | "gross" | "earned" | "deductions" | "employer";
  columns: PayColumn[];
}

const money = (key: string, label: string): PayColumn => ({ key, label, kind: "money" });
const days = (key: string, label: string): PayColumn => ({ key, label, kind: "days" });

export const PAY_GROUPS: PayGroup[] = [
  {
    label: "Days",
    tone: "days",
    columns: [
      days("total_days", "Total"),
      days("paid_days", "Paid"),
      { ...days("absent_days", "Absent"), fromAttendance: true },
      { ...days("half_days", "Half Day"), fromAttendance: true },
      days("lop_days", "LOP"),
      days("off_days", "Off"),
      days("casual_leave_used", "CL Used"),
      money("casual_leave_pay", "CL Pay"),
      days("special_work_days", "Special Work"),
      money("special_work_pay", "Special Pay"),
    ],
  },
  {
    label: "Gross (salary structure)",
    tone: "gross",
    columns: [
      money("gross_basic", "Basic"),
      money("gross_hra", "HRA"),
      money("gross_conveyance", "Conveyance"),
      money("gross_child_edu", "Child Edu"),
      money("gross_personal_allowance", "Personal"),
      money("gross_incentive", "Incentive"),
      money("gross_other_earnings", "Other"),
      money("gross_salary", "Gross Salary"),
    ],
  },
  {
    label: "Earned this month",
    tone: "earned",
    columns: [
      money("earned_basic", "Basic"),
      money("earned_hra", "HRA"),
      money("earned_conveyance", "Conveyance"),
      money("earned_child_edu", "Child Edu"),
      money("earned_personal_allowance", "Personal"),
      money("earned_incentive", "Incentive"),
      money("earned_other_earnings", "Other"),
      money("gross_earnings", "Gross Earnings"),
    ],
  },
  {
    label: "Deductions",
    tone: "deductions",
    columns: [
      money("deduction_epf", "EPF"),
      money("deduction_esi", "ESI"),
      money("deduction_prof_tax", "Prof. Tax"),
      money("deduction_lwf", "LWF"),
      money("deduction_staff_advance", "Staff Adv."),
      money("deduction_tds", "TDS"),
      money("deduction_other", "Other"),
      money("deduction_insurance", "Insurance"),
      money("gross_deductions", "Total"),
    ],
  },
  {
    label: "Employer",
    tone: "employer",
    columns: [
      money("employer_epf", "EPF"),
      money("employer_esi", "ESI"),
      money("employer_insurance", "Insurance"),
      money("petrol_allowance", "Petrol"),
    ],
  },
];

export const PAY_NET: PayColumn = money("net_salary", "Net Salary");
export const PAY_FIGURES: PayColumn[] = [...PAY_GROUPS.flatMap((g) => g.columns), PAY_NET];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const toNumber = (value: unknown): number => {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export const payPeriod = (slip: PayslipRow): string => `${MONTHS[(slip.month || 1) - 1]} ${slip.year}`;

export const formatMoney = (value: unknown): string =>
  toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDays = (value: unknown): string => {
  const n = toNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const formatPayCell = (column: PayColumn, value: unknown): string =>
  column.fromAttendance && value == null ? "—" : column.kind === "money" ? formatMoney(value) : formatDays(value);

/** Newest month first, then A–Z by name -- the order the Employee Pay Report reads in. */
export function sortPayslips(slips: PayslipRow[]): PayslipRow[] {
  return [...slips].sort(
    (a, b) =>
      b.year - a.year ||
      b.month - a.month ||
      String(a.employee_details?.employee_name || "").localeCompare(String(b.employee_details?.employee_name || "")),
  );
}

/** Each figure summed over `slips`. */
export function payTotals(slips: PayslipRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of PAY_FIGURES) {
    totals[column.key] = Math.round(slips.reduce((sum, slip) => sum + toNumber(slip[column.key]), 0) * 100) / 100;
  }
  return totals;
}
