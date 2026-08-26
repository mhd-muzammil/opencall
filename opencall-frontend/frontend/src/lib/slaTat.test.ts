import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  bucketFor,
  calculateFieldezSlaMetrics,
  calculateSlaMetrics,
  collapseToCalls,
  readTat,
  ticketKey,
} from "./slaTat";

type Row = GeneratedReportResponse["rows"][number];

/**
 * The bug these exist for: the Flex WIP export is PART-level, so a call waiting on three
 * spare parts arrives as three rows carrying one Ticket ID. Counting rows made that one call
 * three calls in the SLA total, three entries in the drill-down, and three votes in the
 * adherence percentage.
 */
function row(over: Record<string, unknown>): Row {
  return { output: over } as unknown as Row;
}

const NOW = new Date("2026-08-26T12:00:00.000Z");
const FUTURE = "2026-08-31T18:00:00.000Z";
const PAST = "2026-08-20T18:00:00.000Z";

describe("ticketKey", () => {
  it("reads the same call written three ways as one call", () => {
    expect(ticketKey("WO-035640797")).toBe(ticketKey("WO035640797"));
    expect(ticketKey("wo-035640797")).toBe(ticketKey("WO-035640797"));
  });

  it("is empty for a row with no ticket at all", () => {
    expect(ticketKey("")).toBe("");
    expect(ticketKey("   ")).toBe("");
    expect(ticketKey(null)).toBe("");
  });
});

describe("readTat", () => {
  it("reads a real date", () => {
    expect(readTat(row({ TAT: FUTURE }))?.toISOString()).toBe(new Date(FUTURE).toISOString());
  });

  it("is null for the placeholder, a blank, and a value that is not a date", () => {
    expect(readTat(row({ TAT: "Manual Entry Required" }))).toBeNull();
    expect(readTat(row({ TAT: "" }))).toBeNull();
    expect(readTat(row({}))).toBeNull();
    expect(readTat(row({ TAT: "not a date" }))).toBeNull();
  });
});

describe("bucketFor", () => {
  it("is within before the deadline and breached after it", () => {
    expect(bucketFor(new Date(FUTURE), NOW)).toBe("within");
    expect(bucketFor(new Date(PAST), NOW)).toBe("breached");
  });

  it("calls a missing deadline pending, never breached", () => {
    // Nobody recorded a deadline; that is our gap, not the engineer missing one.
    expect(bucketFor(null, NOW)).toBe("pending");
  });
});

describe("collapseToCalls", () => {
  it("counts a call waiting on three parts once", () => {
    const rows = [
      row({ "Ticket ID": "WO-035640797", TAT: FUTURE, "Good Part No": "A" }),
      row({ "Ticket ID": "WO-035640797", TAT: FUTURE, "Good Part No": "B" }),
      row({ "Ticket ID": "WO-035640797", TAT: FUTURE, "Good Part No": "C" }),
    ];
    expect(collapseToCalls(rows).size).toBe(1);
  });

  it("keeps a real deadline over a part row that carries none", () => {
    const rows = [
      row({ "Ticket ID": "WO-1", TAT: "Manual Entry Required" }),
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
    ];
    const call = collapseToCalls(rows).get(ticketKey("WO-1"));
    expect(call?.tat?.toISOString()).toBe(new Date(FUTURE).toISOString());
  });

  it("keeps the EARLIEST deadline when two part rows disagree", () => {
    // The answer must not depend on the order the parts happened to be ordered in.
    const early = "2026-08-27T10:00:00.000Z";
    const late = "2026-09-02T10:00:00.000Z";
    const forwards = collapseToCalls([
      row({ "Ticket ID": "WO-1", TAT: early }),
      row({ "Ticket ID": "WO-1", TAT: late }),
    ]);
    const backwards = collapseToCalls([
      row({ "Ticket ID": "WO-1", TAT: late }),
      row({ "Ticket ID": "WO-1", TAT: early }),
    ]);
    expect(forwards.get(ticketKey("WO-1"))?.tat?.toISOString()).toBe(new Date(early).toISOString());
    expect(backwards.get(ticketKey("WO-1"))?.tat?.toISOString()).toBe(new Date(early).toISOString());
  });

  it("skips rows with no ticket rather than piling them into one phantom call", () => {
    const rows = [row({ "Ticket ID": "", TAT: FUTURE }), row({ TAT: FUTURE })];
    expect(collapseToCalls(rows).size).toBe(0);
  });
});

describe("calculateSlaMetrics", () => {
  it("counts three part rows of one call as one call, not three", () => {
    const rows = [
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
    ];
    const m = calculateSlaMetrics(rows, NOW);
    expect(m.total).toBe(1);
    expect(m.withinSla).toBe(1);
    expect(m.withinSlaTickets).toEqual(["WO-1"]);
  });

  it("does not let a multi-part call out-vote a single-part one in the percentage", () => {
    // Two calls, one of them three-part and breached. Row counting reported 25%; the truth
    // is one of two calls kept, which is 50%.
    const rows = [
      row({ "Ticket ID": "WO-BREACH", TAT: PAST }),
      row({ "Ticket ID": "WO-BREACH", TAT: PAST }),
      row({ "Ticket ID": "WO-BREACH", TAT: PAST }),
      row({ "Ticket ID": "WO-OK", TAT: FUTURE }),
    ];
    const m = calculateSlaMetrics(rows, NOW);
    expect(m.total).toBe(2);
    expect(m.breached).toBe(1);
    expect(m.withinSla).toBe(1);
    expect(m.adherence).toBe(50);
  });

  it("adds up: within + breached + pending is the total", () => {
    const rows = [
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
      row({ "Ticket ID": "WO-2", TAT: PAST }),
      row({ "Ticket ID": "WO-3", TAT: "Manual Entry Required" }),
      row({ "Ticket ID": "WO-3", TAT: "" }),
    ];
    const m = calculateSlaMetrics(rows, NOW);
    expect(m.withinSla + m.breached + m.pending).toBe(m.total);
    expect(m.total).toBe(3);
    expect(m.pending).toBe(1);
  });

  it("lists each ticket once in the drill-down behind a number", () => {
    const rows = [
      row({ "Ticket ID": "WO-1", TAT: PAST }),
      row({ "Ticket ID": "WO-1", TAT: PAST }),
    ];
    expect(calculateSlaMetrics(rows, NOW).breachedSlaTickets).toEqual(["WO-1"]);
  });

  it("keeps pending out of the adherence denominator", () => {
    const rows = [
      row({ "Ticket ID": "WO-1", TAT: FUTURE }),
      row({ "Ticket ID": "WO-2", TAT: "Manual Entry Required" }),
    ];
    expect(calculateSlaMetrics(rows, NOW).adherence).toBe(100);
  });

  it("reports 100% rather than 0% when there is nothing judgeable", () => {
    expect(calculateSlaMetrics([], NOW).adherence).toBe(100);
    expect(calculateSlaMetrics([row({ "Ticket ID": "WO-1" })], NOW).adherence).toBe(100);
  });

  it("treats the same call written two ways as one call", () => {
    const rows = [
      row({ "Ticket ID": "WO-035640797", TAT: FUTURE }),
      row({ "Ticket ID": "wo035640797", TAT: FUTURE }),
    ];
    expect(calculateSlaMetrics(rows, NOW).total).toBe(1);
  });
});

describe("calculateFieldezSlaMetrics", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  const sla = (slaEndTime: string | null, slaStatus = "") => ({ slaEndTime, slaStatus });

  it("judges by the deadline, not by a status read fifteen minutes ago", () => {
    // The worker refreshes every fifteen minutes, so a call that crossed its deadline in
    // between still carries "Within SLA". Reading the status would call a live breach fine.
    const rows = [row({ "Ticket ID": "WO-1" })];
    const map = new Map([[ticketKey("WO-1"), sla("2026-08-25T12:00:00.000Z", "Within SLA")]]);
    expect(calculateFieldezSlaMetrics(rows, map, now).breached).toBe(1);
  });

  it("keeps calls FieldEZ makes no promise about out of the percentage", () => {
    // Counting them as kept promises would flatter every number on the page.
    const rows = [row({ "Ticket ID": "WO-1" }), row({ "Ticket ID": "WO-2" })];
    const map = new Map([
      [ticketKey("WO-1"), sla("2026-08-31T12:00:00.000Z", "Within SLA")],
      [ticketKey("WO-2"), sla(null, "")],
    ]);
    const m = calculateFieldezSlaMetrics(rows, map, now);
    expect(m.within).toBe(1);
    expect(m.noSla).toBe(1);
    expect(m.adherence).toBe(100);
    expect(m.total).toBe(2);
  });

  it("counts a call waiting on three parts once", () => {
    const rows = [
      row({ "Ticket ID": "WO-1" }),
      row({ "Ticket ID": "WO-1" }),
      row({ "Ticket ID": "WO-1" }),
    ];
    const map = new Map([[ticketKey("WO-1"), sla("2026-08-31T12:00:00.000Z")]]);
    expect(calculateFieldezSlaMetrics(rows, map, now).total).toBe(1);
  });

  it("flags the ones about to breach as a subset of the ones still within", () => {
    const rows = [row({ "Ticket ID": "WO-1" }), row({ "Ticket ID": "WO-2" })];
    const map = new Map([
      [ticketKey("WO-1"), sla("2026-08-26T14:00:00.000Z")], // 2h away
      [ticketKey("WO-2"), sla("2026-08-31T12:00:00.000Z")], // days away
    ]);
    const m = calculateFieldezSlaMetrics(rows, map, now);
    expect(m.within).toBe(2);
    expect(m.soon).toBe(1);
    expect(m.soonTickets).toEqual(["WO-1"]);
  });

  it("does not invent an SLA for a call FieldEZ has not been asked about yet", () => {
    const rows = [row({ "Ticket ID": "WO-NEW" })];
    const m = calculateFieldezSlaMetrics(rows, new Map(), now);
    expect(m.noSla).toBe(1);
    expect(m.within).toBe(0);
    expect(m.breached).toBe(0);
  });

  it("falls back to FieldEZ's words when it gave no usable deadline", () => {
    const rows = [row({ "Ticket ID": "WO-1" }), row({ "Ticket ID": "WO-2" })];
    const map = new Map([
      [ticketKey("WO-1"), sla(null, "SLA Breached")],
      [ticketKey("WO-2"), sla("not a date", "Within SLA")],
    ]);
    const m = calculateFieldezSlaMetrics(rows, map, now);
    expect(m.breached).toBe(1);
    expect(m.within).toBe(1);
  });

  it("adds up: within + breached + no SLA is the total", () => {
    const rows = [
      row({ "Ticket ID": "WO-1" }),
      row({ "Ticket ID": "WO-2" }),
      row({ "Ticket ID": "WO-3" }),
    ];
    const map = new Map([
      [ticketKey("WO-1"), sla("2026-08-31T12:00:00.000Z")],
      [ticketKey("WO-2"), sla("2026-08-20T12:00:00.000Z")],
    ]);
    const m = calculateFieldezSlaMetrics(rows, map, now);
    expect(m.within + m.breached + m.noSla).toBe(m.total);
  });
});
