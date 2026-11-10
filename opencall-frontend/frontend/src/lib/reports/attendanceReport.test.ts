import { describe, expect, it } from "vitest";
import { attendanceInRange, buildAttendanceReport, linkOrphanRows } from "./attendanceReport";
import type { AttendanceRecord } from "../reportsApiClient";

const rec = (over: Partial<AttendanceRecord>): AttendanceRecord => ({
  employee_id: 1,
  employee_name: "Agalya A",
  branch: "Vellore",
  status: "Present",
  intime: null,
  outtime: null,
  ...over,
});

describe("buildAttendanceReport", () => {
  it("counts as Payroll's Export Report does: Leave split into Sunday + Holiday, Half Day apart", () => {
    const report = buildAttendanceReport([
      rec({ status: "Present", intime: "2026-11-02T09:15:00+05:30", outtime: "2026-11-02T18:30:00+05:30" }),
      rec({ status: "Absent", intime: "2026-11-03T00:00:00+05:30" }),
      rec({ status: "Half Day", intime: "2026-11-04T00:00:00+05:30" }),
      rec({ status: "Leave", intime: "2026-11-08T00:00:00+05:30" }), // a Sunday
      rec({ status: "Leave", intime: "2026-11-05T00:00:00+05:30" }), // a Thursday: Holiday
      rec({ status: "overTime", intime: "2026-11-06T09:00:00+05:30" }),
    ]);
    expect(report.dates).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-08"]);
    const [row] = report.rows;
    expect(row).toMatchObject({ present: 2, absent: 1, halfDay: 1, sunday: 1, holiday: 1, leave: 2, presentPlusLeave: 4 });
  });

  it("reads two rows for one day as one, present if either is", () => {
    const report = buildAttendanceReport([
      rec({ status: "Absent", intime: "2026-11-02T00:00:00+05:30" }),
      rec({ status: "Present", intime: "2026-11-02T09:15:00+05:30" }),
    ]);
    expect(report.rows[0]).toMatchObject({ present: 1, absent: 0 });
  });
});

describe("linkOrphanRows / attendanceInRange", () => {
  it("gives an office-marked row to the one employee of that name, and keeps only the period", () => {
    const rows = [
      rec({ intime: "2026-11-02T09:00:00+05:30" }),
      rec({ employee_id: null, branch: "Chennai", status: "Absent", intime: "2026-11-03T00:00:00+05:30" }),
      rec({ intime: "2026-10-20T09:00:00+05:30" }),
    ];
    expect(linkOrphanRows(rows)[1]).toMatchObject({ employee_id: 1, branch: "Vellore" });
    expect(attendanceInRange(rows, "2026-11-01", "2026-11-30")).toHaveLength(2);
  });
});
