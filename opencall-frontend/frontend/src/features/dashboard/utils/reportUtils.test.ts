import { describe, expect, it } from "vitest";
import type { ReportRow } from "../types";
import { isTradeCase } from "./caseClassification";
import {
  rowMatchesRecordSearch,
  rowMatchesRegionFilter,
  selectRecordSearchBaseRows,
} from "./reportUtils";

// The helpers under test only read output/serialNo/carryForward, so a minimal
// stub is enough (same pattern as operationalHealth.test.ts).
function row(serialNo: number, output: Record<string, string | number>): ReportRow {
  return {
    serialNo,
    output,
    carryForward: { carriedForwardFields: [], manualFieldsMissing: [] },
  } as unknown as ReportRow;
}

// Fixtures mirroring the product-owner scenario: Trade card active, user
// searches for an installation case.
const tradeNorth = row(1, {
  "Ticket ID": "WO-011111111",
  Segment: "Trade Print",
  "Work Location": "NORTH",
});
const installNorth = row(2, {
  "Ticket ID": "WO-035130369",
  Segment: "Install",
  "Work Location": "NORTH",
});
const installSouth = row(3, {
  "Ticket ID": "WO-035999999",
  Segment: "Install",
  "Work Location": "SOUTH",
});
const allRows = [tradeNorth, installNorth, installSouth];

describe("rowMatchesRegionFilter", () => {
  it("matches every row when no region is selected", () => {
    expect(allRows.every((r) => rowMatchesRegionFilter(r, null))).toBe(true);
  });

  it('matches every row for the "ALL" region', () => {
    expect(allRows.every((r) => rowMatchesRegionFilter(r, "ALL"))).toBe(true);
  });

  it("matches only rows whose Work Location equals the selected region", () => {
    expect(rowMatchesRegionFilter(tradeNorth, "NORTH")).toBe(true);
    expect(rowMatchesRegionFilter(installNorth, "NORTH")).toBe(true);
    expect(rowMatchesRegionFilter(installSouth, "NORTH")).toBe(false);
  });

  it("compares regions case-insensitively and ignores surrounding whitespace", () => {
    const messy = row(9, { "Work Location": "  north " });
    expect(rowMatchesRegionFilter(messy, "North")).toBe(true);
    expect(rowMatchesRegionFilter(messy, "SOUTH")).toBe(false);
  });
});

describe("selectRecordSearchBaseRows", () => {
  const scoped = [tradeNorth];
  const searchScope = [tradeNorth, installNorth];

  it("keeps the scoped rows as the base when the query is empty", () => {
    expect(selectRecordSearchBaseRows("", scoped, searchScope)).toBe(scoped);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(selectRecordSearchBaseRows("   ", scoped, searchScope)).toBe(scoped);
  });

  it("widens the base to the search-scope rows when a query is present", () => {
    expect(selectRecordSearchBaseRows("install", scoped, searchScope)).toBe(searchScope);
  });
});

// Simulates the records pipeline the hooks build:
//   scoped base   = category scope (Trade) + region  (useRecordRowSets.regionFilteredRows)
//   search scope  = region only                      (useRecordRowSets.searchScopeRows)
//   visible rows  = selectRecordSearchBaseRows(...)  (useExportRows.columnFilteredRows base)
//                   filtered by rowMatchesRecordSearch (useExportRows.filteredRows)
describe("records search escaping the category scope", () => {
  const selectedRegion = "NORTH";
  const scopedRows = allRows
    .filter(isTradeCase)
    .filter((r) => rowMatchesRegionFilter(r, selectedRegion));
  const searchScopeRows = allRows.filter((r) =>
    rowMatchesRegionFilter(r, selectedRegion),
  );

  function visibleRows(query: string): ReportRow[] {
    return selectRecordSearchBaseRows(query, scopedRows, searchScopeRows).filter(
      (r) => rowMatchesRecordSearch(r, query),
    );
  }

  it("category-scoped base excludes the installation row", () => {
    expect(scopedRows).toEqual([tradeNorth]);
    expect(scopedRows).not.toContain(installNorth);
  });

  it("with no search, only the scoped rows are visible (current behavior preserved)", () => {
    expect(visibleRows("")).toEqual([tradeNorth]);
  });

  it("searching a WO number surfaces a case outside the Trade scope", () => {
    expect(visibleRows("WO-035130369")).toEqual([installNorth]);
  });

  it('searching "install" surfaces out-of-scope matches but still respects the region', () => {
    const visible = visibleRows("install");
    expect(visible).toEqual([installNorth]);
    expect(visible).not.toContain(installSouth);
  });

  it("search results never include rows outside the selected region", () => {
    // installSouth matches the query text but fails the region filter.
    expect(visibleRows("WO-035999999")).toEqual([]);
  });
});
