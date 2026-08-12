import { describe, expect, it } from "vitest";
import { quotationTotals, resolveLineItems } from "./quotationTotals";
import type { Quotation } from "./quotationApiClient";

// These numbers go on a document that reaches a customer. A quotation whose printed sheet
// disagrees with the form that produced it is the failure that matters here.

const item = (baseAmount: number) => ({ baseAmount });

describe("quotationTotals", () => {
  it("sums the line items and applies GST once to the subtotal", () => {
    const t = quotationTotals([item(5000), item(3000)], 9, 9);
    expect(t.subtotal).toBe(8000);
    expect(t.sgst).toBe(720);
    expect(t.cgst).toBe(720);
    expect(t.totalTax).toBe(1440);
    expect(t.total).toBe(9440);
  });

  // The pre-053 behaviour must be preserved exactly: one item is just the same maths.
  it("matches the old single-item result", () => {
    const t = quotationTotals([item(10000)], 9, 9);
    expect(t.subtotal).toBe(10000);
    expect(t.total).toBe(11800);
  });

  it("handles a zero-rated quotation", () => {
    const t = quotationTotals([item(5000)], 0, 0);
    expect(t.total).toBe(5000);
    expect(t.totalTax).toBe(0);
  });

  it("treats an empty list as zero rather than NaN", () => {
    const t = quotationTotals([], 9, 9);
    expect(t.subtotal).toBe(0);
    expect(t.total).toBe(0);
  });

  // A blank amount box gives NaN, which would print "₹NaN" on the sheet.
  it("ignores a row whose amount is not a number", () => {
    const t = quotationTotals(
      [item(1000), { baseAmount: Number.NaN }, item(500)],
      9,
      9,
    );
    expect(t.subtotal).toBe(1500);
    expect(Number.isNaN(t.total)).toBe(false);
  });

  it("keeps the paise on an uneven split", () => {
    const t = quotationTotals([item(1234.5), item(765.5)], 9, 9);
    expect(t.subtotal).toBe(2000);
    expect(t.total).toBeCloseTo(2360, 2);
  });
});

describe("resolveLineItems", () => {
  const base = {
    serviceDescription: "Service Charge",
    productDescription: "HP LaserJet",
    modelNo: "M404",
    serialNo: "SN123",
    baseAmount: 5000,
  };

  it("returns the stored items when there are any", () => {
    const q = { ...base, lineItems: [{ ...base, baseAmount: 1 }, { ...base, baseAmount: 2 }] };
    expect(resolveLineItems(q as unknown as Quotation)).toHaveLength(2);
  });

  // An old quotation re-printing as a blank sheet is the failure this guards.
  it("falls back to the parent columns for a pre-053 quotation", () => {
    const q = { ...base, lineItems: [] };
    const items = resolveLineItems(q as unknown as Quotation);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ modelNo: "M404", serialNo: "SN123", baseAmount: 5000 });
  });

  it("falls back when lineItems is missing entirely", () => {
    const q = { ...base } as unknown as Quotation;
    expect(resolveLineItems(q)[0]?.baseAmount).toBe(5000);
  });
});
