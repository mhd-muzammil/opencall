import { describe, expect, it } from "vitest";
import { parseExcelDate } from "./valueNormalizer.js";

describe("parseExcelDate", () => {
  it("parses Flex WIP day-first create-time values", () => {
    const parsed = parseExcelDate("28-04-2026 01:34:30 PM");

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(3);
    expect(parsed?.getDate()).toBe(28);
    expect(parsed?.getHours()).toBe(13);
    expect(parsed?.getMinutes()).toBe(34);
    expect(parsed?.getSeconds()).toBe(30);
  });
});
