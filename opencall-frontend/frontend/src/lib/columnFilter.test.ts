import { describe, it, expect } from "vitest";
import {
  normalizeFilterValue,
  extractUniqueValues,
  selectWipAgingRangeValues,
  sortWipAgingFilterValues,
  buildUniqueValuesMap,
  buildCascadedUniqueValuesMap,
  rowPassesFilters,
  applyColumnFilters,
  activeFilterCount,
  isColumnFiltered,
  isBlankLikeFilterValue,
  filterOptionLabel,
  compareFilterOptionValues,
  distanceFilterBand,
  columnFilterValue,
  BLANKS_OPTION_LABEL,
  BLANK_FILTER_VALUE,
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

  it("merges spelling-only aliases but keeps distinct statuses distinct", () => {
    expect(normalizeFilterValue("To be schedule")).toBe("TO BE SCHEDULED");
    expect(normalizeFilterValue("to be scheduled")).toBe("TO BE SCHEDULED");
    // Regression (prod 2026-07-20): "SSC Pending" and "Part Pending" are
    // separate statuses \u2014 the filter must list them separately, exactly as
    // the cells display them.
    expect(normalizeFilterValue("SSC Pending")).toBe("SSC PENDING");
    expect(normalizeFilterValue("Part Pending")).toBe("PART PENDING");
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

  it("keeps SSC Pending and Part Pending as separate dropdown options", () => {
    // Regression (prod 2026-07-20): an old alias grouped SSC Pending under
    // PART PENDING, so a row edited to "SSC Pending" still showed up in the
    // filter as "PART PENDING". The dropdown must mirror the cells.
    const rows = [
      makeRow({ "RTPL status": "SSC Pending" }),
      makeRow({ "RTPL status": "ssc pending" }),
      makeRow({ "RTPL status": "Part Pending" }),
      makeRow({ "RTPL status": "To be schedule" }),
      makeRow({ "RTPL status": "to be scheduled" }),
    ];

    expect(extractUniqueValues(rows, "RTPL status")).toEqual([
      { value: "PART PENDING", count: 1 },
      { value: "SSC PENDING", count: 2 },
      { value: "TO BE SCHEDULED", count: 2 },
    ]);
  });

  it("treats blank values as (blank), sorted last like Excel's (Blanks)", () => {
    const rows = [makeRow({ Segment: "" }), makeRow({ Segment: "PC" })];
    const result = extractUniqueValues(rows, "Segment");

    expect(result).toEqual([
      { value: "PC", count: 1 },
      { value: "(blank)", count: 1 },
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
// (blank) bucket — dropdown counts vs Apply matching (Evening status bug)
// ---------------------------------------------------------------------------

describe("(blank) filter bucket", () => {
  // "Evening status" can legitimately hold "" (cleared), be missing entirely
  // (undefined — older rows created before the column existed), or hold the
  // "Manual Entry Required" placeholder, depending on row age.
  const rows: { output: Record<string, string | number> }[] = [
    makeRow({ "Evening status": "" }),
    makeRow({}), // no "Evening status" key at all → undefined
    makeRow({ "Evening status": "Manual Entry Required" }),
    makeRow({ "Evening status": "WO-Closed" }),
    makeRow({ "Evening status": "CX Pending" }),
  ];

  it("keeps the blank sentinel stable under re-normalization", () => {
    const sentinel = normalizeFilterValue("");
    expect(normalizeFilterValue(sentinel)).toBe(sentinel);
  });

  it("Apply on ONLY the (blank) option returns exactly the rows the dropdown counted as blank", () => {
    // 1. The dropdown builds its option list (values + counts)…
    const options = extractUniqueValues(rows, "Evening status");
    const blankOption = options.find(
      (option) => option.value === normalizeFilterValue(""),
    );
    expect(blankOption).toEqual({ value: normalizeFilterValue(""), count: 2 });

    // 2. …the user checks only (blank) and hits Apply. The hook
    //    (useColumnFilters.setColumnFilter) re-normalizes the selected values
    //    before applyColumnFilters normalizes them again.
    const applied = new Set(
      Array.from(new Set([blankOption!.value]), normalizeFilterValue),
    );
    const filters: ColumnFilterState = { "Evening status": applied };

    // 3. Counts and matches must agree: the 2 blank rows come back.
    const result = applyColumnFilters(rows, filters);
    expect(result).toHaveLength(blankOption!.count);
    expect(result.map((row) => row.output["Evening status"])).toEqual([
      "",
      undefined,
    ]);
  });

  it("does NOT treat 'Manual Entry Required' as blank in counting or matching", () => {
    const options = extractUniqueValues(rows, "Evening status");
    expect(options.map((option) => option.value)).toContain(
      "MANUAL ENTRY REQUIRED",
    );

    const result = applyColumnFilters(rows, {
      "Evening status": new Set([normalizeFilterValue("")]),
    });
    expect(
      result.some(
        (row) => row.output["Evening status"] === "Manual Entry Required",
      ),
    ).toBe(false);
  });

  it("rowPassesFilters matches a blank row against a re-normalized blank sentinel", () => {
    const row = makeRow({ "Evening status": "" });
    const filters: ColumnFilterState = {
      "Evening status": new Set([
        normalizeFilterValue(normalizeFilterValue("")),
      ]),
    };

    expect(rowPassesFilters(row, filters)).toBe(true);
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
// buildCascadedUniqueValuesMap — Excel-style faceted dropdown options
// ---------------------------------------------------------------------------

describe("buildCascadedUniqueValuesMap", () => {
  // Morning status lives under the "RTPL status" key.
  const rows = [
    makeRow({ "RTPL status": "Scheduled", Engineer: "John", Segment: "PC" }),
    makeRow({ "RTPL status": "Scheduled", Engineer: "John", Segment: "Print" }),
    makeRow({ "RTPL status": "Scheduled", Engineer: "Mary", Segment: "PC" }),
    makeRow({ "RTPL status": "Part Pending", Engineer: "Ravi", Segment: "PC" }),
    makeRow({ "RTPL status": "Part Pending", Engineer: "Mary", Segment: "Print" }),
  ];

  it("matches buildUniqueValuesMap when no filters and no predicate are active", () => {
    const cascaded = buildCascadedUniqueValuesMap(rows, {});
    const plain = buildUniqueValuesMap(rows);

    for (const col of FILTERABLE_COLUMNS) {
      expect(cascaded.get(col)).toEqual(plain.get(col));
    }
  });

  it("restricts other columns' options to rows matching the active filter", () => {
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // Engineer options only list engineers on Scheduled rows, with cascaded
    // counts (Ravi has no Scheduled rows → not listed at all).
    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "MARY", count: 1 },
    ]);
    expect(map.get("Segment")).toEqual([
      { value: "PC", count: 2 },
      { value: "PRINT", count: 1 },
    ]);
  });

  it("excludes a column's OWN filter when building that column's options", () => {
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // The filtered column itself still offers the full value list (from rows
    // passing every OTHER filter — here, none), so the user can widen it.
    expect(map.get("RTPL status")).toEqual([
      { value: "PART PENDING", count: 2 },
      { value: "SCHEDULED", count: 3 },
    ]);
  });

  it("cascades between two filtered columns while excluding each column's own filter", () => {
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
      Engineer: new Set([normalizeFilterValue("Mary")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // Engineer options: rows passing RTPL status=Scheduled (own filter excluded).
    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "MARY", count: 1 },
    ]);

    // RTPL status options: rows passing Engineer=Mary (own filter excluded).
    expect(map.get("RTPL status")).toEqual([
      { value: "PART PENDING", count: 1 },
      { value: "SCHEDULED", count: 1 },
    ]);

    // Unfiltered column: rows passing BOTH filters (Scheduled + Mary → 1 row).
    expect(map.get("Segment")).toEqual([{ value: "PC", count: 1 }]);
  });

  it("keeps selected-but-now-empty values visible with count 0 so they can be unselected", () => {
    const filters: ColumnFilterState = {
      // User first picked Ravi…
      Engineer: new Set([normalizeFilterValue("Ravi")]),
      // …then filtered Morning status to Scheduled, which has no Ravi rows.
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // Engineer options come from Scheduled rows (own filter excluded): John
    // and Mary. Ravi has no Scheduled rows, but he is selected — he must stay
    // listed with count 0 (sorted in place) so the user can unselect him.
    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "MARY", count: 1 },
      { value: "RAVI", count: 0 },
    ]);
  });

  it("keeps the filtered column's selection visible with count 0 when a predicate empties it", () => {
    const filters: ColumnFilterState = {
      Engineer: new Set([normalizeFilterValue("Ravi")]),
    };

    // Global search that matches no Ravi rows.
    const map = buildCascadedUniqueValuesMap(rows, filters, {
      rowPredicate: (row) =>
        String(row.output["Engineer"]).toLowerCase().includes("john"),
    });

    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "RAVI", count: 0 },
    ]);
  });

  it("applies the row predicate (global search) to every column's options", () => {
    const map = buildCascadedUniqueValuesMap(rows, {}, {
      rowPredicate: (row) => row.output["Segment"] === "PC",
    });

    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 1 },
      { value: "MARY", count: 1 },
      { value: "RAVI", count: 1 },
    ]);
    expect(map.get("RTPL status")).toEqual([
      { value: "PART PENDING", count: 1 },
      { value: "SCHEDULED", count: 2 },
    ]);
  });

  it("hides rows failing two or more other filters from unfiltered columns", () => {
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
      Engineer: new Set([normalizeFilterValue("John")]),
      Segment: new Set([normalizeFilterValue("PC")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // "Location" is unfiltered: only rows passing ALL three filters count.
    // Row 1 (Scheduled/John/PC, Location Delhi) is the only one.
    expect(map.get("Location")).toEqual([{ value: "DELHI", count: 1 }]);

    // Segment's own list: rows passing Scheduled+John (rows 1-2).
    expect(map.get("Segment")).toEqual([
      { value: "PC", count: 1 },
      { value: "PRINT", count: 1 },
    ]);
  });

  it("treats an explicitly empty selection as hiding all rows from OTHER columns but not its own", () => {
    const filters: ColumnFilterState = {
      Engineer: new Set<string>(),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);

    // Engineer's own dropdown still lists everything (escape hatch).
    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "MARY", count: 2 },
      { value: "RAVI", count: 1 },
    ]);

    // Other columns reflect the (empty) visible row set.
    expect(map.get("Segment")).toEqual([]);
  });

  it("normalizes selected values the same way applyColumnFilters does", () => {
    const filters: ColumnFilterState = {
      // Raw, un-normalized selection (as a defensive caller might pass).
      "RTPL status": new Set(["  scheduled "]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);
    expect(map.get("Engineer")).toEqual([
      { value: "JOHN", count: 2 },
      { value: "MARY", count: 1 },
    ]);
  });

  it("agrees with applyColumnFilters: option counts for an unfiltered column sum to the filtered row count", () => {
    const filters: ColumnFilterState = {
      "RTPL status": new Set([normalizeFilterValue("Scheduled")]),
      Engineer: new Set([normalizeFilterValue("John")]),
    };

    const map = buildCascadedUniqueValuesMap(rows, filters);
    const visibleRows = applyColumnFilters(rows, filters);

    const segmentTotal = map
      .get("Segment")!
      .reduce((sum, entry) => sum + entry.count, 0);

    expect(segmentTotal).toBe(visibleRows.length);
  });

  it("handles large row sets efficiently", () => {
    const rows = Array.from({ length: 10000 }, (_, i) =>
      makeRow({
        Segment: i % 3 === 0 ? "PC" : i % 3 === 1 ? "Print" : "LaserJet",
        Engineer: `Eng ${i % 25}`,
        "RTPL status": i % 2 === 0 ? "Scheduled" : "Part Pending",
      }),
    );

    const filters: ColumnFilterState = {
      Segment: new Set(["PC"]),
      "RTPL status": new Set(["SCHEDULED"]),
    };

    const start = performance.now();
    const map = buildCascadedUniqueValuesMap(rows, filters);
    const duration = performance.now() - start;

    expect(map.get("Engineer")!.length).toBeGreaterThan(0);
    // Single pass over 10k rows × 26 columns worst case — generous threshold
    // to avoid flaking on a loaded machine while still catching O(n²) blowups.
    expect(duration).toBeLessThan(500);
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

describe("blank-like option presentation (Excel-style)", () => {
  it("classifies the blank sentinel and Manual Entry Required (any casing) as blank-like", () => {
    expect(isBlankLikeFilterValue(BLANK_FILTER_VALUE)).toBe(true);
    expect(isBlankLikeFilterValue("Manual Entry Required")).toBe(true);
    expect(isBlankLikeFilterValue("MANUAL ENTRY REQUIRED")).toBe(true);
    expect(isBlankLikeFilterValue("  manual entry required  ")).toBe(true);
    expect(isBlankLikeFilterValue("")).toBe(true);
    expect(isBlankLikeFilterValue("Jeeva CH")).toBe(false);
    expect(isBlankLikeFilterValue("Scheduled")).toBe(false);
  });

  it("renders blank-like values as the (Blanks) label, others as-is", () => {
    expect(filterOptionLabel(BLANK_FILTER_VALUE)).toBe(BLANKS_OPTION_LABEL);
    expect(filterOptionLabel("Manual Entry Required")).toBe(BLANKS_OPTION_LABEL);
    expect(filterOptionLabel("Jeeva CH")).toBe("Jeeva CH");
  });

  it("sorts blank-like values dead last, real values alphabetically", () => {
    const values = [
      "MANUAL ENTRY REQUIRED",
      "SAMIM",
      BLANK_FILTER_VALUE,
      "JEEVA CH",
    ].sort(compareFilterOptionValues);
    expect(values.slice(0, 2)).toEqual(["JEEVA CH", "SAMIM"]);
    expect(values.slice(2).every(isBlankLikeFilterValue)).toBe(true);
  });

  it("extractUniqueValues places blank-like entries after real names", () => {
    const rows = [
      makeRow({ Engineer: "Manual Entry Required" }),
      makeRow({ Engineer: "Samim" }),
      makeRow({ Engineer: "" }),
      makeRow({ Engineer: "Jeeva CH" }),
    ];
    const values = extractUniqueValues(rows, "Engineer").map((e) => e.value);
    expect(values.slice(0, 2)).toEqual(["JEEVA CH", "SAMIM"]);
    expect(values.slice(2).every(isBlankLikeFilterValue)).toBe(true);
  });

  it("cascaded option lists keep blank-like entries last with correct counts", () => {
    const rows = [
      makeRow({ "RTPL status": "Scheduled", Engineer: "Manual Entry Required" }),
      makeRow({ "RTPL status": "Scheduled", Engineer: "Jeeva CH" }),
      makeRow({ "RTPL status": "Entry", Engineer: "Samim" }),
    ];
    const map = buildCascadedUniqueValuesMap(rows, {
      "RTPL status": new Set(["SCHEDULED"]),
    });
    const engineer = map.get("Engineer")!;
    expect(engineer.map((e) => e.value)).toEqual([
      "JEEVA CH",
      "MANUAL ENTRY REQUIRED",
    ]);
    expect(engineer.find((e) => e.value === "MANUAL ENTRY REQUIRED")!.count).toBe(1);
  });
});

describe("Distance column filtering", () => {
  // Distance is the one column whose dropdown is NOT WYSIWYG. The cell shows an
  // exact "12.9 km · NNE" because that is what a dispatcher reads; the filter
  // shows four bands because fifty exact values sorted as text (putting
  // "10.4 km" above "2.6 km") is not a filter anyone can use.
  it("bands an exact distance cell", () => {
    expect(distanceFilterBand("2.6 km · NNE")).toBe("0-5 KM");
    expect(distanceFilterBand("12.9 km · NNE")).toBe("5-15 KM");
    expect(distanceFilterBand("24.5 km · NNW")).toBe("15-30 KM");
    expect(distanceFilterBand("51.0 km · NE")).toBe("30+ KM");
  });

  it("bands a straight-line estimate the same as a routed distance", () => {
    // Flagged in the cell, but not excluded from a filter for nearby work.
    expect(distanceFilterBand("~12.9 km · NNE")).toBe("5-15 KM");
    expect(distanceFilterBand("~2.6 km · NNE")).toBe("0-5 KM");
  });

  it("treats an unresolved distance as blank", () => {
    expect(distanceFilterBand("")).toBe(BLANK_FILTER_VALUE);
    expect(distanceFilterBand(null)).toBe(BLANK_FILTER_VALUE);
    expect(distanceFilterBand("n/a")).toBe(BLANK_FILTER_VALUE);
  });

  it("puts a band boundary in the lower band", () => {
    expect(distanceFilterBand("5.0 km · N")).toBe("0-5 KM");
    expect(distanceFilterBand("15.0 km · N")).toBe("5-15 KM");
    expect(distanceFilterBand("30.0 km · N")).toBe("15-30 KM");
  });

  /**
   * The load-bearing property. Selected filter values are re-normalized before
   * they are matched against rows, so a band the normalizer rewrites would never
   * match anything — the exact shape of the 2026-07-20 "PART PENDING (21)"
   * dropdown bug, where options named rows they did not select.
   */
  it("produces bands that survive re-normalization unchanged", () => {
    for (const band of ["0-5 KM", "5-15 KM", "15-30 KM", "30+ KM", BLANK_FILTER_VALUE]) {
      expect(normalizeFilterValue(band)).toBe(band);
    }
  });

  it("leaves every other column WYSIWYG", () => {
    expect(columnFilterValue("Scheduled", "RTPL status")).toBe("SCHEDULED");
    expect(columnFilterValue("12.9 km · NNE", "Location")).toBe("12.9 KM · NNE");
  });

  it("selects exactly the rows inside a band", () => {
    const rows = [
      { output: { Distance: "2.6 km · NNE" } },
      { output: { Distance: "12.9 km · NNE" } },
      { output: { Distance: "24.5 km · NNW" } },
      { output: { Distance: "" } },
    ];

    const filtered = applyColumnFilters(rows, { Distance: new Set(["5-15 KM"]) });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.output.Distance).toBe("12.9 km · NNE");
  });

  it("offers one dropdown entry per band, not per pincode", () => {
    const rows = [
      { output: { Distance: "2.6 km · NNE" } },
      { output: { Distance: "3.4 km · ESE" } },
      { output: { Distance: "12.9 km · NNE" } },
    ];

    const options = extractUniqueValues(rows, "Distance");

    expect(options.map((o) => o.value).sort()).toEqual(["0-5 KM", "5-15 KM"]);
    expect(options.find((o) => o.value === "0-5 KM")!.count).toBe(2);
  });
});
