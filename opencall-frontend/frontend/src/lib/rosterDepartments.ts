import type { RosterEngineer } from "./payrollTrackingApiClient";

/**
 * The department filter on the live tracking board.
 *
 * The board shows Payroll's other staff beside the engineers (12 Oct 2026), and
 * the office looks at it department by department. Departments are typed by
 * hand in Payroll -- "Backend" on one employee, "backend " on another -- so the
 * options fold case and spaces, keep the first spelling met, and the filter
 * compares the same way. A row with no department (an engineer Payroll could
 * not match) shows under All and under no department.
 */

type WithDepartment = Pick<RosterEngineer, "department">;

/** Every department, "All" being the empty string. */
export const ALL_DEPARTMENTS = "";

export function departmentOf(row: WithDepartment): string {
  return String(row.department ?? "").trim();
}

/** One option per department, A to Z. */
export function departmentOptions(rows: readonly WithDepartment[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const department = departmentOf(row);
    if (department && !seen.has(department.toLowerCase())) {
      seen.set(department.toLowerCase(), department);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** The rows in one department -- every row when none is chosen. */
export function inDepartment<T extends WithDepartment>(rows: readonly T[], department: string): T[] {
  const want = department.trim().toLowerCase();
  if (!want) return [...rows];
  return rows.filter((row) => departmentOf(row).toLowerCase() === want);
}
