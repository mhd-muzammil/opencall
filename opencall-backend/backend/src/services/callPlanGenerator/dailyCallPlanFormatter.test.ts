import { describe, expect, it } from "vitest";
import { formatDisplayDateTime } from "./dailyCallPlanFormatter.js";

describe("formatDisplayDateTime", () => {
  it("formats timestamp values without timezone suffix", () => {
    expect(formatDisplayDateTime("2026-05-04T14:02:51.000+05:30")).toBe(
      "04-05-2026 02:02:51 PM",
    );
  });

  it("formats postgres timestamp text with am/pm", () => {
    expect(formatDisplayDateTime("2026-05-04 07:32:51.123+05:30")).toBe(
      "04-05-2026 07:32:51 AM",
    );
  });
});
