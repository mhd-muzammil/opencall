import { describe, expect, it } from "vitest";
import { buildPickerGroups, buildStatusGroups, splitStatusGroupsForColumns } from "./RTPLStatusDropdown";

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

describe("buildPickerGroups", () => {
  // The regression this guards. The picker used to substitute the hardcoded
  // RTPL_STATUS_GROUPS whenever the admin-managed list was empty — which is
  // every render before the fetch lands, and every render after it fails or
  // 401s. That put statuses the admin had retired straight back in front of
  // users, indistinguishable from live ones.
  it("offers ONLY manual entry when the admin list has not loaded", () => {
    expect(buildPickerGroups(undefined)).toEqual([
      { group: "Other", options: ["Custom"] },
    ]);
    expect(buildPickerGroups([])).toEqual([
      { group: "Other", options: ["Custom"] },
    ]);
  });

  it("appends the manual-entry group after the admin's own groups", () => {
    expect(
      buildPickerGroups([{ group: "General Activity", options: ["Onsite"] }]),
    ).toEqual([
      { group: "General Activity", options: ["Onsite"] },
      { group: "Other", options: ["Custom"] },
    ]);
  });

  it("merges into an admin-created 'Other' rather than duplicating it", () => {
    expect(
      buildPickerGroups([{ group: "Other", options: ["CX Denied Service"] }]),
    ).toEqual([{ group: "Other", options: ["CX Denied Service", "Custom"] }]);
  });
});
