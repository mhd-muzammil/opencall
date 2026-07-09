import { describe, it, expect } from "vitest";
import {
  normalizeFilterValue,
  extractUniqueValues,
  selectWipAgingRangeValues,
  sortWipAgingFilterValues,
  buildUniqueValuesMap,
  rowPassesFilters,
  applyColumnFilters,
  activeFilterCount,
  isColumnFiltered,
  FILTERABLE_COLUMNS,
  type ColumnFilterState,
} from "./columnFilter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, string | number> = {}) {
  return {
    output: {
      "S.no": 1,
      "Ticket ID": "TK-001",
      "RTPL status": "Visit Quote Customer",
      Segment: "PC",
      Engineer: "John",
      "Flex Status": "Engg Assigned",
      "HP Owner Status": "Manual Entry Required",
      "WO OTC CODE": "01-Trade",
      Location: "Delhi",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// normalizeFilterValue
// ---------------------------------------------------------------------------

describe("normalizeFilterValue", () => {
  it("trims whitespace and normalizes casing", () => {
    expect(normalizeFilterValue("  hello  ")).toBe("HELLO");
  });

  it("collapses internal and non-breaking whitespace", () => {
    expect(normalizeFilterValue("To\u00a0 Be   Scheduled")).toBe("TO BE SCHEDULED");
  });

  it("removes invisible unicode formatting characters", () => {
    expect(normalizeFilterValue("Visit Quote\u200b To\u200e Customer\ufeff")).toBe("VISIT QUOTE TO CUSTOMER");
  });

  it("maps known business aliases to one filter value", () => {
    expect(normalizeFilterValue("SSC Pending")).toBe("PART PENDING");
    expect(normalizeFilterValue("SSC Pending -> Part Pending")).toBe("PART PENDING");
    expect(normalizeFilterValue("SSC Pending \u2192 Part Pending")).toBe("PART PENDING");
    expect(normalizeFilterValue("To be schedule")).toBe("TO BE SCHEDULED");
    expect(normalizeFilterValue("to be scheduled")).toBe("TO BE SCHEDULED");
  });

  it("returns (blank) for empty/null/undefined", () => {
    expect(normalizeFilterValue("")).toBe("(blank)");
    expect(normalizeFilterValue(null)).toBe("(blank)");
    expect(normalizeFilterValue(undefined)).toBe("(blank)");
    expect(normalizeFilterValue("   ")).toBe("(blank)");
  });

  it("converts numbers to string", () => {
    expect(normalizeFilterValue(42)).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// extractUniqueValues
// ---------------------------------------------------------------------------

describe("extractUniqueValues", () => {
  it("returns sorted unique values with counts", () => {
    const rows = [
      makeRow({ Segment: "PC" }),
      makeRow({ Segment: "PC" }),
      makeRow({ Segment: "Print" }),
    ];

    const result = extractUniqueValues(rows, "Segment");

    expect(result).toEqual([
      { value: "PC", count: 2 },
      { value: "PRINT", count: 1 },
    ]);
  });

  it("groups values that differ only by casing or spacing", () => {
    const rows = [
      makeRow({ "RTPL status": "To Be Scheduled" }),
      makeRow({ "RTPL status": "TO BE SCHEDULED" }),
      makeRow({ "RTPL status": "To  Be\u00a0Scheduled" }),
    ];

    expect(extractUniqueValues(rows, "RTPL status")).toEqual([
      { value: "TO BE SCHEDULED", count: 3 },
    ]);
  });

  it("groups values that look identical but contain invisible characters", () => {
    const rows = [
      makeRow({ "RTPL status": "Visit Quote To Customer" }),
      makeRow({ "RTPL status": "VISIT QUOTE TO CUSTOMER" }),
      makeRow({ "RTPL status": "Visit Quote\u200b To\u200e Customer\ufeff" }),
    ];

    expect(extractUniqueValues(rows, "RTPL status")).toEqual([
      { value: "VISIT QUOTE TO CUSTOMER", count: 3 },
    ]);
  });

  it("groups known status aliases into one dropdown option", () => {
    const rows = [
      makeRow({ "RTPL status": "SSC Pending" }),
      makeRow({ "RTPL status": "SSC Pending -> Part Pending" }),
      makeRow({ "RTPL status": "SSC Pending \u2192 Part Pending" }),
      makeRow({ "RTPL status": "Part Pending" }),
      makeRow({ "RTPL status": "To be schedule" }),
      makeRow({ "RTPL status": "to be scheduled" }),
    ];

    expect(extractUniqueValues(rows, "RTPL status")).toEqual([
      { value: "PART PENDING", count: 4 },
      { value: "TO BE SCHEDULED", count: 2 },
    ]);
  });

  it("treats blank values as (blank)", () => {
    const rows = [makeRow({ Segment: "" }), makeRow({ Segment: "PC" })];
    const result = extractUniqueValues(rows, "Segment");

    expect(result).toEqual([
      { value: "(blank)", count: 1 },
      { value: "PC", count: 1 },
    ]);
  });

  it("returns empty array for no rows", () => {
    expect(extractUniqueValues([], "Segment")).toEqual([]);
  });
});

describe("WIP aging filter helpers", () => {
  const entries = [
    { value: "10", count: 1 },
    { value: "2", count: 1 },
    { value: "0", count: 1 },
    { value: "5", count: 1 },
    { value: "(blank)", count: 1 },
  ];

  it("sorts WIP aging values numerically low to high", () => {
    expect(sortWipAgingFilterValues(entries, "lowToHigh").map((entry) => entry.value)).toEqual([
      "0",
      "2",
      "5",
      "10",
      "(blank)",
    ]);
  });

  it("sorts WIP aging values numerically high to low", () => {
    expect(sortWipAgingFilterValues(entries, "highToLow").map((entry) => entry.value)).toEqual([
      "10",
      "5",
      "2",
      "0",
      "(blank)",
    ]);
  });

  it("selects WIP aging values inside an inclusive range", () => {
    expect(Array.from(selectWipAgingRangeValues(entries, 0, 2))).toEqual([
      "2",
      "0",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildUniqueValuesMap
// ---------------------------------------------------------------------------

describe("buildUniqueValuesMap", () => {
  it("creates map entries for all filterable columns", () => {
    const rows = [makeRow()];
    const map = buildUniqueValuesMap(rows);

    for (const col of FILTERABLE_COLUMNS) {
      expect(map.has(col)).toBe(true);
      expect(map.get(col)!.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// rowPassesFilters
// ---------------------------------------------------------------------------

describe("rowPassesFilters", () => {
  it("passes when no filters are active", () => {
    const row = makeRow();
    const filters: ColumnFilterState = {};

    expect(rowPassesFilters(row, filters)).toBe(true);
  });

  it("passes when row matches a single filter", () => {
    const row = makeRow({ Segment: "pc" });
    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
    };

    expect(rowPassesFilters(row, filters)).toBe(true);
  });

  it("passes when selected value casing or spacing differs from the row", () => {
    const row = makeRow({ "RTPL status": "To  Be\u00a0Scheduled" });
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("to be scheduled")]),
    };

    expect(rowPassesFilters(row, filters)).toBe(true);
  });

  it("rejects when row does NOT match a single filter", () => {
    const row = makeRow({ Segment: "Print" });
    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
    };

    expect(rowPassesFilters(row, filters)).toBe(false);
  });

  it("combines multiple column filters with AND logic", () => {
    const row = makeRow({ Segment: "PC", "RTPL status": "Visit Quote Customer" });

    // Both match
    expect(
      rowPassesFilters(row, {
        Segment: new Set(["PC"]),
        "RTPL status": new Set([normalizeFilterValue("Visit Quote Customer")]),
      }),
    ).toBe(true);

    // One fails
    expect(
      rowPassesFilters(row, {
        Segment: new Set(["PC"]),
        "RTPL status": new Set([normalizeFilterValue("Good Part Received")]),
      }),
    ).toBe(false);
  });

  it("treats empty filter sets as no values selected", () => {
    const row = makeRow();
    const filters: ColumnFilterState = {
      Segment: new Set(),
    };

    expect(rowPassesFilters(row, filters)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyColumnFilters
// ---------------------------------------------------------------------------

describe("applyColumnFilters", () => {
  it("returns all rows when no filters are active", () => {
    const rows = [makeRow({ Segment: "PC" }), makeRow({ Segment: "Print" })];
    const result = applyColumnFilters(rows, {});

    expect(result).toHaveLength(2);
  });

  it("filters rows based on active column filters", () => {
    const rows = [
      makeRow({ Segment: "PC", "WO OTC CODE": "01-Trade" }),
      makeRow({ Segment: "Print", "WO OTC CODE": "01-Trade" }),
      makeRow({ Segment: "PC", "WO OTC CODE": "05F-Extended Warranty" }),
    ];

    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
    };

    const result = applyColumnFilters(rows, filters);
    expect(result).toHaveLength(2);
  });

  it("applies combined filters correctly", () => {
    const rows = [
      makeRow({ Segment: "PC", "WO OTC CODE": "01-Trade" }),
      makeRow({ Segment: "Print", "WO OTC CODE": "01-Trade" }),
      makeRow({ Segment: "PC", "WO OTC CODE": "05F-Extended Warranty" }),
    ];

    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
      "WO OTC CODE": new Set(["01-Trade"]),
    };

    const result = applyColumnFilters(rows, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.output.Segment).toBe("PC");
    expect(result[0]!.output["WO OTC CODE"]).toBe("01-Trade");
  });

  it("handles large row sets efficiently", () => {
    // Create 10k rows
    const rows = Array.from({ length: 10000 }, (_, i) =>
      makeRow({
        Segment: i % 3 === 0 ? "PC" : i % 3 === 1 ? "Print" : "LaserJet",
        "WO OTC CODE": i % 2 === 0 ? "01-Trade" : "05F-Extended Warranty",
      }),
    );

    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
      "WO OTC CODE": new Set(["01-Trade"]),
    };

    const start = performance.now();
    const result = applyColumnFilters(rows, filters);
    const duration = performance.now() - start;

    // PC appears at indices 0, 3, 6, ... → 3334 rows
    // Of those, 01-Trade at even indices → ~1667
    expect(result.length).toBeGreaterThan(0);
    // Guards against an accidental O(n²) regression. The threshold is generous
    // (wall-clock on a loaded CI box / dev machine varies a lot); a linear pass
    // over 10k rows is milliseconds, so anything under this still catches a
    // pathological blow-up without flaking on a busy machine.
    expect(duration).toBeLessThan(250);
  });
});

// ---------------------------------------------------------------------------
// activeFilterCount / isColumnFiltered
// ---------------------------------------------------------------------------

describe("activeFilterCount", () => {
  it("returns 0 when no filters", () => {
    expect(activeFilterCount({})).toBe(0);
  });

  it("counts present filter sets, including explicit empty selections", () => {
    expect(
      activeFilterCount({
        Segment: new Set(["PC"]),
        Engineer: new Set(),
        "WO OTC CODE": new Set(["01-Trade"]),
      }),
    ).toBe(3);
  });
});

describe("isColumnFiltered", () => {
  it("returns false only when the filter is missing", () => {
    expect(isColumnFiltered({}, "Segment")).toBe(false);
    expect(isColumnFiltered({ Segment: new Set() }, "Segment")).toBe(true);
  });

  it("returns true for active filter", () => {
    expect(isColumnFiltered({ Segment: new Set(["PC"]) }, "Segment")).toBe(true);
  });
});
