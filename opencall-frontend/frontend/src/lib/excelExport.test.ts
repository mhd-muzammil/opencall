import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  buildReportExportMatrix,
  buildWorkbookExportMatrices,
  EXPORT_METADATA_COLUMNS,
  STANDARD_EXPORT_COLUMNS,
} from "./excelExport";

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
        },
        carryForward: {
          carriedForwardFields: ["engineer"],
          manualFieldsCompleted: false,
          manualFieldsMissing: ["customer_mail"],
          changeType: "CARRIED",
          previousTicketMatched: true,
          closedSyntheticRow: false,
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
        },
        carryForward: {
          carriedForwardFields: [],
          manualFieldsCompleted: true,
          manualFieldsMissing: [],
          changeType: "CLOSED",
          previousTicketMatched: true,
          closedSyntheticRow: true,
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

    expect(header).toEqual([...STANDARD_EXPORT_COLUMNS]);
    expect(header).not.toEqual(expect.arrayContaining([...EXPORT_METADATA_COLUMNS]));
    expect(carriedRow).toHaveLength(STANDARD_EXPORT_COLUMNS.length);
    expect(closedRow).toHaveLength(STANDARD_EXPORT_COLUMNS.length);
    expect(carriedRow?.[0]).toBe(1);
    expect(carriedRow?.[1]).toBe("WO-123");
    expect(carriedRow?.[standardColumnIndex("Engineer")]).toBe("Priya");
    expect(carriedRow?.[standardColumnIndex("Customer Mail")]).toBe("Manual Entry Required");
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

    expect(closedRow?.[0]).toBe(78);
    expect(closedRow?.[standardColumnIndex("WIP aging")]).toBe("5");
    expect(closedRow?.[standardColumnIndex("RTPL status")]).toBe("Pending");
    expect(closedRow?.[standardColumnIndex("Flex Status")]).toBe("Open");
  });

  it("splits xlsx workbook data into today call plan and closure sheets", () => {
    const { todayCallPlan, closure } = buildWorkbookExportMatrices(reportFixture());

    expect(todayCallPlan[0]).toEqual([...STANDARD_EXPORT_COLUMNS]);
    expect(closure[0]).toEqual([...STANDARD_EXPORT_COLUMNS]);
    expect(todayCallPlan).toHaveLength(2);
    expect(closure).toHaveLength(2);
    expect(todayCallPlan[1]?.[1]).toBe("WO-123");
    expect(closure[1]?.[1]).toBe("WO-999");
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
    const { todayCallPlan, closure } = buildWorkbookExportMatrices(report);

    expect(matrix.flat()).not.toContain("WO-CANCEL");
    expect(todayCallPlan.flat()).not.toContain("WO-CANCEL");
    expect(closure.flat()).not.toContain("WO-CANCEL");
  });
});
