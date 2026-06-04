import { describe, expect, it } from "vitest";
import { RTPL_STATUS_OPTIONS } from "@opencall/shared";

describe("RTPL status options", () => {
  it("shows Part Pending as the selectable parts status", () => {
    expect(RTPL_STATUS_OPTIONS).toContain("Part Pending");
    expect(RTPL_STATUS_OPTIONS).not.toContain("SSC Pending -> Part Pending");
    expect(RTPL_STATUS_OPTIONS).not.toContain("SSC Pending \u2192 Part Pending");
  });
});
