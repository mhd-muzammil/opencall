// The Closed Calls period is the spine of that page: the source blocks, the region cards,
// the ledger and the sidebar badge all count through it. These lock the rules so a
// refactor cannot quietly change which rows a period admits.
import { describe, expect, it } from "vitest";
import type { ReportRow } from "../types";
import { billCycleFor } from "./billCycle";
import {
  caseClosedIsoOf,
  closedCountForPeriod,
  formatDateKey,
  formatRangeLabel,
  makeRowInPeriod,
  normalizePeriodBounds,
  periodPresetOf,
} from "./closedCallsPeriod";

function row(input: {
  closedDate?: string;
  sameDay?: boolean;
  asp?: string;
}): ReportRow {
  return {
    output: {
      "Ticket ID": "WO-1",
      "Work Location": input.asp ?? "ASPS01461",
      ...(input.closedDate ? { "Case Closed Date": input.closedDate } : {}),
    },
    carryForward: {
      closedSyntheticRow: true,
      sameDayClosedRow: input.sameDay === true,
    },
  } as unknown as ReportRow;
}

describe("caseClosedIsoOf", () => {
  it("reads the DD-MM-YYYY the closure import writes", () => {
    expect(caseClosedIsoOf({ "Case Closed Date": "25-07-2026" })).toBe("2026-07-25");
  });

  it("is null for a blank or unparseable value, never a guess", () => {
    expect(caseClosedIsoOf({})).toBeNull();
    expect(caseClosedIsoOf({ "Case Closed Date": "" })).toBeNull();
    expect(caseClosedIsoOf({ "Case Closed Date": "2026-07-25" })).toBeNull();
  });
});

describe("periodPresetOf", () => {
  const cycle = billCycleFor("2026-08-10"); // 25 Jul – 24 Aug 2026

  it("calls unbounded dates 'all'", () => {
    expect(periodPresetOf("", "", cycle, "2026-09-09")).toBe("all");
  });

  it("calls today's single day 'today'", () => {
    expect(periodPresetOf("2026-09-09", "2026-09-09", cycle, "2026-09-09")).toBe("today");
  });

  it("recognises the bill cycle's own bounds", () => {
    expect(periodPresetOf(cycle.fromIso, cycle.toIso, cycle, "2026-09-09")).toBe("cycle");
  });

  it("calls anything else custom", () => {
    expect(periodPresetOf("2026-08-01", "2026-08-05", cycle, "2026-09-09")).toBe("custom");
  });
});

describe("makeRowInPeriod", () => {
  it("uses the REPORT-DAY rule for today, not a date comparison", () => {
    // A closure Flex reported late carries a back-dated Case Closed Date. It still closed
    // on this report, so comparing dates would drop it from the headline it belongs to.
    const inPeriod = makeRowInPeriod("today", "2026-09-09", "2026-09-09");
    expect(inPeriod(row({ sameDay: true, closedDate: "05-09-2026" }))).toBe(true);
    expect(inPeriod(row({ sameDay: false, closedDate: "09-09-2026" }))).toBe(false);
  });

  it("goes by Case Closed Date for a cycle or a custom range", () => {
    const inPeriod = makeRowInPeriod("cycle", "2026-07-25", "2026-08-24");
    expect(inPeriod(row({ closedDate: "25-07-2026" }))).toBe(true);
    expect(inPeriod(row({ closedDate: "24-08-2026" }))).toBe(true);
    expect(inPeriod(row({ closedDate: "24-07-2026" }))).toBe(false);
    expect(inPeriod(row({ closedDate: "25-08-2026" }))).toBe(false);
  });

  it("excludes a row with no Case Closed Date rather than guessing one", () => {
    const inPeriod = makeRowInPeriod("custom", "2026-08-01", "2026-08-31");
    expect(inPeriod(row({ sameDay: true }))).toBe(false);
  });

  it("admits everything when the range is unbounded", () => {
    const inPeriod = makeRowInPeriod("all", "", "");
    expect(inPeriod(row({}))).toBe(true);
  });
});

describe("closedCountForPeriod", () => {
  const rows = [
    row({ closedDate: "25-07-2026" }),
    row({ closedDate: "01-08-2026" }),
    row({ closedDate: "25-08-2026" }),
  ];

  it("answers 'all dates' with the ledger total, not the row count", () => {
    // The ledger total is the backend's own figure and is what the rollup card shows;
    // counting rows here would let the badge and the card disagree.
    expect(
      closedCountForPeriod({
        rows,
        preset: "all",
        rowInPeriod: makeRowInPeriod("all", "", ""),
        allTimeCount: 3411,
      }),
    ).toBe(3411);
  });

  it("counts the rows the predicate admits for every other period", () => {
    expect(
      closedCountForPeriod({
        rows,
        preset: "cycle",
        rowInPeriod: makeRowInPeriod("cycle", "2026-07-25", "2026-08-24"),
        allTimeCount: 3411,
      }),
    ).toBe(2);
  });
});

describe("normalizePeriodBounds", () => {
  it("swaps a reversed range so the order the dates were picked in never matters", () => {
    expect(normalizePeriodBounds("2026-08-24", "2026-07-25")).toEqual([
      "2026-07-25",
      "2026-08-24",
    ]);
  });

  it("leaves a half-open range alone — a blank end means unbounded", () => {
    expect(normalizePeriodBounds("2026-08-01", "")).toEqual(["2026-08-01", ""]);
    expect(normalizePeriodBounds("", "2026-08-01")).toEqual(["", "2026-08-01"]);
  });
});

describe("labels", () => {
  it("formats an ISO day the way the ledger shows it", () => {
    expect(formatDateKey("2026-06-05")).toBe("05-06-2026");
    expect(formatDateKey("")).toBe("");
  });

  it("names every shape of range", () => {
    const fmt = formatDateKey;
    expect(formatRangeLabel("", "", fmt, "all dates")).toBe("all dates");
    expect(formatRangeLabel("2026-08-01", "2026-08-01", fmt, "all dates")).toBe(
      "01-08-2026",
    );
    expect(formatRangeLabel("2026-08-01", "2026-08-31", fmt, "all dates")).toBe(
      "01-08-2026 → 31-08-2026",
    );
    expect(formatRangeLabel("2026-08-01", "", fmt, "all dates")).toBe(
      "01-08-2026 onwards",
    );
    expect(formatRangeLabel("", "2026-08-31", fmt, "all dates")).toBe("up to 31-08-2026");
  });
});
