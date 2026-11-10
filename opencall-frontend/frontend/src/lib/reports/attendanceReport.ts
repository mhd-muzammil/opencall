/**
 * The Attendance Report: one row per employee, one column per date that has a
 * record, and the totals at the end.
 *
 * A faithful port of Payroll's own builder (payroll_frontend
 * src/Utility/attendanceReport.js + attendanceUtils.js, as of 2026-11-10), so
 * the figures here are the ones Payroll's Attendance "Export Report" gives for
 * the same people and dates. If Payroll changes how it counts, change it here
 * too -- attendanceReport.test.ts pins the rules.
 */
import type { AttendanceRecord } from "../reportsApiClient";

const MS_PER_HOUR = 1000 * 60 * 60;
const MAX_WORKDAY_HOURS = 24;
const STATUS_DISPLAY: Record<string, string> = { overTime: "Overtime" };

export const getDatePart = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : "");

export const isPresentStatus = (status: string | null | undefined): boolean =>
  status === "Present" || status === "Overtime" || status === "overTime";

export const isSundayDate = (datePart: string): boolean => {
  const [year, month, day] = String(datePart || "").split("-").map(Number);
  if (!year || !month || !day) return false;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
};

/** A Leave day reads "Sunday" or "Holiday", by its date. */
export const statusShown = (status: string | null | undefined, datePart: string): string =>
  status === "Leave" ? (isSundayDate(datePart) ? "Sunday" : "Holiday") : String(status ?? "");

export const statusLabel = (status: string): string => STATUS_DISPLAY[status] || status;

const employeeKey = (record: AttendanceRecord): string =>
  record.employee_id != null ? `id:${record.employee_id}` : `name:${String(record.employee_name || "").toLowerCase()}`;

/** Hours between a punch in and out, or null when the day cannot be measured (Payroll's rule). */
export const hoursBetween = (intime: string | null, outtime: string | null): number | null => {
  if (!intime || !outtime) return null;
  const start = new Date(intime);
  const end = new Date(outtime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const elapsed = (end.getTime() - start.getTime()) / MS_PER_HOUR;
  if (!(elapsed > 0 && elapsed < MAX_WORKDAY_HOURS)) return null;
  const hourMark = (at: Date) => new Date(at).setMinutes(0, 0, 0);
  const wholeHours = (hourMark(end) - hourMark(start)) / MS_PER_HOUR;
  return wholeHours + (start.getMinutes() + end.getMinutes()) / 60;
};

/** "243h 30m". */
export const formatDuration = (hours: number): string => {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!whole) return `${rest}m`;
  if (!rest) return `${whole}h`;
  return `${whole}h ${rest}m`;
};

/** "09:18 am", the clock the attendance card shows. */
export const exportClock = (value: string | null): string => {
  if (!value) return "";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
};

/** A punch, or null when the row only carries a date (stored as midnight). */
const punchAt = (value: string | null): string | null => {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.getHours() === 0 && at.getMinutes() === 0 ? null : value;
};

/**
 * Hand a row the office marked with no employee link back to the one employee
 * of that name (namesakes are left alone) -- as the Attendance page does
 * before it builds its report.
 */
export function linkOrphanRows(records: AttendanceRecord[]): AttendanceRecord[] {
  const owners = new Map<string, Map<number, AttendanceRecord>>();
  for (const record of records) {
    if (record.employee_id == null || record.employee_status === "relieved") continue;
    const name = String(record.employee_name || "").trim().toLowerCase();
    if (!name) continue;
    let known = owners.get(name);
    if (!known) owners.set(name, (known = new Map()));
    if (!known.has(record.employee_id)) known.set(record.employee_id, record);
  }
  if (owners.size === 0) return records;
  return records.map((record) => {
    if (record.employee_id != null) return record;
    const known = owners.get(String(record.employee_name || "").trim().toLowerCase());
    if (!known || known.size !== 1) return record;
    const owner = [...known.values()][0]!;
    return {
      ...record,
      employee_id: owner.employee_id,
      branch: owner.branch || record.branch,
      employee_role: owner.employee_role ?? record.employee_role ?? null,
      email: record.email || owner.email || null,
    };
  });
}

export interface AttendanceDay {
  status: string | null;
  intime: string | null;
  outtime: string | null;
  autoClosed: boolean;
}

export interface AttendanceReportRow {
  sno: number;
  employeeId: number | null;
  name: string;
  relieved: boolean;
  branch: string;
  days: Record<string, AttendanceDay>;
  present: number;
  sunday: number;
  holiday: number;
  leave: number;
  absent: number;
  halfDay: number;
  presentPlusLeave: number;
  hours: number;
  hoursText: string;
}

export interface AttendanceReport {
  dates: string[];
  dateLabels: string[];
  rows: AttendanceReportRow[];
  anyAutoClosed: boolean;
}

export const ATTENDANCE_TOTAL_HEADERS = [
  "Total Present",
  "Total Sunday",
  "Total Holiday",
  "Total Leave",
  "Total Absent",
  "Total Half Day",
  "Present + Leave",
  "Total Hours",
] as const;

export const AUTO_CLOSED_NOTE = "* Logout nobody pressed - the day was closed automatically at 11.59 pm.";

/** What one day says: the status, then "in …" and "out …" on their own lines. */
export function dayCellText(entry: AttendanceDay | undefined, datePart: string): string {
  if (!entry) return "-";
  const lines = [statusLabel(statusShown(entry.status, datePart)) || "-"];
  const inAt = exportClock(entry.intime);
  const outAt = exportClock(entry.outtime);
  if (inAt) lines.push(`in ${inAt}`);
  if (outAt) lines.push(`out ${outAt}${entry.autoClosed ? " *" : ""}`);
  return lines.join("\n");
}

/** Records in `from`..`to` (by the date Payroll groups them under), linked as the Attendance page links them. */
export function attendanceInRange(records: AttendanceRecord[], from: string, to: string): AttendanceRecord[] {
  return linkOrphanRows(records).filter((record) => {
    const day = getDatePart(record.intime || record.outtime);
    return Boolean(day) && day >= from && day <= to;
  });
}

export function buildAttendanceReport(records: AttendanceRecord[]): AttendanceReport {
  const dateSet = new Set<string>();
  for (const record of records) {
    const day = getDatePart(record.intime || record.outtime);
    if (day) dateSet.add(day);
  }
  const dates = [...dateSet].sort();

  const employees = new Map<
    string,
    { employeeId: number | null; name: string; relieved: boolean; branch: string; days: Record<string, AttendanceDay>; hours: number }
  >();
  for (const record of records) {
    const key = employeeKey(record);
    let emp = employees.get(key);
    if (!emp) {
      emp = {
        employeeId: record.employee_id,
        name: record.employee_name || "",
        relieved: record.employee_status === "relieved",
        branch: record.branch || "Chennai",
        days: {},
        hours: 0,
      };
      employees.set(key, emp);
    }
    emp.hours += hoursBetween(record.intime, record.outtime) ?? 0;
    const day = getDatePart(record.intime || record.outtime);
    if (!day) continue;
    const intime = punchAt(record.intime);
    const outtime = punchAt(record.outtime);
    const existing = emp.days[day];
    if (!existing) {
      emp.days[day] = { status: record.status, intime, outtime, autoClosed: Boolean(record.auto_closed_out) && Boolean(outtime) };
      continue;
    }
    // Two rows for one day: the earliest arrival, the latest departure, and
    // a status that says they were here if either row does.
    if (intime && (!existing.intime || intime < existing.intime)) existing.intime = intime;
    if (outtime && (!existing.outtime || outtime > existing.outtime)) {
      existing.outtime = outtime;
      existing.autoClosed = Boolean(record.auto_closed_out);
    }
    if (record.status && (!existing.status || isPresentStatus(record.status))) existing.status = record.status;
  }

  const rows = [...employees.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((emp, index): AttendanceReportRow => {
      const marked = dates.map((d) => emp.days[d]).filter((e): e is AttendanceDay => Boolean(e));
      const present = marked.filter((e) => isPresentStatus(e.status)).length;
      const leave = marked.filter((e) => e.status === "Leave").length;
      const sunday = dates.filter((d) => emp.days[d]?.status === "Leave" && isSundayDate(d)).length;
      const absent = marked.filter((e) => e.status === "Absent").length;
      const halfDay = marked.filter((e) => e.status === "Half Day").length;
      return {
        sno: index + 1,
        employeeId: emp.employeeId,
        name: emp.name,
        relieved: emp.relieved,
        branch: emp.branch,
        days: emp.days,
        present,
        sunday,
        holiday: leave - sunday,
        leave,
        absent,
        halfDay,
        presentPlusLeave: present + leave,
        hours: emp.hours,
        hoursText: formatDuration(emp.hours),
      };
    });

  return {
    dates,
    dateLabels: dates.map((d) => {
      const [y, m, day] = d.split("-");
      return `${day}-${m}-${y}`;
    }),
    rows,
    anyAutoClosed: rows.some((row) => dates.some((d) => row.days[d]?.autoClosed)),
  };
}
