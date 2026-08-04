import { describe, expect, it } from "vitest";
import {
  billCycleFor,
  billCycleForKey,
  prevMonthKey,
} from "./ClosedCallsDashboardView";

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
