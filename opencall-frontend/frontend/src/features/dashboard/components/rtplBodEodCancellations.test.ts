import { describe, expect, it } from "vitest";
import { calculateKpiMetricsForCardView } from "./RTPLAnalytics";
import type { ReportRow } from "../types";

// A row shaped the way the BOD/EOD tables see it. The PRESENCE of the
// "Flex Status (WIP)" key is what marks the closure overlay as having fired, so
// it is only added when a test asks for it.
function row(input: {
  ticketId: string;
  status: string;
  flexStatus?: string;
  flexStatusWip?: string;
  closedSyntheticRow?: boolean;
}): ReportRow {
  return {
    serialNo: 1,
    output: {
      "Ticket ID": input.ticketId,
      Engineer: "Thamaraiselvan",
      "RTPL status": input.status,
      "Work Location": "ASPS01465",
      "Flex Status": input.flexStatus ?? "Open",
      ...(input.flexStatusWip === undefined
        ? {}
        : { "Flex Status (WIP)": input.flexStatusWip }),
    },
    carryForward: {
      closedSyntheticRow: input.closedSyntheticRow ?? false,
      sameDayClosedRow: input.closedSyntheticRow ?? false,
    },
    comparison: null,
  } as unknown as ReportRow;
}

function metrics(rows: ReportRow[], isBod: boolean) {
  const statusMap: Record<string, string> = {};
  for (const r of rows) {
    statusMap[String(r.output["Ticket ID"])] = String(r.output["RTPL status"]);
  }
  return calculateKpiMetricsForCardView(rows, statusMap, isBod);
}

describe("BOD/EOD — Flex-cancelled calls", () => {
  const cancelled = row({
    ticketId: "WO-CANCELLED",
    status: "Scheduled",
    flexStatus: "Closed - Canceled",
    flexStatusWip: "Scheduled",
    closedSyntheticRow: true,
  });
  const genuineClose = row({
    ticketId: "WO-CLOSED",
    status: "Scheduled",
    flexStatus: "WO Closed",
    flexStatusWip: "Scheduled",
    closedSyntheticRow: true,
  });
  const live = row({ ticketId: "WO-LIVE", status: "Scheduled" });

  // The decision: cancellations leave the WORK lines only. They stay in the
  // population count so the day still reconciles.
  it("keeps a cancelled call out of Scheduled and Actionable on BOD", () => {
    const withCancel = metrics([live, cancelled], true);
    const withoutCancel = metrics([live], true);

    expect(withCancel.planned).toBe(withoutCancel.planned);
    expect(withCancel.actionable).toBe(withoutCancel.actionable);
    // ...but the population line still sees it.
    expect(withCancel.openCalls).toBe(2);
  });

  it("counts it on Closed cancelled and never on Closed Calls", () => {
    const result = metrics([cancelled, genuineClose], false);
    expect(result.closedCancelled).toBe(1);
    expect(result.closedCalls).toBe(1);
    expect(result.tickets.closedCancelled).toEqual(["WO-CANCELLED"]);
    expect(result.tickets.closedCalls).toEqual(["WO-CLOSED"]);
  });

  it("does not count an engineer present on a cancelled call alone", () => {
    // An engineer whose only booking was cancelled did not turn up to anything.
    expect(metrics([cancelled], true).enggPresents).toBe(0);
    expect(metrics([live], true).enggPresents).toBe(1);
    // A cancellation alongside a real booking leaves the engineer present once.
    expect(metrics([live, cancelled], true).enggPresents).toBe(1);
  });

  // The guard that keeps the exclusion narrow: isCancelledClosure falls back to
  // a keyword test on our own status when Flex has not reported, so an OPEN call
  // parked at a cancellation-ish status must survive — it is still work owed.
  it("keeps an open call parked at 'Under Cancellation' in the work lines", () => {
    const parked = row({ ticketId: "WO-PARKED", status: "Scheduled" });
    parked.output["Evening status"] = "Under Cancellation";
    const result = metrics([parked], true);
    expect(result.planned).toBe(1);
    expect(result.actionable).toBe(1);
  });
});
