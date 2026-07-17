import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  buildPivotMatrix,
  buildRecordsViewWorkbook,
  buildReportExportMatrix,
  buildWorkbookExportMatrices,
  EXPORT_METADATA_COLUMNS,
  pivotFilterLabel,
  RECORDS_VIEW_SHEET,
  STANDARD_EXPORT_COLUMNS,
} from "./excelExport";
import { buildRtplWipAgingPivot } from "../features/dashboard/utils";

function outputRow(
  overrides: Partial<Record<string, string | number>> = {},
): Record<string, string | number> {
  return DAILY_CALL_PLAN_COLUMNS.reduce<Record<string, string | number>>(
    (output, column) => {
      output[column] = overrides[column] ?? "";
      return output;
    },
    {},
  );
}

function standardColumnIndex(column: string): number {
  const index = STANDARD_EXPORT_COLUMNS.indexOf(column as (typeof STANDARD_EXPORT_COLUMNS)[number]);

  if (index < 0) {
    throw new Error(`Missing standard export column: ${column}`);
  }

  return index;
}

function reportFixture(): GeneratedReportResponse {
  return {
    reportId: "report-1",
    sessionId: "session-1",
    reportDate: "2026-05-07",
    columns: DAILY_CALL_PLAN_COLUMNS,
    totalRows: 2,
    duplicateTicketCount: 0,
    unmatchedTicketCount: 0,
    duplicateTracking: {
      flexWip: 0,
      renderways: 0,
      callPlan: 0,
      total: 0,
    },
    carryForward: {
      totalFieldsCarried: 2,
      rowsAutoCompleted: 1,
      rowsStillManual: 1,
    },
    comparison: {
      skipped: false,
      reason: null,
      currentSessionId: "session-1",
      previousSessionId: "session-0",
      summary: {
        total_tickets: 2,
        new_count: 1,
        closed_count: 1,
        updated_count: 0,
        carried_count: 0,
      },
      duplicateTicketIds: {
        current: [],
        previous: [],
      },
    },
    regionBreakdown: [],
    rows: [
      {
        id: "row-1",
        serialNo: 1,
        output: outputRow({
          "S.no": 1,
          "Ticket ID": "WO-123",
          Engineer: "Priya",
          "Customer Mail": "Manual Entry Required",
        }),
        comparison: {
          changeType: "NEW",
          previousFlexStatus: null,
          previousRtplStatus: null,
          previousWipAging: null,
          changedFields: {},
          changeSummary: "New ticket",
          flexStatusUnchangedDays: null,
        },
        carryForward: {
          carriedForwardFields: ["engineer"],
          manualFieldsCompleted: false,
          manualFieldsMissing: ["customer_mail"],
          changeType: "CARRIED",
          previousTicketMatched: true,
          closedSyntheticRow: false,
          sameDayClosedRow: false,
        },
        updatedAt: null,
        updatedBy: null,
        rowEditable: true,
        carryForwardSource: "PREVIOUS_FINAL_REPORT",
      },
      {
        id: "row-2",
        serialNo: 2,
        output: outputRow({
          "S.no": 2,
          "Ticket ID": "WO-999",
          Engineer: "Alex",
        }),
        comparison: {
          changeType: "CLOSED",
          previousFlexStatus: "Open",
          previousRtplStatus: "Pending",
          previousWipAging: "5",
          changedFields: {},
          changeSummary: "Ticket closed",
          flexStatusUnchangedDays: null,
        },
        carryForward: {
          carriedForwardFields: [],
          manualFieldsCompleted: true,
          manualFieldsMissing: [],
          changeType: "CLOSED",
          previousTicketMatched: true,
          closedSyntheticRow: true,
          sameDayClosedRow: false,
        },
        updatedAt: null,
        updatedBy: null,
        rowEditable: true,
        carryForwardSource: "PREVIOUS_FINAL_REPORT",
      },
    ],
  };
}

describe("buildReportExportMatrix", () => {
  it("exports only standard ERP business columns in report order", () => {
    const matrix = buildReportExportMatrix(reportFixture());
    const header = matrix[0];
    const carriedRow = matrix[1];
    const closedRow = matrix[2];

    // The exported header relabels the "RTPL status" key as "Morning status"
    // (the on-screen label); "Evening status" keeps its own name.
    const expectedHeader = [...STANDARD_EXPORT_COLUMNS].map((c) =>
      c === "RTPL status" ? "Morning status" : c,
    );
    expect(header).toEqual(expectedHeader);
    expect(header).not.toEqual(expect.arrayContaining([...EXPORT_METADATA_COLUMNS]));
    expect(carriedRow).toHaveLength(STANDARD_EXPORT_COLUMNS.length);
    expect(closedRow).toHaveLength(STANDARD_EXPORT_COLUMNS.length);
    expect(carriedRow?.[0]).toBe(1);
    expect(carriedRow?.[1]).toBe("WO-123");
    expect(carriedRow?.[standardColumnIndex("Engineer")]).toBe("Priya");
    // The "Manual Entry Required" placeholder is exported as the compact "Entry" label.
    expect(carriedRow?.[standardColumnIndex("Customer Mail")]).toBe("Entry");
    expect(closedRow?.[1]).toBe("WO-999");
    expect(closedRow?.[standardColumnIndex("Engineer")]).toBe("Alex");
  });

  it("keeps closed synthetic rows visible even when output cells are blank", () => {
    const report = reportFixture();
    const closedFixtureRow = report.rows[1];

    if (!closedFixtureRow) {
      throw new Error("Expected closed fixture row");
    }

    report.rows = [
      {
        ...closedFixtureRow,
        serialNo: 78,
        output: outputRow(),
      },
    ];

    const matrix = buildReportExportMatrix(report);
    const closedRow = matrix[1];

    // S.no is renumbered sequentially per export (was the row's serialNo 78).
    expect(closedRow?.[0]).toBe(1);
    // WIP aging is exported as a real number (was previousWipAging "5").
    expect(closedRow?.[standardColumnIndex("WIP aging")]).toBe(5);
    expect(closedRow?.[standardColumnIndex("RTPL status")]).toBe("Pending");
    expect(closedRow?.[standardColumnIndex("Flex Status")]).toBe("Open");
  });

  it("exports numeric measure columns as numbers but keeps id/code columns as text", () => {
    const report = reportFixture();
    const base = report.rows[0]!;
    report.rows = [
      {
        ...base,
        output: outputRow({
          "Ticket ID": "0012345",
          "WO OTC CODE": "01-Trade",
          "WIP aging": "12",
          "Status Aging": "3",
          TAT: "5 days",
        }),
      },
    ];

    const row = buildReportExportMatrix(report)[1];

    // Numeric measures become real numbers -> Excel sorts/aggregates correctly.
    expect(row?.[standardColumnIndex("WIP aging")]).toBe(12);
    expect(row?.[standardColumnIndex("Status Aging")]).toBe(3);
    // Identifiers/codes stay text (leading zeros and labels preserved).
    expect(row?.[standardColumnIndex("Ticket ID")]).toBe("0012345");
    expect(row?.[standardColumnIndex("WO OTC CODE")]).toBe("01-Trade");
    // Non-pure-numeric measure values pass through untouched.
    expect(row?.[standardColumnIndex("TAT")]).toBe("5 days");
  });

  it("splits xlsx workbook into Open Call and Closed Calls (by status) sheets", () => {
    const report = reportFixture();
    // A call explicitly closed by status today.
    report.rows.push({
      ...report.rows[0]!,
      id: "row-closed",
      serialNo: 3,
      output: outputRow({
        "S.no": 3,
        "Ticket ID": "WO-CLOSED1",
        "RTPL status": "WO Closed",
      }),
      carryForward: { ...report.rows[0]!.carryForward, closedSyntheticRow: false },
    });

    const { todayOpenCall, todayClosedCalls } =
      buildWorkbookExportMatrices(report);

    expect(todayOpenCall[0]).toEqual([...STANDARD_EXPORT_COLUMNS]);
    expect(todayClosedCalls[0]).toEqual([...STANDARD_EXPORT_COLUMNS]);
    // WO-123 stays open; WO-CLOSED1 moves to the closed sheet.
    expect(todayOpenCall.flat()).toContain("WO-123");
    expect(todayOpenCall.flat()).not.toContain("WO-CLOSED1");
    expect(todayClosedCalls.flat()).toContain("WO-CLOSED1");
    // S.no is renumbered from 1 in each sheet.
    expect(todayOpenCall[1]?.[0]).toBe(1);
    expect(todayClosedCalls[1]?.[0]).toBe(1);
  });

  it("excludes Request to Cancel flex rows from exports", () => {
    const report = reportFixture();
    report.rows.push({
      ...report.rows[0]!,
      id: "row-3",
      serialNo: 3,
      output: outputRow({
        "S.no": 3,
        "Ticket ID": "WO-CANCEL",
        "Flex Status": "Request to Cancel",
      }),
    });

    const matrix = buildReportExportMatrix(report);
    const { todayOpenCall, todayClosedCalls } = buildWorkbookExportMatrices(report);

    expect(matrix.flat()).not.toContain("WO-CANCEL");
    expect(todayOpenCall.flat()).not.toContain("WO-CANCEL");
    expect(todayClosedCalls.flat()).not.toContain("WO-CANCEL");
  });
});

describe("buildPivotMatrix", () => {
  it("renders the RTPL x WIP pivot in Excel PivotTable layout with blank empty cells", () => {
    const base = reportFixture().rows[0]!;
    const rows = [
      { ...base, id: "p1", output: outputRow({ "Ticket ID": "T1", "RTPL status": "Actionable", "WIP aging": "1" }) },
      { ...base, id: "p2", output: outputRow({ "Ticket ID": "T2", "RTPL status": "Actionable", "WIP aging": "2" }) },
      { ...base, id: "p3", output: outputRow({ "Ticket ID": "T3", "RTPL status": "cx pending", "WIP aging": "1" }) },
    ];

    const matrix = buildPivotMatrix(buildRtplWipAgingPivot(rows, null));

    // Top-of-sheet layout mirrors the native Excel PivotTable.
    expect(matrix[0]).toEqual(["Segment", "(All)"]);
    expect(matrix[1]).toEqual(["WO OTC CODE", "(All)"]);
    expect(matrix[2]).toEqual([""]);
    expect(matrix[3]).toEqual(["Count of Ticket ID", "Column Labels"]);
    expect(matrix[4]).toEqual(["Row Labels", "1", "2", "Grand Total"]);
    // Rows are total-descending: Actionable (2) before cx pending (1).
    expect(matrix[5]).toEqual(["Actionable", 1, 1, 2]);
    // cx pending has no WIP aging 2 -> the empty cell is blank, not 0.
    expect(matrix[6]).toEqual(["cx pending", 1, "", 1]);
    expect(matrix[matrix.length - 1]).toEqual(["Grand Total", 2, 1, 3]);
  });

  it("shows the supplied page-filter labels in the pivot header", () => {
    const base = reportFixture().rows[0]!;
    const rows = [
      { ...base, id: "f1", output: outputRow({ "Ticket ID": "T1", "RTPL status": "Actionable", "WIP aging": "1" }) },
    ];

    const matrix = buildPivotMatrix(buildRtplWipAgingPivot(rows, null), {
      segment: "(All)",
      woOtcCode: "(Multiple Items)",
    });

    expect(matrix[0]).toEqual(["Segment", "(All)"]);
    expect(matrix[1]).toEqual(["WO OTC CODE", "(Multiple Items)"]);
  });
});

describe("pivotFilterLabel", () => {
  function rowWith(woOtcCode: string) {
    const base = reportFixture().rows[0]!;
    return { ...base, output: outputRow({ "WO OTC CODE": woOtcCode }) };
  }

  it("reads like an Excel page filter: single value, (Multiple Items), or (All)", () => {
    expect(pivotFilterLabel([], "WO OTC CODE")).toBe("(All)");
    expect(pivotFilterLabel([rowWith("")], "WO OTC CODE")).toBe("(All)");
    expect(pivotFilterLabel([rowWith("01-Trade"), rowWith("01-Trade")], "WO OTC CODE")).toBe("01-Trade");
    expect(pivotFilterLabel([rowWith("01-Trade"), rowWith("05F-Print")], "WO OTC CODE")).toBe("(Multiple Items)");
  });
});

describe("buildRecordsViewWorkbook", () => {
  // The view export mirrors the on-screen records table: the employee's own
  // column layout/order, sequential S.no, and the grid's blue header styling.
  const viewColumns = ["S.no", "Ticket ID", "RTPL status", "Engineer"];

  it("exports exactly the given columns in order, with on-screen header labels", async () => {
    const workbook = await buildRecordsViewWorkbook(reportFixture().rows, viewColumns);
    const sheet = workbook.getWorksheet(RECORDS_VIEW_SHEET);
    if (!sheet) throw new Error("Records sheet missing");

    const headerValues = [1, 2, 3, 4].map((c) => sheet.getRow(1).getCell(c).value);
    expect(headerValues).toEqual(["S.no", "Ticket ID", "Morning status", "Engineer"]);
    // No extra columns beyond the visible layout.
    expect(sheet.getRow(1).cellCount).toBe(viewColumns.length);

    // Sequential serials matching the on-screen numbering; values follow the
    // standard export mapping (closed rows surface previous statuses).
    expect(sheet.getRow(2).getCell(1).value).toBe(1);
    expect(sheet.getRow(2).getCell(2).value).toBe("WO-123");
    expect(sheet.getRow(2).getCell(4).value).toBe("Priya");
    expect(sheet.getRow(3).getCell(1).value).toBe(2);
    expect(sheet.getRow(3).getCell(3).value).toBe("Pending");
  });

  it("styles the header like the records grid: solid blue fill, dark bold font", async () => {
    const workbook = await buildRecordsViewWorkbook(reportFixture().rows, viewColumns);
    const sheet = workbook.getWorksheet(RECORDS_VIEW_SHEET);
    if (!sheet) throw new Error("Records sheet missing");

    const headerCell = sheet.getRow(1).getCell(1);
    const fill = headerCell.fill as { type: string; pattern: string; fgColor?: { argb?: string } };
    expect(fill.type).toBe("pattern");
    expect(fill.pattern).toBe("solid");
    expect(fill.fgColor?.argb).toBe("FF0EA5E9");
    expect(headerCell.font?.bold).toBe(true);
    expect(headerCell.font?.color?.argb).toBe("FF0F172A");

    // Gridline borders on body cells, like the on-screen table.
    const bodyCell = sheet.getRow(2).getCell(2);
    expect(bodyCell.border?.top?.style).toBe("thin");
    expect(bodyCell.border?.top?.color?.argb).toBe("FFCBD5E1");
  });

  it("freezes the header row and applies an autofilter across the visible columns", async () => {
    const workbook = await buildRecordsViewWorkbook(reportFixture().rows, viewColumns);
    const sheet = workbook.getWorksheet(RECORDS_VIEW_SHEET);
    if (!sheet) throw new Error("Records sheet missing");

    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toMatchObject({
      from: { row: 1, column: 1 },
      to: { row: 1, column: viewColumns.length },
    });
  });

  it("round-trips through xlsx serialization (valid workbook bytes)", async () => {
    const workbook = await buildRecordsViewWorkbook(reportFixture().rows, viewColumns);
    const bytes = await workbook.xlsx.writeBuffer();
    expect(bytes.byteLength).toBeGreaterThan(500);

    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(bytes as ArrayBuffer);
    const sheet = reread.getWorksheet(RECORDS_VIEW_SHEET);
    expect(sheet?.getRow(2).getCell(2).value).toBe("WO-123");
  });
});
