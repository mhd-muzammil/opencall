import { describe, expect, it } from "vitest";
import type { ReportRow } from "../types";
import { computeOperationalHealth, DEFAULT_AGING_THRESHOLD } from "./operationalHealth";

// computeOperationalHealth only reads row.output, so a minimal stub is enough.
function row(output: Record<string, string | number>): ReportRow {
  return { output } as unknown as ReportRow;
}

describe("computeOperationalHealth", () => {
  it("returns zeroed buckets for no rows", () => {
    const health = computeOperationalHealth([]);
    expect(health.openCount).toBe(0);
    expect(health.actionable.count).toBe(0);
    expect(health.aged.count).toBe(0);
    expect(health.awaitingCustomer.count).toBe(0);
    expect(health.unassigned.count).toBe(0);
    expect(health.aged.threshold).toBe(DEFAULT_AGING_THRESHOLD);
  });

  it("counts actionable calls but excludes customer/pending variants", () => {
    const rows = [
      row({ "RTPL status": "Actionable" }),
      row({ "RTPL status": "Actionable - Cx Pending" }), // excluded by 'cx'/'pending'
      row({ "RTPL status": "Assigned" }),
    ];
    const health = computeOperationalHealth(rows);
    expect(health.actionable.count).toBe(1);
    expect(health.actionable.values).toEqual(["Actionable"]);
  });

  it("counts awaiting-customer calls and collects their raw statuses", () => {
    const rows = [
      row({ "RTPL status": "Cx Pending" }),
      row({ "RTPL status": "Customer Delay" }),
      row({ "RTPL status": "Actionable" }),
    ];
    const health = computeOperationalHealth(rows);
    expect(health.awaitingCustomer.count).toBe(2);
    expect(new Set(health.awaitingCustomer.values)).toEqual(
      new Set(["Cx Pending", "Customer Delay"]),
    );
  });

  it("flags rows at or above the aging threshold and keeps raw aging values for filtering", () => {
    const rows = [
      row({ "WIP aging": "12" }),
      row({ "WIP aging": "10" }), // boundary is inclusive
      row({ "WIP aging": "3" }),
      row({ "WIP aging": "n/a" }), // non-numeric ignored
    ];
    const health = computeOperationalHealth(rows);
    expect(health.aged.count).toBe(2);
    expect(new Set(health.aged.values)).toEqual(new Set(["12", "10"]));
  });

  it("respects a custom aging threshold", () => {
    const rows = [row({ "WIP aging": "5" }), row({ "WIP aging": "8" })];
    const health = computeOperationalHealth(rows, 6);
    expect(health.aged.count).toBe(1);
    expect(health.aged.threshold).toBe(6);
  });

  it("counts open calls with no engineer assigned (placeholder or blank)", () => {
    const rows = [
      row({ Engineer: "Asha" }), // assigned → not unassigned
      row({ Engineer: "Ravi" }), // assigned → not unassigned
      row({ Engineer: "Manual Entry Required" }), // placeholder → unassigned
      row({ Engineer: "" }), // blank → unassigned
      row({}), // missing column → unassigned
    ];
    const health = computeOperationalHealth(rows);
    expect(health.openCount).toBe(5);
    expect(health.unassigned.count).toBe(3);
    // Raw values are kept so the card can filter the Engineer column on click.
    expect(new Set(health.unassigned.values)).toEqual(new Set(["Manual Entry Required", ""]));
  });
});
