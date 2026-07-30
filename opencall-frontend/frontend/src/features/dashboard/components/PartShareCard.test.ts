import { describe, expect, it } from "vitest";
import type { CatalogPart } from "../../../lib/partsCatalogApiClient";
import {
  buildShareText,
  computePartPricing,
  parseGstRate,
} from "./PartShareCard";

// The catalog stores GST as a FRACTION ("0.18") and writes the literal "NA" when a part
// has no rate, so the money maths is the part worth pinning down.

function part(overrides: Partial<CatalogPart> = {}): CatalogPart {
  return {
    id: "p1",
    partNumber: "RM2-6389-000CN",
    description: "REVERSE DRIVE ASS'Y DUPLEX MODEL",
    category: "IPG",
    price: 6182.67,
    hsnCode: "84439959",
    igst: "0.18",
    cgst: "0.09",
    sgst: "0.09",
    eoslFlag: "No",
    validity: "2026-07-30",
    partsStatus: "Supported",
    ...overrides,
  };
}

describe("parseGstRate", () => {
  it("reads the catalog's fraction form as a percentage", () => {
    expect(parseGstRate("0.18")).toBe(18);
    expect(parseGstRate("0.09")).toBe(9);
    expect(parseGstRate("0.025")).toBeCloseTo(2.5, 10);
    expect(parseGstRate("0.05")).toBeCloseTo(5, 10);
  });

  it("treats the literal NA and blanks as no rate", () => {
    expect(parseGstRate("NA")).toBeNull();
    expect(parseGstRate("na")).toBeNull();
    expect(parseGstRate("")).toBeNull();
    expect(parseGstRate(null)).toBeNull();
    expect(parseGstRate(undefined)).toBeNull();
  });

  it("accepts an already-percent value rather than multiplying it again", () => {
    expect(parseGstRate("18")).toBe(18);
    expect(parseGstRate("9%")).toBe(9);
  });

  it("rejects junk and negatives", () => {
    expect(parseGstRate("abc")).toBeNull();
    expect(parseGstRate("-0.18")).toBeNull();
  });
});

describe("computePartPricing", () => {
  it("adds CGST + SGST for an intra-state part", () => {
    const p = computePartPricing(part({ price: 1000 }), 1, "INTRA");

    expect(p.subtotal).toBe(1000);
    expect(p.lines.map((l) => l.label)).toEqual(["CGST 9%", "SGST 9%"]);
    expect(p.lines.map((l) => l.amount)).toEqual([90, 90]);
    expect(p.total).toBe(1180);
    expect(p.gstUnavailable).toBe(false);
  });

  it("adds a single IGST line for an inter-state part", () => {
    const p = computePartPricing(part({ price: 1000 }), 1, "INTER");

    expect(p.lines.map((l) => l.label)).toEqual(["IGST 18%"]);
    expect(p.lines[0]?.amount).toBe(180);
    expect(p.total).toBe(1180);
  });

  it("multiplies by quantity before tax", () => {
    const p = computePartPricing(part({ price: 1000 }), 3, "INTRA");

    expect(p.unit).toBe(1000);
    expect(p.qty).toBe(3);
    expect(p.subtotal).toBe(3000);
    expect(p.total).toBe(3540); // 3000 + 270 + 270
  });

  it("falls back to a quantity of 1 for junk, zero or negative input", () => {
    expect(computePartPricing(part(), Number.NaN, "INTRA").qty).toBe(1);
    expect(computePartPricing(part(), 0, "INTRA").qty).toBe(1);
    expect(computePartPricing(part(), -4, "INTRA").qty).toBe(1);
  });

  it("floors a fractional quantity", () => {
    expect(computePartPricing(part(), 2.9, "INTRA").qty).toBe(2);
  });

  it("flags parts whose catalog GST is NA and charges no tax", () => {
    const p = computePartPricing(
      part({ price: 500, cgst: "NA", sgst: "NA", igst: "NA" }),
      2,
      "INTRA",
    );

    expect(p.lines).toEqual([]);
    expect(p.gstUnavailable).toBe(true);
    expect(p.total).toBe(1000); // subtotal only — never silently taxed
  });

  it("keeps the real catalog price exact", () => {
    const p = computePartPricing(part({ price: 6182.67 }), 2, "INTRA");

    expect(p.subtotal).toBeCloseTo(12365.34, 6);
    expect(p.total).toBeCloseTo(12365.34 * 1.18, 6);
  });

  it("handles a part priced at zero", () => {
    const p = computePartPricing(part({ price: 0 }), 5, "INTRA");
    expect(p.subtotal).toBe(0);
    expect(p.total).toBe(0);
  });
});

describe("buildShareText", () => {
  it("includes the part, the totals and the GST lines", () => {
    const p = part({ price: 1000 });
    const text = buildShareText(p, computePartPricing(p, 2, "INTRA"), "INTRA");

    expect(text).toContain("RM2-6389-000CN");
    expect(text).toContain("84439959");
    expect(text).toContain("CGST 9%");
    expect(text).toContain("SGST 9%");
    expect(text).toContain("2,360.00"); // 2000 + 180 + 180
  });

  it("says so when the catalog has no GST for the part", () => {
    const p = part({ cgst: "NA", sgst: "NA" });
    const text = buildShareText(p, computePartPricing(p, 1, "INTRA"), "INTRA");

    expect(text).toContain("not available in the catalog");
  });
});
