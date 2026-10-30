// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageTops } from "./quotationPdf";

/** Where the PDF starts each page: as printing does, at the sheet's breaks and page feet. */
describe("pageTops", () => {
  const PAGE = 1122.94;

  it("is one page for a sheet a page tall", () => {
    expect(pageTops(1123, [], PAGE)).toEqual([0]);
  });

  it("starts a new page at the sheet's own break", () => {
    expect(pageTops(1123, [700], PAGE)).toEqual([0, 700]);
  });

  it("runs on to another page where a stretch is taller than a page", () => {
    expect(pageTops(3000, [], PAGE)).toEqual([0, PAGE, PAGE * 2]);
    expect(pageTops(3000, [700], PAGE)).toEqual([0, 700, 700 + PAGE, 700 + PAGE * 2]);
  });

  it("ignores a break at the very top or past the end, and a repeated one", () => {
    expect(pageTops(1123, [0, 700, 700.4, 5000], PAGE)).toEqual([0, 700]);
  });
});
