import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { buildAttendanceReport } from "./attendanceReport";
import type { ReportsBundle } from "./reportsExcel";

const saved: Uint8Array[] = [];
vi.mock("../dayReportExcel", async (importOriginal) => {
  const real = await importOriginal<typeof import("../dayReportExcel")>();
  return { ...real, saveXlsx: (bytes: Uint8Array) => saved.push(bytes) };
});

describe("downloadAllInOne", () => {
  it("writes a Summary sheet and one sheet per loaded report, leaving out the failed ones", async () => {
    const { downloadAllInOne } = await import("./reportsExcel");
    const bundle: ReportsBundle = {
      scope: "All Employees",
      from: "2026-11-01",
      to: "2026-11-05",
      petrol: [],
      productivity: [
        { name: "Jaikumar J", region: "Hosur", km: 12.5, assigned: 6, attended: 4, closed: 3, partOrdered: 1, underObservation: 0, customerPending: 0, engineerDelay: 0 },
      ],
      attendance: buildAttendanceReport([
        { employee_id: 1, employee_name: "Agalya A", branch: "Vellore", status: "Present", intime: "2026-11-02T09:00:00+05:30", outtime: null },
      ]),
      pay: null,
    };
    await downloadAllInOne(bundle, { pay: "Not included: failed" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(saved.at(-1)!.buffer as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "Summary",
      "Petrol Report",
      "Engineer Productivity Report",
      "Attendance Report",
    ]);
    const productivity = wb.getWorksheet("Engineer Productivity Report")!;
    expect(productivity.getRow(4).getCell(2).value).toBe("Jaikumar J");
    expect(wb.getWorksheet("Summary")!.getRow(8).getCell(4).value).toBe("Not included: failed");
  });
});
