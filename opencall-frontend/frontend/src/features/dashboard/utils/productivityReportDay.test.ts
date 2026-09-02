/**
 * The bug this pins, because it was invisible: the KM column showed a dash for
 * every engineer on a page whose own header read "Filter Applied: 02-09-2026".
 *
 * The date was read from `productivityFromDate`, which is bound only to the
 * custom-range inputs and is "" for every other filter -- including "Specific
 * Date", which is the default and what everybody actually uses. So the column
 * concluded "this is not a single day" on a view that was showing exactly one,
 * and said so with a dash that looked like "no tracking data".
 */
import { describe, expect, it } from "vitest";

import { productivityReportDay, SPECIFIC_DATE } from "./productivityReportDay";

describe("productivityReportDay", () => {
  it("reads the day from selectedValue, not the range inputs", () => {
    // Exactly the state the page is in by default: a specific date chosen, the
    // range inputs untouched.
    expect(
      productivityReportDay({
        filterType: SPECIFIC_DATE,
        selectedValue: "02-09-2026",
        fromDate: "",
        toDate: "",
      }),
    ).toBe("2026-09-02");
  });

  it("flips DD-MM-YYYY to ISO", () => {
    expect(
      productivityReportDay({ filterType: SPECIFIC_DATE, selectedValue: "31-12-2026" }),
    ).toBe("2026-12-31");
  });

  it("leaves a value already in ISO alone", () => {
    expect(
      productivityReportDay({ filterType: SPECIFIC_DATE, selectedValue: "2026-09-02" }),
    ).toBe("2026-09-02");
  });

  it("takes a custom range of one day", () => {
    expect(
      productivityReportDay({
        filterType: "Custom Range",
        selectedValue: "",
        fromDate: "2026-09-02",
        toDate: "2026-09-02",
      }),
    ).toBe("2026-09-02");
  });

  it("refuses a range wider than a day", () => {
    // Distance is per day. A month's kilometres beside a month's calls would be
    // a number that looks like it belongs to the row and does not.
    expect(
      productivityReportDay({
        filterType: "Custom Range",
        selectedValue: "",
        fromDate: "2026-08-24",
        toDate: "2026-09-25",
      }),
    ).toBeNull();
  });

  it("refuses a month", () => {
    expect(
      productivityReportDay({ filterType: "Specific Month", selectedValue: "09-2026" }),
    ).toBeNull();
  });

  it("refuses a bill cycle", () => {
    expect(
      productivityReportDay({ filterType: "Bill Cycle", selectedValue: "2026-09-25" }),
    ).toBeNull();
  });

  it("refuses a specific date that has not been chosen yet", () => {
    expect(
      productivityReportDay({ filterType: SPECIFIC_DATE, selectedValue: "" }),
    ).toBeNull();
  });

  it("handles the range inputs being undefined", () => {
    expect(productivityReportDay({ filterType: "Custom Range", selectedValue: "" })).toBeNull();
  });
});
