import { describe, expect, it } from "vitest";
import { buildStatusGroups, splitStatusGroupsForColumns } from "./RTPLStatusDropdown";

describe("splitStatusGroupsForColumns", () => {
  it("keeps the status picker columns balanced by option count", () => {
    const groups = [
      { group: "General Activity", options: ["A", "B", "C", "D", "E", "F", "G"] },
      { group: "Scheduling & Engineer", options: ["A", "B", "C"] },
      { group: "Parts & Inventory", options: ["A", "B", "C", "D"] },
      { group: "Quotations & Payments", options: ["A", "B", "C"] },
      { group: "Visitation & Estimates", options: ["A", "B", "C", "D"] },
      { group: "Cancellations & Closures", options: ["A", "B", "C"] },
      { group: "Returns & Yank", options: ["A", "B"] },
      { group: "Elevations / Escalations", options: ["A", "B"] },
      { group: "Validation & Testing", options: ["A", "B"] },
      { group: "Other", options: ["Custom"] },
    ] as const;

    const columns = splitStatusGroupsForColumns(groups);
    const leftWeight = columns[0].reduce((total, group) => total + group.options.length + 1, 0);
    const rightWeight = columns[1].reduce((total, group) => total + group.options.length + 1, 0);

    expect(columns).toHaveLength(2);
    expect(Math.abs(leftWeight - rightWeight)).toBeLessThanOrEqual(2);
  });
});

describe("buildStatusGroups", () => {
  it("groups statuses by category, preserving API (sort) order", () => {
    const groups = buildStatusGroups([
      { id: "1", name: "Actionable", category: "General Activity" },
      { id: "2", name: "CX Pending", category: "General Activity" },
      { id: "3", name: "Part Order Pending", category: "Parts & Inventory" },
    ]);

    expect(groups).toEqual([
      { group: "General Activity", options: ["Actionable", "CX Pending"] },
      { group: "Parts & Inventory", options: ["Part Order Pending"] },
    ]);
  });

  it("does not re-open a category once another has appeared (first-seen order)", () => {
    const groups = buildStatusGroups([
      { id: "1", name: "A", category: "X" },
      { id: "2", name: "B", category: "Y" },
      { id: "3", name: "C", category: "X" },
    ]);

    expect(groups).toEqual([
      { group: "X", options: ["A", "C"] },
      { group: "Y", options: ["B"] },
    ]);
  });

  it("falls back to 'Other' when a category is empty", () => {
    const groups = buildStatusGroups([{ id: "1", name: "A", category: "" }]);
    expect(groups).toEqual([{ group: "Other", options: ["A"] }]);
  });

  it("returns an empty array for no statuses", () => {
    expect(buildStatusGroups([])).toEqual([]);
  });
});
