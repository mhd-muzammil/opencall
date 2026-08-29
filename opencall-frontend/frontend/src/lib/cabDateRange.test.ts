import { describe, expect, it } from "vitest";
import {
  defaultCabRange,
  monthsBefore,
  normalizeCabRange,
  toIsoDay,
} from "./cabDateRange";

describe("toIsoDay", () => {
  it("reads the day the reader is living in, not the UTC one", () => {
    // Half past midnight in IST is still the previous day in UTC. `toISOString()` would hand
    // over yesterday's date to anybody looking before 05:30.
    const earlyMorningIst = new Date(2026, 7, 27, 0, 30);
    expect(toIsoDay(earlyMorningIst)).toBe("2026-08-27");
  });

  it("pads single-digit months and days", () => {
    expect(toIsoDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("monthsBefore", () => {
  it("goes back the same day of the month", () => {
    expect(toIsoDay(monthsBefore(new Date(2026, 7, 27), 2))).toBe("2026-06-27");
  });

  it("lands on the last day when the target month is too short", () => {
    // `setMonth` alone gives 3 March for "one month before 31 March", because February has
    // no 31st and the surplus spills forward. A range that starts three days late is wrong
    // in a way nobody notices until a total is questioned.
    expect(toIsoDay(monthsBefore(new Date(2026, 2, 31), 1))).toBe("2026-02-28");
    expect(toIsoDay(monthsBefore(new Date(2026, 4, 31), 1))).toBe("2026-04-30");
  });

  it("handles a leap February", () => {
    expect(toIsoDay(monthsBefore(new Date(2028, 2, 31), 1))).toBe("2028-02-29");
  });

  it("crosses the year boundary", () => {
    expect(toIsoDay(monthsBefore(new Date(2026, 0, 15), 2))).toBe("2025-11-15");
  });
});

describe("defaultCabRange", () => {
  it("opens on the last three months, ending today", () => {
    // Must match how far back the backfill has fetched. A wider window than exists reads as
    // "there was no mail" for the months nobody has pulled in.
    const range = defaultCabRange(new Date(2026, 7, 27));
    expect(range).toEqual({ from: "2026-05-27", to: "2026-08-27" });
  });

  it("is a range the server would accept", () => {
    expect(normalizeCabRange(...Object.values(defaultCabRange(new Date(2026, 7, 27))) as [string, string])).not
      .toBeNull();
  });
});

describe("normalizeCabRange", () => {
  it("passes a well-formed range through", () => {
    expect(normalizeCabRange("2026-06-27", "2026-08-27")).toEqual({
      from: "2026-06-27",
      to: "2026-08-27",
    });
  });

  it("accepts a single day", () => {
    expect(normalizeCabRange("2026-08-27", "2026-08-27")).toEqual({
      from: "2026-08-27",
      to: "2026-08-27",
    });
  });

  it("refuses a backwards range rather than quietly swapping it", () => {
    // Swapping would show a reader a period they never chose and would not notice choosing.
    expect(normalizeCabRange("2026-08-27", "2026-06-27")).toBeNull();
  });

  it("refuses anything that is not a date", () => {
    expect(normalizeCabRange("", "2026-08-27")).toBeNull();
    expect(normalizeCabRange("2026-08-27", "")).toBeNull();
    expect(normalizeCabRange("27-08-2026", "2026-08-27")).toBeNull();
    expect(normalizeCabRange("yesterday", "today")).toBeNull();
  });
});
