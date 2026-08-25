import { describe, expect, it } from "vitest";
import {
  billCycleFor,
  billCycleForKey,
  prevMonthKey,
} from "./ClosedCallsDashboardView";
import { billCyclesBetween } from "../utils/billCycle";

// The bill cycle runs the 25th of one month to the 24th of the next and is named after
// the month it ENDS in — the month it is invoiced as. The Closed Calls cycle picker
// generates arbitrary past cycles from these helpers, so the boundaries are locked here.
describe("billCycleFor", () => {
  it("puts a day before the 25th in the cycle that ends this month", () => {
    const cycle = billCycleFor("2026-08-04");
    expect(cycle.fromIso).toBe("2026-07-25");
    expect(cycle.toIso).toBe("2026-08-24");
    expect(cycle.key).toBe("2026-08");
    expect(cycle.monthLabel).toBe("Aug 2026");
    expect(cycle.label).toBe("25 Jul – 24 Aug");
  });

  it("rolls to the next cycle on the 25th", () => {
    expect(billCycleFor("2026-08-24").toIso).toBe("2026-08-24");
    expect(billCycleFor("2026-08-25").fromIso).toBe("2026-08-25");
    expect(billCycleFor("2026-08-25").toIso).toBe("2026-09-24");
    expect(billCycleFor("2026-08-25").key).toBe("2026-09");
  });

  it("crosses the year boundary both ways", () => {
    const january = billCycleFor("2026-01-10");
    expect(january.fromIso).toBe("2025-12-25");
    expect(january.toIso).toBe("2026-01-24");
    expect(january.key).toBe("2026-01");

    const december = billCycleFor("2025-12-31");
    expect(december.fromIso).toBe("2025-12-25");
    expect(december.toIso).toBe("2026-01-24");
  });

  it("handles February, whose cycle still ends on the 24th", () => {
    const cycle = billCycleFor("2026-02-01");
    expect(cycle.fromIso).toBe("2026-01-25");
    expect(cycle.toIso).toBe("2026-02-24");
  });
});

describe("billCycleForKey", () => {
  it("round-trips a cycle key", () => {
    for (const key of ["2025-12", "2026-01", "2026-08"]) {
      expect(billCycleForKey(key).key).toBe(key);
    }
  });

  it("names the cycle by its end month, not its start month", () => {
    const cycle = billCycleForKey("2026-07");
    expect(cycle.fromIso).toBe("2026-06-25");
    expect(cycle.toIso).toBe("2026-07-24");
  });
});

describe("prevMonthKey", () => {
  it("steps back a month, across January", () => {
    expect(prevMonthKey("2026-08")).toBe("2026-07");
    expect(prevMonthKey("2026-01")).toBe("2025-12");
  });

  it("walks a contiguous run of cycles with no gaps or repeats", () => {
    const keys: string[] = [];
    let key = "2026-08";
    for (let i = 0; i < 14; i += 1) {
      keys.push(key);
      key = prevMonthKey(key);
    }
    expect(new Set(keys).size).toBe(14);
    expect(keys[13]).toBe("2025-07");
    // Every generated key must still resolve to a cycle that ends in that month.
    for (const k of keys) expect(billCycleForKey(k).toIso.slice(0, 7)).toBe(k);
  });
});

// The Engineer Productivity cycle picker is generated from this, and each option
// is turned straight into the day range the productivity range endpoint reads —
// so an off-by-one here is a month of numbers attributed to the wrong cycle.
describe("billCyclesBetween", () => {
  it("lists every cycle from the latest back to the earliest, newest first", () => {
    const cycles = billCyclesBetween("2026-05-30", "2026-08-04");

    // 30 May is in the Jun cycle; 4 Aug is in the Aug cycle.
    expect(cycles.map((c) => c.key)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(cycles[0]?.fromIso).toBe("2026-07-25");
    expect(cycles[0]?.toIso).toBe("2026-08-24");
    expect(cycles[2]?.fromIso).toBe("2026-05-25");
    expect(cycles[2]?.toIso).toBe("2026-06-24");
  });

  it("returns exactly one cycle when both ends sit in the same one", () => {
    const cycles = billCyclesBetween("2026-07-26", "2026-08-04");
    expect(cycles.map((c) => c.key)).toEqual(["2026-08"]);
  });

  it("never runs past the limit, however old the earliest date is", () => {
    const cycles = billCyclesBetween("2019-01-01", "2026-08-04", 6);
    expect(cycles).toHaveLength(6);
    expect(cycles[0]?.key).toBe("2026-08");
    expect(cycles[5]?.key).toBe("2026-03");
  });

  it("covers each listed cycle's days exactly once, end to end", () => {
    const cycles = billCyclesBetween("2026-05-30", "2026-08-04");
    // Each cycle must start the day after the previous one ends, so a run of
    // cycles tiles the calendar with no gap and no overlap.
    for (let i = 0; i < cycles.length - 1; i += 1) {
      const older = cycles[i + 1]!;
      const newer = cycles[i]!;
      const dayAfterOlder = new Date(Date.parse(`${older.toIso}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(newer.fromIso).toBe(dayAfterOlder);
    }
  });
});
