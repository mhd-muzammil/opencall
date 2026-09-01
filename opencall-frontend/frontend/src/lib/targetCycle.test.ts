import { describe, expect, it } from "vitest";
import {
  currentTargetCycle,
  cycleEndingIn,
  cycleLabel,
  recentTargetCycles,
} from "./targetCycle";

/**
 * Engineer targets are counted over a 24th-to-25th cycle, not a calendar month. The tab used
 * to open on "1st of this month to today", which on the 1st is a single day and reads as
 * everybody having closed almost nothing.
 */

describe("cycleEndingIn", () => {
  it("starts on the 24th of the month before it ends", () => {
    // September is index 8.
    expect(cycleEndingIn(2026, 8)).toEqual({ from: "2026-08-24", to: "2026-09-25" });
  });

  it("rolls the start back into the previous year for a January cycle", () => {
    expect(cycleEndingIn(2026, 0)).toEqual({ from: "2025-12-24", to: "2026-01-25" });
  });

  it("pads single-digit months and days", () => {
    expect(cycleEndingIn(2026, 2)).toEqual({ from: "2026-02-24", to: "2026-03-25" });
  });

  it("starts on the 24th even in February, which has one", () => {
    // The 24th exists in every month, which is why the cycle can use it without clamping.
    expect(cycleEndingIn(2026, 2).from).toBe("2026-02-24");
  });
});

describe("currentTargetCycle", () => {
  it("opens on the cycle running now, not the calendar month", () => {
    // 1 September sits inside the cycle that began 24 August.
    expect(currentTargetCycle("2026-09-01")).toEqual({ from: "2026-08-24", to: "2026-09-25" });
  });

  it("is the same cycle on the last day before it ends", () => {
    expect(currentTargetCycle("2026-09-25")).toEqual({ from: "2026-08-24", to: "2026-09-25" });
  });

  it("moves to the next cycle once the month turns", () => {
    expect(currentTargetCycle("2026-10-01")).toEqual({ from: "2026-09-24", to: "2026-10-25" });
  });

  it("crosses the year end", () => {
    expect(currentTargetCycle("2026-01-05")).toEqual({ from: "2025-12-24", to: "2026-01-25" });
  });

  it("ends in the future for most of the cycle, which is the point", () => {
    // The cycle has not finished. The table counts the report days that exist in the range,
    // so a `to` nobody has reached adds no days and changes no number.
    expect(currentTargetCycle("2026-09-01").to > "2026-09-01").toBe(true);
  });
});

describe("recentTargetCycles", () => {
  it("lists the current cycle first, then the ones before it", () => {
    expect(recentTargetCycles(3, "2026-09-01")).toEqual([
      { from: "2026-08-24", to: "2026-09-25" },
      { from: "2026-07-24", to: "2026-08-25" },
      { from: "2026-06-24", to: "2026-07-25" },
    ]);
  });

  it("walks back across the year boundary", () => {
    expect(recentTargetCycles(3, "2026-02-10")).toEqual([
      { from: "2026-01-24", to: "2026-02-25" },
      { from: "2025-12-24", to: "2026-01-25" },
      { from: "2025-11-24", to: "2025-12-25" },
    ]);
  });

  it("never returns an empty list", () => {
    expect(recentTargetCycles(0, "2026-09-01")).toHaveLength(1);
  });

  it("returns no two cycles the same", () => {
    const cycles = recentTargetCycles(6, "2026-09-01");
    expect(new Set(cycles.map((c) => c.to)).size).toBe(6);
  });
});

describe("cycleLabel", () => {
  it("reads as the period it is", () => {
    expect(cycleLabel({ from: "2026-08-24", to: "2026-09-25" })).toBe("24 Aug – 25 Sep");
  });

  it("adds the years only when the cycle crosses one", () => {
    // Otherwise the year is width spent on something both halves already agree about.
    expect(cycleLabel({ from: "2025-12-24", to: "2026-01-25" })).toBe("24 Dec 25 – 25 Jan 26");
  });
});
