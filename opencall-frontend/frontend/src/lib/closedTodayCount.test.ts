// The closed ledger is cumulative by design: a closed ticket is re-emitted into
// every later report so the Closed Calls page keeps its history. That makes the
// ledger length useless as "how many closed today" — it only ever grows. These
// lock the flag that separates the two, which is what the dashboard now reads.
import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";

type Row = GeneratedReportResponse["rows"][number];

function row(serialNo: number, ticketId: string): Row {
  return {
    id: `row-${serialNo}`,
    serialNo,
    output: DAILY_CALL_PLAN_COLUMNS.reduce<Record<string, string | number>>(
      (output, column) => {
        output[column] = "";
        return output;
      },
      { "S.no": serialNo, "Ticket ID": ticketId },
    ),
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

function closedToday(serialNo: number, ticketId: string): Row {
  const r = row(serialNo, ticketId);
  r.carryForward.closedSyntheticRow = true;
  r.carryForward.sameDayClosedRow = true;
  return r;
}

function closedEarlierDay(serialNo: number, ticketId: string): Row {
  const r = row(serialNo, ticketId);
  r.carryForward.closedSyntheticRow = true;
  r.carryForward.sameDayClosedRow = false;
  return r;
}

const closedRowsOf = (rows: Row[]) =>
  rows.filter((r) => r.carryForward.closedSyntheticRow);

const closedTodayRowsOf = (rows: Row[]) =>
  rows.filter(
    (r) => r.carryForward.closedSyntheticRow && r.carryForward.sameDayClosedRow === true,
  );

describe("closed today vs the cumulative ledger", () => {
  it("counts only this day's closures, not the ones carried in from earlier days", () => {
    const rows = [
      row(1, "WO-OPEN"),
      closedToday(2, "WO-A"),
      closedToday(3, "WO-B"),
      closedEarlierDay(4, "WO-OLD-1"),
      closedEarlierDay(5, "WO-OLD-2"),
      closedEarlierDay(6, "WO-OLD-3"),
    ];

    // The ledger keeps every closure ever - this is the number that read as 82.
    expect(closedRowsOf(rows)).toHaveLength(5);
    // What actually closed today.
    expect(closedTodayRowsOf(rows)).toHaveLength(2);
  });

  it("reports zero closed today when every closure was carried in", () => {
    const rows = [row(1, "WO-OPEN"), closedEarlierDay(2, "WO-OLD")];

    expect(closedRowsOf(rows)).toHaveLength(1);
    expect(closedTodayRowsOf(rows)).toHaveLength(0);
  });

  it("never counts an open row as closed", () => {
    const rows = [row(1, "WO-OPEN"), row(2, "WO-OPEN-2")];

    expect(closedRowsOf(rows)).toHaveLength(0);
    expect(closedTodayRowsOf(rows)).toHaveLength(0);
  });
});
