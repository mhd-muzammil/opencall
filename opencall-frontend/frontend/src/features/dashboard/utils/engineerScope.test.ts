import { describe, expect, it } from "vitest";
import { engineersForAspCode, type RegionScopedEngineer } from "./engineerScope";

// Region records carry a short code and a name; report rows carry ASP
// work-location codes. ASPS01461 is CHENNAI, ASPS01511 is HOSUR.
const chennai = { engineerName: "Praveen", regionCode: "CHN", regionName: "CHENNAI" };
const hosur = { engineerName: "Samim", regionCode: "HOS", regionName: "HOSUR" };
const vellore = { engineerName: "Jeeva", regionCode: "VEL", regionName: "VELLORE" };
const all = [chennai, hosur, vellore];

describe("engineersForAspCode", () => {
  it("offers only the selected ASP's engineers", () => {
    expect(engineersForAspCode(all, "ASPS01461")).toEqual([chennai]);
    expect(engineersForAspCode(all, "ASPS01511")).toEqual([hosur]);
  });

  it("offers everyone when nothing is selected", () => {
    expect(engineersForAspCode(all, null)).toEqual(all);
    expect(engineersForAspCode(all, "")).toEqual(all);
  });

  it("treats the all-regions sentinel as no selection", () => {
    expect(engineersForAspCode(all, "ALL")).toEqual(all);
    expect(engineersForAspCode(all, "all")).toEqual(all);
  });

  it("matches case- and whitespace-insensitively", () => {
    expect(engineersForAspCode(all, "  asps01461 ")).toEqual([chennai]);
  });

  it("falls open when no engineer carries region information", () => {
    // An older API build omits regionCode/regionName. Showing everyone is
    // recoverable; showing nobody would block scheduling entirely.
    // Typed as the payload shape with the region fields simply absent, which is
    // what an older API returns — an untyped literal shares no property with
    // RegionScopedEngineer and would not compile.
    const legacy: RegionScopedEngineer[] = [
      { engineerName: "Praveen" } as RegionScopedEngineer,
      { engineerName: "Samim" } as RegionScopedEngineer,
    ];
    expect(engineersForAspCode(legacy, "ASPS01461")).toEqual(legacy);
  });

  it("falls open when the selection matches no engineer", () => {
    // A region with no engineers on file must not produce a dead-end picker:
    // scheduling requires an engineer, so an empty list traps the user.
    expect(engineersForAspCode(all, "ASPS09999")).toEqual(all);
  });

  it("keeps engineers whose region is known by code alone", () => {
    const codeOnly = [{ engineerName: "Praveen", regionCode: "CHENNAI", regionName: "" }];
    expect(engineersForAspCode(codeOnly, "ASPS01461")).toEqual(codeOnly);
  });
});
