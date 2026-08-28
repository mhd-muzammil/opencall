import { describe, expect, it } from "vitest";
import { closureOutcomeOf, rawOutcomeOf } from "./closureOutcome.js";

describe("closureOutcomeOf", () => {
  it("headlines completions and keeps cancellations apart", () => {
    expect(closureOutcomeOf({ count: 10, closed: 7, cancelled: 3 })).toEqual({
      closed: 7,
      cancelled: 3,
      hasSplit: true,
    });
  });

  it("reports a zero cancelled count as a real zero", () => {
    // Distinct from "the backend sent no split": hasSplit stays true, so the card
    // renders "0 cancelled" — the statement that makes the headline readable as
    // completions-only.
    const out = closureOutcomeOf({ count: 5, closed: 5, cancelled: 0 });
    expect(out).toEqual({ closed: 5, cancelled: 0, hasSplit: true });
  });

  it("falls back to the old total on a backend without the split", () => {
    // Pre-deploy: neither field is sent. The card keeps showing the number it always
    // showed (cancellation-inclusive) rather than blanking or reading zero.
    expect(closureOutcomeOf({ count: 12 })).toEqual({
      closed: 12,
      cancelled: 0,
      hasSplit: false,
    });
  });

  it("does not treat a closed count of 0 as a missing split", () => {
    // The regression this guards: `entry.closed || entry.count` would have shown 9
    // completions for a region whose closures were ALL cancellations.
    expect(closureOutcomeOf({ count: 9, closed: 0, cancelled: 9 })).toEqual({
      closed: 0,
      cancelled: 9,
      hasSplit: true,
    });
  });

  it("returns null for a region the summary has no entry for", () => {
    expect(closureOutcomeOf(null)).toBeNull();
    expect(closureOutcomeOf(undefined)).toBeNull();
  });
});

describe("rawOutcomeOf", () => {
  const rows = [
    { aspCode: "ASPS01461", closed: 40, cancelled: 5 },
    { aspCode: "ASPS01463", closed: 12, cancelled: 1 },
    { aspCode: "FCT CCO", closed: 3, cancelled: 0 },
  ];

  it("picks one region", () => {
    expect(rawOutcomeOf(rows, "ASPS01461")).toEqual({
      closed: 40,
      cancelled: 5,
      hasSplit: true,
    });
  });

  it("sums every row for the All Regions rollup, non-ASP locations included", () => {
    // 'FCT CCO' is not a region card, but it is part of the server's own total —
    // dropping it here would make the ALL card disagree with the API.
    expect(rawOutcomeOf(rows, "")).toEqual({
      closed: 55,
      cancelled: 6,
      hasSplit: true,
    });
  });

  it("is zero for an unknown region rather than throwing", () => {
    expect(rawOutcomeOf(rows, "ASPS99999")).toEqual({
      closed: 0,
      cancelled: 0,
      hasSplit: true,
    });
  });

  it("is zero when nothing has been imported", () => {
    expect(rawOutcomeOf([], "")).toEqual({ closed: 0, cancelled: 0, hasSplit: true });
  });
});
