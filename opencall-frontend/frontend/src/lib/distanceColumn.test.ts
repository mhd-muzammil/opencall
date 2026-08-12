import { describe, expect, it } from "vitest";
import {
  DISTANCE_COLUMN,
  reportHasDistanceValues,
  withDistanceAvailability,
} from "./distanceColumn";

function row(distance?: string) {
  return {
    output: {
      "Ticket ID": "WO-1",
      ...(distance === undefined ? {} : { [DISTANCE_COLUMN]: distance }),
    },
  };
}

describe("reportHasDistanceValues", () => {
  // A Salem / Vellore / Kanchipuram / Hosur report: their branch offices have no
  // coordinates seeded, so resolveOfficeDistance returns null for every row.
  it("is false when no row carries a distance", () => {
    expect(reportHasDistanceValues([row(), row(), row()])).toBe(false);
    expect(reportHasDistanceValues([row(""), row("   ")])).toBe(false);
  });

  it("is false for an empty or missing report", () => {
    expect(reportHasDistanceValues([])).toBe(false);
    expect(reportHasDistanceValues(null)).toBe(false);
    expect(reportHasDistanceValues(undefined)).toBe(false);
  });

  // Chennai. One value is enough: a pincode with no usable centroid still leaves
  // its own row blank, and that must not hide the column for everyone else.
  it("is true when any row carries a distance", () => {
    expect(reportHasDistanceValues([row(), row("12.4 km · NE"), row()])).toBe(true);
  });

  // Straight-line fallbacks render with a leading tilde so they are never
  // mistaken for a routed measurement — still a value.
  it("counts an estimated distance", () => {
    expect(reportHasDistanceValues([row("~8.0 km · W")])).toBe(true);
  });
});

describe("withDistanceAvailability", () => {
  const columns = ["S.no", "Ticket ID", "Location", DISTANCE_COLUMN];

  it("drops Distance when the report has none", () => {
    expect(withDistanceAvailability(columns, false)).toEqual([
      "S.no",
      "Ticket ID",
      "Location",
    ]);
  });

  it("keeps Distance when the report has it", () => {
    expect(withDistanceAvailability(columns, true)).toEqual(columns);
  });

  // The trap this guards: a layout saved in Chennai carries "Distance", and
  // reusing it against a Salem report would reintroduce a column of blanks.
  it("applies to a saved layout too, not just the default order", () => {
    const savedLayout = ["Ticket ID", DISTANCE_COLUMN, "Engineer"];
    expect(withDistanceAvailability(savedLayout, false)).toEqual([
      "Ticket ID",
      "Engineer",
    ]);
  });

  it("leaves a list without Distance untouched", () => {
    expect(withDistanceAvailability(["S.no", "Engineer"], false)).toEqual([
      "S.no",
      "Engineer",
    ]);
  });
});
