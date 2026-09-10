// A Closed Calls workbook has to say what is in it. The old one was named after the day
// it was downloaded and carried no scope at all, so 1,185 rows could equally have been one
// day, one bill cycle or the whole ledger — and the file gets forwarded.
import { describe, expect, it } from "vitest";
import {
  closedCallsExportFilename,
  closedCallsScopeSheet,
  describeExportPeriod,
  formatIstStamp,
  type ClosedCallsExportScope,
} from "./closedCallsExport";

const GENERATED = new Date("2026-09-10T14:32:00Z"); // 20:02 IST

function scope(overrides: Partial<ClosedCallsExportScope> = {}): ClosedCallsExportScope {
  return {
    preset: "cycle",
    dateLo: "2026-07-25",
    dateHi: "2026-08-24",
    cycleLabel: "Aug 2026 (25 Jul – 24 Aug)",
    regionLabel: "All regions",
    aspCode: "",
    search: "",
    rowCount: 1185,
    ours: { closed: 1103, cancelled: 82, unknown: 0, closedWithoutEngineer: 42 },
    fieldez: { closed: 1114, cancelled: 83, hasSplit: true },
    raw: { closed: 0, cancelled: 0, hasSplit: true },
    generatedAt: GENERATED,
    ...overrides,
  };
}

/** The scope sheet as "label -> value", which is how a reader uses it. */
function sheetMap(input: ClosedCallsExportScope): Map<string, string | number> {
  return new Map(
    closedCallsScopeSheet(input)
      .filter((row) => row.length === 2)
      .map((row) => [String(row[0]), row[1] as string | number]),
  );
}

describe("closedCallsExportFilename", () => {
  it("names the PERIOD, not the day the button was pressed", () => {
    expect(closedCallsExportFilename(scope())).toBe(
      "Closed_Calls_ALL_2026-07-25_to_2026-08-24.xlsx",
    );
  });

  it("keeps today legible as today", () => {
    expect(
      closedCallsExportFilename(
        scope({ preset: "today", dateLo: "2026-09-10", dateHi: "2026-09-10" }),
      ),
    ).toBe("Closed_Calls_ALL_today_2026-09-10.xlsx");
  });

  it("says all-dates rather than inventing a range", () => {
    expect(
      closedCallsExportFilename(scope({ preset: "all", dateLo: "", dateHi: "" })),
    ).toBe("Closed_Calls_ALL_all-dates.xlsx");
  });

  it("carries the region code", () => {
    expect(closedCallsExportFilename(scope({ aspCode: "ASPS01461" }))).toContain(
      "Closed_Calls_ASPS01461_",
    );
  });

  it("marks a search-filtered file, which is the one that gets forwarded", () => {
    expect(closedCallsExportFilename(scope({ search: "chennai" }))).toBe(
      "Closed_Calls_ALL_2026-07-25_to_2026-08-24_filtered.xlsx",
    );
  });

  it("collapses a single-day range instead of repeating the date", () => {
    expect(
      closedCallsExportFilename(
        scope({ preset: "custom", dateLo: "2026-08-01", dateHi: "2026-08-01" }),
      ),
    ).toBe("Closed_Calls_ALL_2026-08-01.xlsx");
  });
});

describe("describeExportPeriod", () => {
  it("says the report-day rule out loud for today", () => {
    // "Today" is not a date filter — it is the calls this report closed, which still
    // includes a closure Flex reported late with a back-dated Case Closed Date.
    expect(
      describeExportPeriod(
        scope({ preset: "today", dateLo: "2026-09-10", dateHi: "2026-09-10" }),
      ),
    ).toBe("Today (10-09-2026) — closed on this report's day");
  });

  it("warns that all-dates is the ledger, which is never pruned", () => {
    expect(describeExportPeriod(scope({ preset: "all", dateLo: "", dateHi: "" }))).toContain(
      "never pruned",
    );
  });

  it("names the cycle", () => {
    expect(describeExportPeriod(scope())).toBe("Bill cycle Aug 2026 (25 Jul – 24 Aug)");
  });

  it("reads a custom range in the format the ledger shows", () => {
    expect(
      describeExportPeriod(
        scope({ preset: "custom", dateLo: "2026-08-01", dateHi: "2026-08-05" }),
      ),
    ).toBe("01-08-2026 to 05-08-2026 — by Case Closed Date");
  });
});

describe("closedCallsScopeSheet", () => {
  it("states period, region, search and the row count", () => {
    const map = sheetMap(scope());
    expect(map.get("Period")).toBe("Bill cycle Aug 2026 (25 Jul – 24 Aug)");
    expect(map.get("Region")).toBe("All regions");
    expect(map.get("Search filter")).toBe("(none)");
    expect(map.get("Rows in this file")).toBe(1185);
    expect(map.get("Generated")).toBe("10-09-2026 20:02 IST");
  });

  it("carries the on-screen counts so the file can be reconciled with the page", () => {
    const map = sheetMap(scope());
    expect(map.get("Our closed count — completed")).toBe(1103);
    expect(map.get("Our closed count — cancelled")).toBe(82);
    expect(map.get("Completed with no engineer in our CRM")).toBe(42);
    expect(map.get("FieldEZ data closure — completed")).toBe(1114);
  });

  it("says a source was never imported rather than reporting it as zero", () => {
    // "0" would read as "the vendor reported nothing", which is a different claim from
    // "nobody has ever imported it".
    const map = sheetMap(scope({ fieldez: null, raw: null }));
    expect(map.get("FieldEZ data closure")).toBe("not imported");
    expect(map.get("Raw data closures")).toBe("not synced");
    expect(map.has("FieldEZ data closure — completed")).toBe(false);
  });

  it("qualifies the ASP code onto the region name", () => {
    expect(sheetMap(scope({ aspCode: "ASPS01461", regionLabel: "Chennai" })).get("Region")).toBe(
      "Chennai (ASPS01461)",
    );
  });

  it("warns that the data sheet is rows, not the completed count", () => {
    const note = sheetMap(scope()).get("Note");
    expect(String(note)).toContain("every closed ROW");
  });
});

describe("formatIstStamp", () => {
  it("reads in IST, because the whole page does", () => {
    expect(formatIstStamp(GENERATED)).toBe("10-09-2026 20:02 IST");
  });

  it("is empty for an unparseable date rather than 'Invalid Date'", () => {
    expect(formatIstStamp(new Date("nope"))).toBe("");
  });
});
