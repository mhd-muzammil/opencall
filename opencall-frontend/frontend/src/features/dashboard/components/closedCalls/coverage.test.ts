// The coverage tags are the whole argument of the redesign: three closed counts that do
// not match are only readable if each one says what it can actually answer for. These lock
// the tags to the live response rather than to a hard-coded string.
import { describe, expect, it } from "vitest";
import { fieldezCoverage, oursCoverage, rawCoverage } from "./coverage";

describe("oursCoverage", () => {
  it("says today is the report-day rule, not a date filter", () => {
    expect(oursCoverage("today")).toEqual({
      label: "report day",
      tone: "plain",
      note: "same-day closed rows",
    });
  });

  it("warns that all-dates is the ever-growing ledger", () => {
    // The closed ledger is never pruned — a closed ticket is re-stamped into every later
    // report — so "all time" is a different kind of number from the others.
    expect(oursCoverage("all").label).toBe("all time");
    expect(oursCoverage("all").note).toContain("never pruned");
  });

  it("is day-precise for a cycle or a custom range", () => {
    expect(oursCoverage("cycle").label).toBe("day-precise");
    expect(oursCoverage("custom").label).toBe("day-precise");
  });
});

describe("fieldezCoverage", () => {
  it("answers any range day-precisely — the summary filters on closed_on", () => {
    expect(fieldezCoverage("today").label).toBe("day-precise");
    expect(fieldezCoverage("custom").label).toBe("day-precise");
  });

  it("is the all-dates rollup when there is no range", () => {
    expect(fieldezCoverage("all").label).toBe("all dates summary");
  });
});

describe("rawCoverage", () => {
  it("is only day-precise when the BACKEND confirmed it", () => {
    // An older backend answers month-level. Treating that as day-filtered would show a
    // whole month's closures as one day's.
    expect(
      rawCoverage({
        preset: "custom",
        dayPrecise: true,
        monthLo: "2026-08",
        monthHi: "2026-08",
      }),
    ).toEqual({
      label: "day-precise",
      tone: "plain",
      note: "WO Closed date in range",
    });
  });

  it("falls back to an amber month-level tag naming the months it really covers", () => {
    const coverage = rawCoverage({
      preset: "today",
      dayPrecise: false,
      monthLo: "2026-09",
      monthHi: "2026-09",
    });
    expect(coverage.tone).toBe("warn");
    expect(coverage.label).toBe("month-level");
    expect(coverage.note).toBe("whole of Sep 2026 — raw data is not day-precise");
  });

  it("spells out a multi-month fallback", () => {
    expect(
      rawCoverage({
        preset: "custom",
        dayPrecise: false,
        monthLo: "2026-07",
        monthHi: "2026-08",
      }).note,
    ).toBe("whole of Jul 2026 → Aug 2026 — raw data is not day-precise");
  });

  it("is all months when there is no range at all", () => {
    expect(
      rawCoverage({ preset: "all", dayPrecise: false, monthLo: "", monthHi: "" }),
    ).toEqual({ label: "all months", tone: "plain", note: "" });
  });
});
