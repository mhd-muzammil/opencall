import { afterEach, describe, expect, it } from "vitest";
import { setCustomBodEodRows, setStatusBucketMap } from "@opencall/shared";
import { calculateKpiMetricsForCardView } from "./RTPLAnalytics";
import { splitTickets } from "../utils/openCallSplit";
import type { ReportRow } from "../types";

// The Open Calls split-up under the BOD/EOD table: every open call in exactly
// one part, the parts equal to the table rows, and nothing silently missing.

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
      ...(input.flexStatusWip === undefined ? {} : { "Flex Status (WIP)": input.flexStatusWip }),
    },
    carryForward: {
      closedSyntheticRow: input.closedSyntheticRow ?? false,
      sameDayClosedRow: input.closedSyntheticRow ?? false,
    },
    comparison: null,
  } as unknown as ReportRow;
}

const many = (prefix: string, status: string, n: number) =>
  Array.from({ length: n }, (_, i) => row({ ticketId: `${prefix}-${i + 1}`, status }));

function metrics(rows: ReportRow[], isBod = true) {
  const statusMap: Record<string, string> = {};
  for (const r of rows) statusMap[String(r.output["Ticket ID"])] = String(r.output["RTPL status"]);
  return calculateKpiMetricsForCardView(rows, statusMap, isBod);
}

const part = (m: ReturnType<typeof metrics>, key: string) =>
  m.openCallSplit.parts.find((p) => p.key === key)?.count;

const MAPPING = [
  { name: "Scheduled", bucket: "SCHEDULED" },
  { name: "To Be Scheduled", bucket: "TO_BE_SCHEDULE" },
  { name: "Customer Pending", bucket: "CX_RESCHEDULE" },
  { name: "SSC Pending", bucket: "SSC_PENDING" },
  { name: "Under observation", bucket: "UNDER_OBSERVATION" },
  { name: "Under Cancellation", bucket: "OTHER" },
  { name: "Visit Quote to Customer", bucket: "OTHER" },
];

afterEach(() => {
  setStatusBucketMap([]);
  setCustomBodEodRows([]);
});

describe("Open Calls split-up", () => {
  it("adds up to Open Calls, and each part equals its table row", () => {
    setStatusBucketMap(MAPPING);
    const rows = [
      ...many("S", "Scheduled", 7),
      ...many("T", "To Be Scheduled", 2),
      ...many("C", "Customer Pending", 3),
      ...many("P", "SSC Pending", 4),
      ...many("U", "Under observation", 1),
      ...many("X", "Under Cancellation", 3),
      ...many("V", "Visit Quote to Customer", 1),
      ...many("B", "", 2),
      ...many("M", "Manual Entry Required", 1),
    ];
    const m = metrics(rows);
    const s = m.openCallSplit;

    expect(s.total).toBe(m.openCalls);
    expect(s.total).toBe(24);
    expect(s.sum).toBe(s.total);

    expect(part(m, "planned")).toBe(m.planned);
    expect(part(m, "toBeSchedule")).toBe(m.toBeSchedule);
    expect(part(m, "planned")! + part(m, "toBeSchedule")!).toBe(m.actionable);
    expect(part(m, "cxReschedule")).toBe(m.cxReschedule);
    expect(part(m, "sscPending")).toBe(m.sscPending);
    expect(part(m, "underObservation")).toBe(m.underObservation);

    // What no row counts is named, largest first, not lost.
    expect(s.other.map((p) => [p.label, p.count])).toEqual([
      ["Under Cancellation", 3],
      ["Visit Quote to Customer", 1],
    ]);
    expect(s.noStatus.count).toBe(3);
    expect(s.overlaps).toEqual([]);
  });

  it("every open call's ticket appears in exactly one part", () => {
    setStatusBucketMap(MAPPING);
    const rows = [...many("S", "Scheduled", 3), ...many("X", "Under Cancellation", 2), ...many("B", "", 1)];
    const s = metrics(rows).openCallSplit;
    const all = [
      ...s.parts.flatMap((p) => p.tickets),
      ...s.other.flatMap((p) => p.tickets),
      ...s.noStatus.tickets,
      ...s.cancelled.tickets,
    ].sort();
    expect(all).toEqual(rows.map((r) => String(r.output["Ticket ID"])).sort());
  });

  it("a BOD call Flex later cancelled is named, not missing (it is left out of Scheduled on purpose)", () => {
    setStatusBucketMap(MAPPING);
    const rows = [
      row({ ticketId: "LIVE", status: "Scheduled" }),
      row({ ticketId: "GONE", status: "Scheduled", flexStatus: "Closed - Canceled", flexStatusWip: "Scheduled", closedSyntheticRow: true }),
    ];
    const m = metrics(rows, true);
    expect(m.openCalls).toBe(2);
    expect(m.planned).toBe(1);
    expect(m.openCallSplit.cancelled.tickets).toEqual(["GONE"]);
    expect(m.openCallSplit.sum).toBe(2);
  });

  it("EOD splits only the calls still open in the evening", () => {
    setStatusBucketMap(MAPPING);
    const rows = [
      row({ ticketId: "OPEN", status: "Customer Pending" }),
      row({ ticketId: "CLOSED", status: "Scheduled", flexStatus: "WO Closed", flexStatusWip: "Scheduled", closedSyntheticRow: true }),
    ];
    const m = metrics(rows, false);
    expect(m.openCalls).toBe(1);
    expect(m.openCallSplit.total).toBe(1);
    expect(part(m, "cxReschedule")).toBe(1);
    expect(m.openCallSplit.sum).toBe(1);
  });

  it("status text no row is stored for, matching two keyword rows, is counted once and flagged", () => {
    // Not in the admin list: falls back to the keyword rules, where "ssc" and
    // "cx" both match.
    const rows = many("O", "SSC pending cx", 2);
    const m = metrics(rows);
    expect(m.sscPending).toBe(2);
    expect(m.cxReschedule).toBe(2);
    expect(m.openCallSplit.sum).toBe(2);
    expect(m.openCallSplit.overlaps).toEqual([
      { status: "SSC pending cx", count: 2, rows: ["Customer Pending", "SSC Pending"] },
    ]);
  });

  it("a custom row is its own part", () => {
    setCustomBodEodRows([
      { key: "C_quote01", label: "Quote to Customer", productivityBucket: "ATTENDED_OTHER", afterRow: "SSC_PENDING", sortOrder: 1, isActive: true },
    ]);
    setStatusBucketMap([...MAPPING.filter((e) => e.name !== "Visit Quote to Customer"), { name: "Visit Quote to Customer", bucket: "C_quote01" }]);
    const m = metrics(many("V", "Visit Quote to Customer", 4));
    expect(m.openCallSplit.parts.find((p) => p.key === "C_quote01")).toMatchObject({ label: "Quote to Customer", count: 4 });
    expect(m.openCallSplit.other).toEqual([]);
    expect(m.openCallSplit.sum).toBe(4);
  });
});

describe("Clicking a row: that row's split-up", () => {
  it("EOD Actionable (the morning's actionable calls) splits by where each call is in the evening, closed ones included", () => {
    setStatusBucketMap([...MAPPING, { name: "Engineer Delay", bucket: "ENGINEER_DELAY" }]);
    // Seven calls were actionable in the morning; by the evening:
    const evening = [
      row({ ticketId: "A1", status: "Scheduled" }),
      row({ ticketId: "A2", status: "Scheduled" }),
      row({ ticketId: "A3", status: "To Be Scheduled" }),
      row({ ticketId: "A4", status: "Customer Pending" }),
      row({ ticketId: "A5", status: "Engineer Delay" }),
      row({ ticketId: "A6", status: "Scheduled", flexStatus: "WO Closed", flexStatusWip: "Scheduled", closedSyntheticRow: true }),
      row({ ticketId: "A7", status: "Scheduled", flexStatus: "Closed - Canceled", flexStatusWip: "Scheduled", closedSyntheticRow: true }),
      row({ ticketId: "Z9", status: "SSC Pending" }), // not part of the row being split
    ];
    const m = metrics(evening, false);
    const actionable = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"];
    const groups = splitTickets(actionable, m.openCallSplit, [
      { label: "Closed", tickets: m.tickets.closedCalls },
      { label: "Closed cancelled", tickets: m.tickets.closedCancelled },
    ]);
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ["Scheduled", 2],
      ["To be schedule", 1],
      ["Customer Pending", 1],
      ["Engineer Delay", 1],
      ["Closed", 1],
      ["Closed cancelled", 1],
    ]);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(actionable.length);
  });

  it("a call matching no group is shown as Not classified, so the row still adds up", () => {
    setStatusBucketMap(MAPPING);
    const m = metrics([row({ ticketId: "S1", status: "Scheduled" })]);
    const groups = splitTickets(["S1", "GHOST"], m.openCallSplit);
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ["Scheduled", 1],
      ["Not classified", 1],
    ]);
  });
});


describe("Open Calls split: Actionable is the Actionable row's own number", () => {
  afterEach(() => {
    setStatusBucketMap([]);
  });

  it("Engg Assigned and older 'assignment pending' calls are their own parts, not in Actionable", () => {
    // As on prod after migration 068: Engg Assigned is Planned, Engg Assignment
    // Pending stays on the old keyword rules (To be schedule row, not Actionable).
    setStatusBucketMap([
      { name: "Scheduled", bucket: "SCHEDULED" },
      { name: "To Be Scheduled", bucket: "TO_BE_SCHEDULE" },
      { name: "Engg Assigned", bucket: "SCHEDULED" },
    ]);
    const m = metrics([
      ...many("S", "Scheduled", 3),
      ...many("T", "To Be Scheduled", 2),
      ...many("A", "Engg Assigned", 1),
      ...many("P", "Engg Assignment Pending", 1),
    ]);
    const part = (key: string) => m.openCallSplit.parts.find((p) => p.key === key)!.count;

    expect(part("planned") + part("toBeSchedule")).toBe(m.actionable);
    expect(part("planned")).toBe(3);
    expect(part("toBeSchedule")).toBe(2);
    expect(part("plannedOther")).toBe(1);
    expect(part("toBeScheduleOther")).toBe(1);
    expect(m.openCallSplit.sum).toBe(m.openCallSplit.total);
    // These parts overlap by design; that is not a double count.
    expect(m.openCallSplit.overlaps).toEqual([]);
  });
});
