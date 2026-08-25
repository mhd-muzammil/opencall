import { describe, expect, it } from "vitest";
import {
  bandForPercent,
  buildLocationComparison,
  formatPercent,
  ratioPercent,
} from "./productivityAnalytics";

function engineer(
  regionName: string,
  assigned: number,
  attended: number,
  closed: number,
) {
  return { regionName, assigned, attended, closed };
}

describe("ratioPercent", () => {
  it("returns a percentage to one decimal", () => {
    expect(ratioPercent(16, 19)).toBe(84.2);
    expect(ratioPercent(70, 100)).toBe(70);
  });

  it("returns null when there is nothing to divide by", () => {
    // Not 0: a region with no assigned calls has no conversion RATE, and 0%
    // would rank it as the worst performer instead of as absent.
    expect(ratioPercent(0, 0)).toBeNull();
    expect(ratioPercent(5, 0)).toBeNull();
    expect(ratioPercent(5, -1)).toBeNull();
  });

  it("survives a non-finite input", () => {
    expect(ratioPercent(Number.NaN, 10)).toBeNull();
    expect(ratioPercent(10, Number.NaN)).toBeNull();
  });
});

describe("bandForPercent", () => {
  it("uses the spreadsheet's boundaries inclusively", () => {
    expect(bandForPercent(90)).toBe("green");
    expect(bandForPercent(89.9)).toBe("amber");
    expect(bandForPercent(70)).toBe("amber");
    expect(bandForPercent(69.9)).toBe("orange");
    expect(bandForPercent(50)).toBe("orange");
    expect(bandForPercent(49.9)).toBe("red");
    expect(bandForPercent(0)).toBe("red");
  });

  it("has no band when there is no rate", () => {
    expect(bandForPercent(null)).toBeNull();
  });

  it("bands a rate above 100% as green", () => {
    // Attended can exceed Assigned on a same-day closure that was never booked.
    expect(bandForPercent(112.5)).toBe("green");
  });
});

describe("buildLocationComparison", () => {
  // The team's own sheet for 05-08-2026, Salem and Vellore.
  const list = [
    engineer("SALEM", 6, 6, 3),
    engineer("SALEM", 5, 4, 3),
    engineer("SALEM", 5, 4, 4),
    engineer("SALEM", 3, 2, 2),
    engineer("VELLORE", 6, 4, 2),
    engineer("VELLORE", 6, 3, 3),
  ];

  it("groups engineers into their regions", () => {
    const { rows } = buildLocationComparison(list);
    expect(rows.map((r) => r.regionName)).toEqual(["SALEM", "VELLORE"]);
    expect(rows[0]).toMatchObject({
      engineers: 4,
      assigned: 19,
      attended: 16,
      closed: 12,
    });
  });

  it("computes both conversion ratios per region", () => {
    const { rows } = buildLocationComparison(list);
    // Salem: 16/19 attended, 12/16 closed — matches the spreadsheet exactly.
    expect(rows[0]?.assignedVsAttendedPercent).toBe(84.2);
    expect(rows[0]?.attendedVsClosedPercent).toBe(75);
    // Vellore: 7/12 attended, 5/7 closed.
    expect(rows[1]?.assignedVsAttendedPercent).toBe(58.3);
    expect(rows[1]?.attendedVsClosedPercent).toBe(71.4);
  });

  it("ranks the strongest attendance conversion first", () => {
    const { rows } = buildLocationComparison([
      engineer("WEAK", 10, 2, 1),
      engineer("STRONG", 10, 9, 5),
      engineer("MIDDLE", 10, 6, 3),
    ]);
    expect(rows.map((r) => r.regionName)).toEqual(["STRONG", "MIDDLE", "WEAK"]);
  });

  it("sorts regions with no rate last, whatever their raw counts", () => {
    const { rows } = buildLocationComparison([
      engineer("NO-PLAN", 0, 0, 0),
      engineer("BOOKED", 4, 1, 1),
    ]);
    expect(rows.map((r) => r.regionName)).toEqual(["BOOKED", "NO-PLAN"]);
    expect(rows[1]?.assignedVsAttendedPercent).toBeNull();
  });

  it("totals from the pooled counts, not by averaging the regions", () => {
    // A region with 2 calls must not weigh the same as one with 50. Averaging
    // the two rates would give 75%; the true pooled rate is 51/52.
    const { total } = buildLocationComparison([
      engineer("BIG", 50, 50, 25),
      engineer("SMALL", 2, 1, 0),
    ]);
    expect(total.assigned).toBe(52);
    expect(total.attended).toBe(51);
    expect(total.assignedVsAttendedPercent).toBe(98.1);
    expect(total.regionName).toBe("ALL LOCATIONS");
    expect(total.engineers).toBe(2);
  });

  it("falls back to the ASP code, then a placeholder, for an unnamed region", () => {
    const { rows } = buildLocationComparison([
      { regionCode: "ASPS01461", assigned: 1, attended: 1, closed: 1 },
      { assigned: 1, attended: 1, closed: 0 },
    ]);
    expect(rows.map((r) => r.regionName).sort()).toEqual([
      "ASPS01461",
      "Unknown Region",
    ]);
  });

  it("handles an empty list", () => {
    const { rows, total } = buildLocationComparison([]);
    expect(rows).toEqual([]);
    expect(total.assigned).toBe(0);
    expect(total.assignedVsAttendedPercent).toBeNull();
  });
});

describe("formatPercent", () => {
  it("shows one decimal", () => {
    expect(formatPercent(84.2)).toBe("84.2%");
    expect(formatPercent(70)).toBe("70.0%");
  });

  it("shows an em dash when there is no rate", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

// The number that separates "this region did no work" from "this region does not
// book its work as Scheduled". Vellore read 5 assigned in a bill cycle and looked
// broken; Kanchipuram booked nothing and vanished from the table entirely, which
// is worse — an absent row asks no questions.
describe("buildLocationComparison with call counts", () => {
  it("attaches the count to a region that has engineers", () => {
    const { rows, total } = buildLocationComparison(
      [engineer("SALEM", 6, 6, 3)],
      new Map([["SALEM", 400]]),
    );
    expect(rows[0]).toMatchObject({ regionName: "SALEM", assigned: 6, callsInPeriod: 400 });
    expect(total.callsInPeriod).toBe(400);
  });

  it("gives a region that booked nothing a row instead of dropping it", () => {
    const { rows } = buildLocationComparison(
      [engineer("SALEM", 6, 6, 3)],
      new Map([["SALEM", 400], ["KANCHIPURAM", 6047]]),
    );
    const kanchipuram = rows.find((r) => r.regionName === "KANCHIPURAM");
    expect(kanchipuram).toBeDefined();
    expect(kanchipuram).toMatchObject({
      engineers: 0,
      assigned: 0,
      callsInPeriod: 6047,
      // No booked calls means no rate to compare, not a 0% one.
      assignedVsAttendedPercent: null,
    });
  });

  it("matches an existing region case-insensitively rather than duplicating it", () => {
    const { rows } = buildLocationComparison(
      [engineer("VELLORE", 5, 0, 0)],
      new Map([["Vellore", 6840]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ regionName: "VELLORE", assigned: 5, callsInPeriod: 6840 });
  });

  it("leaves the count at zero when none is supplied", () => {
    const { rows } = buildLocationComparison([engineer("SALEM", 6, 6, 3)]);
    expect(rows[0]?.callsInPeriod).toBe(0);
  });
});
