import { describe, expect, it } from "vitest";
import { ALL_DEPARTMENTS, departmentOptions, inDepartment } from "./rosterDepartments";

const rows = [
  { engineer_name: "Kausar Basha", department: "FSE" },
  { engineer_name: "Swetha", department: "Office" },
  { engineer_name: "Agalya A", department: "Backend" },
  { engineer_name: "Swetha Two", department: "backend " },
  { engineer_name: "SUNTECH", department: null },
  // A Payroll not yet redeployed sends no department at all: the key is absent.
  { engineer_name: "Old Payroll" },
];

describe("departmentOptions", () => {
  it("lists each department once, whatever its case or spaces, A to Z", () => {
    expect(departmentOptions(rows)).toEqual(["Backend", "FSE", "Office"]);
  });

  it("is empty when no row has a department", () => {
    expect(departmentOptions([{ department: null }, { department: "  " }])).toEqual([]);
  });
});

describe("inDepartment", () => {
  it("All is every row, in the same order", () => {
    expect(inDepartment(rows, ALL_DEPARTMENTS)).toEqual(rows);
  });

  it("keeps only that department, matching across case and spaces", () => {
    expect(inDepartment(rows, "Backend").map((r) => r.engineer_name)).toEqual(["Agalya A", "Swetha Two"]);
    expect(inDepartment(rows, "fse").map((r) => r.engineer_name)).toEqual(["Kausar Basha"]);
  });

  it("a row with no department is in no department", () => {
    for (const department of departmentOptions(rows)) {
      expect(inDepartment(rows, department).some((r) => r.engineer_name === "SUNTECH")).toBe(false);
    }
  });
});
