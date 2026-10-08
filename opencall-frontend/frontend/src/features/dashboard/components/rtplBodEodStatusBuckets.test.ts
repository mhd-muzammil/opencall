import { afterEach, describe, expect, it } from "vitest";
import { setCustomBodEodRows, setStatusBucketMap } from "@opencall/shared";
import { calculateKpiMetricsForCardView } from "./RTPLAnalytics";
import type { ReportRow } from "../types";

// The BOD/EOD rows follow the row chosen for each status on the RTPL Statuses
// page, not words in the status name.

function row(ticketId: string, status: string): ReportRow {
  return {
    serialNo: 1,
    output: {
      "Ticket ID": ticketId,
      Engineer: "Thamaraiselvan",
      "RTPL status": status,
      "Work Location": "ASPS01465",
      "Flex Status": "Open",
    },
    carryForward: { closedSyntheticRow: false, sameDayClosedRow: false },
    comparison: null,
  } as unknown as ReportRow;
}

function metrics(rows: ReportRow[]) {
  const statusMap: Record<string, string> = {};
  for (const r of rows) {
    statusMap[String(r.output["Ticket ID"])] = String(r.output["RTPL status"]);
  }
  return calculateKpiMetricsForCardView(rows, statusMap, true);
}

afterEach(() => {
  setStatusBucketMap([]);
});

describe("BOD/EOD rows follow the admin's status mapping", () => {
  it("a new status lands in the row the admin chose", () => {
    const rows = [row("WO-1", "Waiting on Client")];
    // No keyword in the name: without a mapping it counts under no row.
    expect(metrics(rows).cxReschedule).toBe(0);

    setStatusBucketMap([{ name: "Waiting on Client", bucket: "CX_RESCHEDULE" }]);
    const m = metrics(rows);
    expect(m.cxReschedule).toBe(1);
    expect(m.tickets.cxReschedule).toEqual(["WO-1"]);
    expect(m.openCalls).toBe(1);
  });

  it("moving a status moves its calls to the new row", () => {
    const rows = [row("WO-1", "Customer Denied service"), row("WO-2", "Customer Denied service")];
    setStatusBucketMap([{ name: "Customer Denied service", bucket: "TO_BE_CANCEL" }]);
    expect(metrics(rows).toBeCancel).toBe(2);

    setStatusBucketMap([{ name: "Customer Denied service", bucket: "CX_RESCHEDULE" }]);
    const m = metrics(rows);
    expect(m.toBeCancel).toBe(0);
    expect(m.cxReschedule).toBe(2);
  });

  it("a mapped status counts under exactly one row", () => {
    // The name hits both the "cx" and "ssc" keyword lists; mapped, it is
    // SSC Pending and nothing else.
    setStatusBucketMap([{ name: "CX SSC Pending", bucket: "SSC_PENDING" }]);
    const m = metrics([row("WO-1", "CX SSC Pending")]);
    expect(m.sscPending).toBe(1);
    expect(m.cxReschedule).toBe(0);
  });

  it("Planned, Onsite, Closed and Actionable follow the mapping too", () => {
    setStatusBucketMap([
      { name: "Engineer On The Way", bucket: "SCHEDULED" },
      { name: "At Customer", bucket: "ONSITE" },
      { name: "Completed", bucket: "CLOSED" },
      { name: "Awaiting Slot", bucket: "TO_BE_SCHEDULE" },
    ]);
    const m = metrics([
      row("WO-1", "Engineer On The Way"),
      row("WO-2", "At Customer"),
      row("WO-3", "Completed"),
      row("WO-4", "Awaiting Slot"),
    ]);
    expect(m.planned).toBe(1);
    expect(m.enggOnsite).toBe(1);
    expect(m.closedCalls).toBe(1);
    expect(m.toBeSchedule).toBe(1);
    expect(m.actionable).toBe(1);
  });

  it("status text no longer in the admin list keeps the old keyword rules", () => {
    setStatusBucketMap([{ name: "Scheduled", bucket: "SCHEDULED" }]);
    const m = metrics([row("WO-1", "ssc pedning"), row("WO-2", "to be yank")]);
    expect(m.sscPending).toBe(1);
    expect(m.toBeYank).toBe(1);
  });
});

describe("BOD/EOD rows an admin added", () => {
  afterEach(() => {
    setCustomBodEodRows([]);
  });

  it("collect the calls of every status put under them", () => {
    setCustomBodEodRows([
      {
        key: "C_abc1234567",
        label: "HP Approval",
        productivityBucket: "ATTENDED_OTHER",
        afterRow: "TO_BE_CANCEL",
        sortOrder: 10,
        isActive: true,
      },
    ]);
    setStatusBucketMap([
      { name: "Waiting for HP Approval", bucket: "C_abc1234567" },
      { name: "HP Approval Mail Sent", bucket: "C_abc1234567" },
    ]);
    const m = metrics([
      row("WO-1", "Waiting for HP Approval"),
      row("WO-2", "HP Approval Mail Sent"),
      row("WO-3", "Customer Pending"),
    ]);
    expect(m.customRowTickets["C_abc1234567"]).toEqual(["WO-1", "WO-2"]);
    expect(m.cxReschedule).toBe(1);
  });

  it("a hidden row is left out", () => {
    setCustomBodEodRows([
      {
        key: "C_abc1234567",
        label: "HP Approval",
        productivityBucket: "ATTENDED_OTHER",
        afterRow: "TO_BE_CANCEL",
        sortOrder: 10,
        isActive: false,
      },
    ]);
    expect(metrics([row("WO-1", "x")]).customRowTickets).toEqual({});
  });
});
