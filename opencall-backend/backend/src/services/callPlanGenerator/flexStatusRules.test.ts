import { describe, expect, it } from "vitest";
import { isRequestToCancelFlexStatus } from "./flexStatusRules.js";

describe("flexStatusRules", () => {
  it("matches Request to Cancel flex statuses case-insensitively", () => {
    expect(isRequestToCancelFlexStatus("Request to Cancel")).toBe(true);
    expect(isRequestToCancelFlexStatus(" request   TO   cancel ")).toBe(true);
  });

  it("does not match other cancellation or active statuses", () => {
    expect(isRequestToCancelFlexStatus("Cancelled")).toBe(false);
    expect(isRequestToCancelFlexStatus("Open")).toBe(false);
    expect(isRequestToCancelFlexStatus(null)).toBe(false);
  });
});
