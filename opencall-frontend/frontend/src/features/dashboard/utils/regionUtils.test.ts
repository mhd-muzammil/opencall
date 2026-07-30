import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { calculateRegionStats } from "./regionUtils";

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
  overrides: Partial<Record<string, string | number>> = {},
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
      sameDayClosedRow: false,
    },
    updatedAt: null,
    updatedBy: null,
    rowEditable: true,
    carryForwardSource: "PREVIOUS_FINAL_REPORT",
  };
}

describe("calculateRegionStats openCount", () => {
  it("separates still-open calls from the ones that closed on a same-day re-upload", () => {
    const openRow = row(1, { "Ticket ID": "WO-1" });

    const sameDayClosedRow = row(2, { "Ticket ID": "WO-2" });
    sameDayClosedRow.carryForward.closedSyntheticRow = true;
    sameDayClosedRow.carryForward.sameDayClosedRow = true;

    const stats = calculateRegionStats([openRow, sameDayClosedRow]);

    // count keeps every row the Records page lists, so the card can show the
    // closed-today figure and still match what a click opens.
    expect(stats.count).toBe(2);
    expect(stats.openCount).toBe(1);
  });

  it("counts every row as open when nothing closed today", () => {
    const stats = calculateRegionStats([
      row(1, { "Ticket ID": "WO-1" }),
      row(2, { "Ticket ID": "WO-2" }),
    ]);

    expect(stats.count).toBe(2);
    expect(stats.openCount).toBe(2);
  });

  it("excludes a Request to Cancel row from openCount", () => {
    const cancelledRow = row(2, {
      "Ticket ID": "WO-2",
      "Flex Status": "Request to Cancel",
    });

    const stats = calculateRegionStats([row(1, { "Ticket ID": "WO-1" }), cancelledRow]);

    expect(stats.count).toBe(2);
    expect(stats.openCount).toBe(1);
  });

  it("reports zero open when every row closed today", () => {
    const closedA = row(1, { "Ticket ID": "WO-1" });
    closedA.carryForward.closedSyntheticRow = true;
    closedA.carryForward.sameDayClosedRow = true;
    const closedB = row(2, { "Ticket ID": "WO-2" });
    closedB.carryForward.closedSyntheticRow = true;
    closedB.carryForward.sameDayClosedRow = true;

    const stats = calculateRegionStats([closedA, closedB]);

    expect(stats.count).toBe(2);
    expect(stats.openCount).toBe(0);
  });
});
