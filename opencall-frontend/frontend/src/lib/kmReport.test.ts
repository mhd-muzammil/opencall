import { describe, expect, it } from "vitest";
import { filterKmRows, formatKm, kmRegions, kmTotals, regionKey, regionTone } from "./kmReport";

const row = (engineer_name: string, branch: string | null, days: Record<string, number> = {}) => ({
  engineer_name,
  branch,
  days,
  distance_km: Math.round(Object.values(days).reduce((s, km) => s + km, 0) * 100) / 100,
});

describe("formatKm", () => {
  it("prints a distance the way the live tracking board does", () => {
    expect(formatKm(42.37)).toBe("42.37");
    expect(formatKm(40.2)).toBe("40.2");
    expect(formatKm(12)).toBe("12");
  });

  it("a day with no travel is a dash, not a zero", () => {
    expect(formatKm(0)).toBe("-");
    expect(formatKm(null)).toBe("-");
    expect(formatKm(undefined)).toBe("-");
  });
});

describe("kmRegions", () => {
  it("one box per region, in the office's order, case and spaces folded", () => {
    const regions = kmRegions([
      row("a", "Hosur"),
      row("b", "CHENNAI"),
      row("c", "Chennai "),
      row("d", "Salem"),
      row("e", "Coimbatore"),
      row("f", "Vellore"),
      row("g", null),
    ]);
    expect(regions.map((r) => [r.key, r.count])).toEqual([
      ["chennai", 2],
      ["vellore", 1],
      ["salem", 1],
      ["hosur", 1],
      ["coimbatore", 1],
    ]);
    expect(regions[0]!.name).toBe("CHENNAI");
  });
});

describe("filterKmRows", () => {
  const rows = [row("Arun", "Chennai"), row("Bala", "Salem"), row("Arul", "salem")];

  it("All and no search is everybody", () => {
    expect(filterKmRows(rows, "", "")).toHaveLength(3);
  });

  it("a region box keeps that region, however it is spelt", () => {
    expect(filterKmRows(rows, regionKey("SALEM"), "").map((r) => r.engineer_name)).toEqual(["Bala", "Arul"]);
  });

  it("the search narrows by name, with the region", () => {
    expect(filterKmRows(rows, "", "ar").map((r) => r.engineer_name)).toEqual(["Arun", "Arul"]);
    expect(filterKmRows(rows, "salem", "ar").map((r) => r.engineer_name)).toEqual(["Arul"]);
  });
});

describe("kmTotals", () => {
  it("adds each day over the rows shown, and the period", () => {
    const days = ["2026-09-25", "2026-09-26"];
    const totals = kmTotals(
      [
        row("Arun", "Chennai", { "2026-09-25": 12.5, "2026-09-26": 0.1 }),
        row("Bala", "Salem", { "2026-09-25": 0, "2026-09-26": 0.2 }),
      ],
      days,
    );
    expect(totals.byDay).toEqual({ "2026-09-25": 12.5, "2026-09-26": 0.3 });
    expect(totals.total).toBe(12.8);
  });
});

describe("regionTone", () => {
  it("each branch its own colour, and a grey for anything else", () => {
    expect(regionTone("chennai").accent).toBe("#0284c7");
    expect(regionTone("").accent).toBe("#7c3aed");
    expect(regionTone("coimbatore").accent).toBe("#4b5563");
  });
});
