import { describe, expect, it } from "vitest";
import { countByRegion, UNASSIGNED_LABEL } from "./engineerRegionCounts";

const REGIONS = [
  { id: "r-salem", name: "Salem" },
  { id: "r-hosur", name: "Hosur" },
  { id: "r-vellore", name: "Vellore" },
];

const eng = (regionId: string) => ({ regionId });

describe("countByRegion", () => {
  it("counts the engineers in each region", () => {
    const rows = countByRegion(
      [eng("r-salem"), eng("r-salem"), eng("r-hosur")],
      REGIONS,
    );
    expect(rows.find((r) => r.name === "Salem")?.count).toBe(2);
    expect(rows.find((r) => r.name === "Hosur")?.count).toBe(1);
  });

  it("lists a region with nobody in it", () => {
    // The whole point. A hole in the roster is the most useful thing this can say, and it is
    // exactly what grouping the engineers alone cannot show — there are none to group by.
    const rows = countByRegion([eng("r-salem")], REGIONS);
    expect(rows.find((r) => r.name === "Vellore")).toEqual({
      id: "r-vellore",
      name: "Vellore",
      count: 0,
    });
  });

  it("puts the busiest region first", () => {
    const rows = countByRegion(
      [eng("r-hosur"), eng("r-hosur"), eng("r-hosur"), eng("r-salem")],
      REGIONS,
    );
    expect(rows.map((r) => r.name)).toEqual(["Hosur", "Salem", "Vellore"]);
  });

  it("breaks ties alphabetically rather than by whatever order they arrived in", () => {
    // Otherwise two regions on the same number swap places between renders.
    const rows = countByRegion([eng("r-vellore"), eng("r-salem")], REGIONS);
    expect(rows.map((r) => r.name)).toEqual(["Salem", "Vellore", "Hosur"]);
  });

  it("keeps engineers whose region has been deleted, under No region", () => {
    // Dropping them would make the region boxes quietly disagree with the Total Engineers
    // card sitting beside them.
    const rows = countByRegion([eng("r-salem"), eng("r-gone"), eng("")], REGIONS);
    expect(rows.find((r) => r.name === UNASSIGNED_LABEL)?.count).toBe(2);
  });

  it("adds up to the number of engineers it was given", () => {
    const engineers = [eng("r-salem"), eng("r-salem"), eng("r-hosur"), eng("r-gone")];
    const total = countByRegion(engineers, REGIONS).reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(engineers.length);
  });

  it("shows no No-region box when every engineer has one", () => {
    // An empty "No region" box is noise on a tidy roster, where an empty "Salem" box is news.
    const rows = countByRegion([eng("r-salem")], REGIONS);
    expect(rows.some((r) => r.name === UNASSIGNED_LABEL)).toBe(false);
  });

  it("is every region and nothing else when there are no engineers at all", () => {
    expect(countByRegion([], REGIONS).map((r) => r.count)).toEqual([0, 0, 0]);
  });

  it("is empty when there are no regions and no engineers", () => {
    expect(countByRegion([], [])).toEqual([]);
  });
});
