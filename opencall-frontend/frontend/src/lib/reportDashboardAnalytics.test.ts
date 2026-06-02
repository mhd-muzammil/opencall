import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  buildFlexOperationalAnalytics,
  buildOverallWoOtcBreakdown,
  buildRtplOperationalAnalytics,
  buildRtplTimeCards,
  filterRowsByRegion,
  isTodayCallPlanVisibleRow,
  reportWithRows,
} from "./reportDashboardAnalytics";

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

function row(
  serialNo: number,
  overrides: Partial<Record<string, string | number>>,
): GeneratedReportResponse["rows"][number] {
  return {
    id: `row-${serialNo}`,
    serialNo,
    output: outputRow({ "S.no": serialNo, ...overrides }),
    comparison: null,
    carryForward: {
      carriedForwardFields: [],
      manualFieldsCompleted: true,
      manualFieldsMissing: [],
      changeType: null,
      previousTicketMatched: false,
      closedSyntheticRow: false,
    },
    updatedAt: null,
    updatedBy: null,
    rowEditable: true,
    carryForwardSource: "PREVIOUS_FINAL_REPORT",
  };
}

function reportFixture(): GeneratedReportResponse {
  return {
    reportId: "report-1",
    sessionId: "session-1",
    reportDate: "2026-05-07",
    columns: DAILY_CALL_PLAN_COLUMNS,
    totalRows: 3,
    duplicateTicketCount: 0,
    unmatchedTicketCount: 0,
    duplicateTracking: {
      flexWip: 0,
      renderways: 0,
      callPlan: 0,
      total: 0,
    },
    carryForward: {
      totalFieldsCarried: 0,
      rowsAutoCompleted: 0,
      rowsStillManual: 0,
    },
    comparison: {
      skipped: true,
      reason: "NO_PREVIOUS_REPORT",
      currentSessionId: "session-1",
      previousSessionId: null,
      summary: null,
      duplicateTicketIds: {
        current: [],
        previous: [],
      },
    },
    regionBreakdown: [
      {
        aspCode: "ASPS01461",
        regionName: "CHENNAI",
        count: 2,
        closedCount: 0,
        woOtcCodeBreakdown: [
          { code: "05K-Extended Warranty", count: 1 },
          { code: "01-Trade", count: 1 },
        ],
      },
      {
        aspCode: "UNKNOWN",
        regionName: "Unknown Region",
        count: 1,
        closedCount: 0,
        woOtcCodeBreakdown: [
          { code: "05K-Extended Warranty", count: 1 },
        ],
      },
    ],
    rows: [
      row(1, {
        "Ticket ID": "WO-1",
        "Work Location": "ASPS01461",
        "Flex Status": "Open",
        "RTPL status": "Completed",
      }),
      row(2, {
        "Ticket ID": "WO-2",
        "Work Location": "ASPS01461",
        "Flex Status": "Assigned",
        "RTPL status": "Hold",
      }),
      row(3, {
        "Ticket ID": "WO-3",
        "Work Location": "UNKNOWN",
        "Flex Status": "Open",
        "RTPL status": "Completed",
      }),
    ],
  };
}

describe("reportDashboardAnalytics", () => {
  it("preserves the existing All Regions contract breakdown aggregation", () => {
    expect(buildOverallWoOtcBreakdown(reportFixture().regionBreakdown)).toEqual([
      { code: "05K-Extended Warranty", count: 2 },
      { code: "01-Trade", count: 1 },
    ]);
  });

  it("builds dynamic RTPL metrics from real row statuses only", () => {
    const metrics = buildRtplOperationalAnalytics([
      ...reportFixture().rows,
      row(4, {
        "Ticket ID": "WO-4",
        "Work Location": "ASPS01461",
        "RTPL status": "Manual Entry Required",
      }),
    ]);

    expect(metrics).toEqual([
      { status: "Completed", count: 2 },
      { status: "Hold", count: 1 },
      { status: "Manual Entry Required", count: 1 },
    ]);
  });

  it("uses previous RTPL status for analytics when current report still has manual placeholder", () => {
    const carriedRow = row(4, {
      "Ticket ID": "WO-4",
      "Work Location": "ASPS01461",
      "RTPL status": "Manual Entry Required",
    });
    carriedRow.comparison = {
      changeType: "CARRIED",
      previousFlexStatus: "Open",
      previousRtplStatus: "Part Pending",
      previousWipAging: "2",
      changedFields: {},
      changeSummary: "No tracked changes",
    };

    const metrics = buildRtplOperationalAnalytics([carriedRow]);

    expect(metrics).toEqual([{ status: "Part Pending", count: 1 }]);
  });

  it("builds dynamic Flex metrics from real row statuses only", () => {
    const metrics = buildFlexOperationalAnalytics([
      ...reportFixture().rows,
      row(4, {
        "Ticket ID": "WO-4",
        "Work Location": "ASPS01461",
        "Flex Status": "Engg Assigned",
      }),
    ]);

    expect(metrics).toEqual([
      { status: "Open", count: 2 },
      { status: "Assigned", count: 1 },
      { status: "Engg Assigned", count: 1 },
    ]);
  });

  it("filters rows by region for region-aware analytics and export", () => {
    const report = reportFixture();
    const chennaiRows = filterRowsByRegion(report.rows, "ASPS01461");
    const exportReport = reportWithRows(report, chennaiRows);

    expect(chennaiRows.map((reportRow) => reportRow.output["Ticket ID"])).toEqual([
      "WO-1",
      "WO-2",
    ]);
    expect(exportReport.totalRows).toBe(2);
    expect(exportReport.regionBreakdown).toBe(report.regionBreakdown);
  });

  it("removes Request to Cancel flex statuses from today call-plan visibility", () => {
    const visibleRow = row(1, {
      "Ticket ID": "WO-1",
      "Flex Status": "Open",
    });
    const requestToCancelRow = row(2, {
      "Ticket ID": "WO-2",
      "Flex Status": " request   TO   cancel ",
    });

    expect(isTodayCallPlanVisibleRow(visibleRow)).toBe(true);
    expect(isTodayCallPlanVisibleRow(requestToCancelRow)).toBe(false);
  });

  it("builds fixed RTPL time cards with carry-forward and checkpoint change details", () => {
    const carriedRow = row(10, {
      "Ticket ID": "WO-CARRY",
      "RTPL status": "Part Pending",
    });
    carriedRow.carryForward.carriedForwardFields = ["rtpl_status"];

    const cards = buildRtplTimeCards([carriedRow], [
      {
        id: "change-1",
        rowId: "row-1",
        reportId: "report-1",
        serialNo: 1,
        ticketId: "WO-1",
        caseId: null,
        workLocation: "ASPS01461",
        fromStatus: "Actionable",
        toStatus: "Need to Cancel",
        changedAt: "2026-06-02T08:46:00.000Z",
        changedBy: "user-1",
      },
      {
        id: "change-2",
        rowId: "row-2",
        reportId: "report-1",
        serialNo: 2,
        ticketId: "WO-2",
        caseId: null,
        workLocation: "ASPS01461",
        fromStatus: "Part Pending",
        toStatus: "Actionable",
        changedAt: "2026-06-02T11:00:00.000Z",
        changedBy: "user-2",
      },
    ]);

    expect(cards.map((card) => [card.label, card.status, card.count])).toEqual([
      ["Upload Time", "Baseline", 1],
      ["11:45 AM", "No Change", 0],
      ["2:00 PM", "No Change", 0],
      ["4:00 PM", "Changed", 1],
      ["6:00 PM", "Changed", 1],
    ]);
    expect(cards[0]?.details[0]).toMatchObject({
      type: "carry-forward",
      ticketId: "WO-CARRY",
      status: "Part Pending",
    });
    expect(cards[0]?.statusBreakdown).toEqual([
      { status: "Part Pending", count: 1 },
    ]);
    expect(cards[3]?.details[0]).toMatchObject({
      type: "change",
      ticketId: "WO-1",
      fromStatus: "Actionable",
      toStatus: "Need to Cancel",
    });
    expect(cards[3]?.statusBreakdown).toEqual([
      { status: "Need to Cancel", count: 1 },
    ]);
    expect(cards[4]?.statusBreakdown).toEqual([
      { status: "Actionable", count: 1 },
    ]);
  });
});
