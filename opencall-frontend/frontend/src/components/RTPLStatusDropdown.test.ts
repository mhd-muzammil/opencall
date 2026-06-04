import { describe, expect, it } from "vitest";
import { splitStatusGroupsForColumns } from "./RTPLStatusDropdown";

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
