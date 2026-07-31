import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "../../lib/api/types";
import {
  buildStatusMaps,
  calculateRtplHoursMetrics,
  type RtplHoursMetric,
} from "./rtplHoursMetrics";

type Row = GeneratedReportResponse["rows"][number];

function row(
  serialNo: number,
  output: Partial<Record<string, string | number>>,
  carry: Partial<Row["carryForward"]> = {},
): Row {
  return {
    id: `row-${serialNo}`,
    serialNo,
    output: {
      "S.no": serialNo,
      "Ticket ID": `WO-${serialNo}`,
      ...output,
    } as Row["output"],
    comparison: null,
    carryForward: {
      carriedForwardFields: [],
      manualFieldsCompleted: true,
      manualFieldsMissing: [],
      changeType: null,
      previousTicketMatched: false,
      closedSyntheticRow: false,
      sameDayClosedRow: false,
      ...carry,
    },
    updatedAt: null,
    updatedBy: null,
    rowEditable: true,
    carryForwardSource: "PREVIOUS_FINAL_REPORT",
  };
}

describe("calculateRtplHoursMetrics — EOD Closed Calls vs Closed cancelled", () => {
  it("keeps vanished cancellations out of Closed Calls (they stay in Closed cancelled only)", () => {
    const rows = [
      // Explicit Evening closure on an active row.
      row(1, { "Evening status": "Case-Closed" }),
      // Vanished from Flex, but marked as a cancellation: not a completed close.
      row(
        2,
        { "Evening status": "Closed-cancellation" },
        { closedSyntheticRow: true, sameDayClosedRow: true },
      ),
      // Vanished from Flex with no cancel marker: a completed close.
      row(3, {}, { closedSyntheticRow: true, sameDayClosedRow: true }),
    ];

    const maps = buildStatusMaps(rows);
    const metrics = calculateRtplHoursMetrics(rows, maps.eod, false, maps);
    const byKey = Object.fromEntries(metrics.map((m) => [m.key, m.value]));

    expect(byKey.closedCalls).toBe(2);
    expect(byKey.closedCancelled).toBe(1);
  });
});

describe("calculateRtplHoursMetrics — EOD Actionable / Scheduled union", () => {
  // One row per case the union has to get right.
  const rows = [
    // 1. Booked at 9 AM, worked and closed by evening. The case the old
    //    Evening-only count lost entirely.
    row(1, { "RTPL status": "Scheduled", "Evening status": "Case-Closed" }),
    // 2. Actionable but never scheduled: To be Scheduled has no engineer on it.
    row(2, { "RTPL status": "To be Scheduled", "Evening status": "SSC Pending" }),
    // 3. Sitting in BOTH columns: counted once, not twice.
    row(3, { "RTPL status": "Scheduled", "Evening status": "Scheduled" }),
    // 4. Became actionable during the day — the Evening half of the union.
    row(4, { "RTPL status": "SSC Pending", "Evening status": "To be Scheduled" }),
    // 5. Engineer assigned in the evening: Scheduled but NOT Actionable, so the
    //    two rows move independently.
    row(5, { "RTPL status": "Part Pending", "Evening status": "Engg Assigned" }),
    // 6. Neither column qualifies: never counted.
    row(6, { "RTPL status": "SSC Pending", "Evening status": "SSC Pending" }),
    // 7. Morning-actionable and closed by vanishing from the Flex file. The
    //    Morning half is read over every row, so it stays counted at EOD even
    //    though Open Calls drops it.
    row(
      7,
      { "RTPL status": "Scheduled" },
      { closedSyntheticRow: true, sameDayClosedRow: true },
    ),
    // 8. Booked but never touched in the evening. A blank Evening no longer
    //    deletes the row from these two counts.
    row(8, { "RTPL status": "Scheduled" }),
    // 9. Moved BACK to Scheduled in the evening: the union is direction-agnostic.
    row(9, { "RTPL status": "Engg Assigned", "Evening status": "Scheduled" }),
    // 10. "Engg Assignment Pending" is neither exact status, so it lands in
    //     neither row — it belongs to "To be schedule" (row 9 of the table),
    //     which matches on the substring instead. "Manual entry required" is
    //     scrubbed to blank by cleanStatus.
    row(10, {
      "RTPL status": "Engg Assignment Pending",
      "Evening status": "Manual entry required",
    }),
  ];

  const maps = buildStatusMaps(rows);
  const lookup = (metrics: RtplHoursMetric[]) => (key: string): RtplHoursMetric => {
    const metric = metrics.find((m) => m.key === key);
    if (!metric) throw new Error(`no "${key}" metric`);
    return metric;
  };
  const bod = lookup(calculateRtplHoursMetrics(rows, maps.bod, true, maps));
  const eod = lookup(calculateRtplHoursMetrics(rows, maps.eod, false, maps));

  it("leaves the BOD column on the Morning column alone", () => {
    // Morning exactly Scheduled / To be Scheduled: 1, 2, 3, 7, 8.
    expect(bod("actionable").value).toBe(5);
    // Morning exactly Scheduled / Engg Assigned: 1, 3, 7, 8, 9.
    expect(bod("planned").value).toBe(5);
  });

  it("counts EOD Actionable as Morning ∪ Evening, each row once", () => {
    // Morning {1,2,3,7,8} ∪ Evening {3,4,9} = 1, 2, 3, 4, 7, 8, 9.
    expect(eod("actionable").value).toBe(7);
    expect(eod("actionable").rows.map((r) => r.output["Ticket ID"])).toEqual([
      "WO-1",
      "WO-2",
      "WO-3",
      "WO-4",
      "WO-7",
      "WO-8",
      "WO-9",
    ]);
  });

  it("counts EOD Scheduled as Morning ∪ Evening, each row once", () => {
    // Morning {1,3,7,8,9} ∪ Evening {3,5,9} = 1, 3, 5, 7, 8, 9.
    expect(eod("planned").value).toBe(6);
    expect(eod("planned").rows.map((r) => r.output["Ticket ID"])).toEqual([
      "WO-1",
      "WO-3",
      "WO-5",
      "WO-7",
      "WO-8",
      "WO-9",
    ]);
  });

  it("never lets EOD fall below BOD", () => {
    expect(eod("actionable").value).toBeGreaterThanOrEqual(bod("actionable").value);
    expect(eod("planned").value).toBeGreaterThanOrEqual(bod("planned").value);
  });
});
