import { describe, expect, it } from "vitest";
import type { ChallanBranch, DeliveryChallanAutofill } from "./deliveryChallanApiClient";
import {
  appendLine,
  applyChallanAutofill,
  challanLines,
  challanRequestBody,
  emptyChallanForm,
  formatChallanDate,
  isBlankChallanItem,
  missingLetterhead,
  type DeliveryChallanForm,
} from "./deliveryChallanFormat";

const CASE_A: DeliveryChallanAutofill = {
  caseId: "5163299011",
  orderNumber: "WO-1",
  customerName: "Elancheran M",
  customerPhone: "9789 72876",
  customerEmail: "elancheran.m@deltaww.com",
  customerAddress: "Unit, Delta SEZ, Kurubarapalli Village",
  productSerial: "5CG303425X",
  productNumber: "402Y3PC",
  productName: "HP EliteBook x360 830 G8 Notebook PC (17N15AV)",
  items: [{ description: "SPS-TOPCOVER W/KB CP BL INDIA", hsnSac: "84716040", qty: "1", rate: "", per: "" }],
};

const CASE_B: DeliveryChallanAutofill = {
  caseId: "5165190448",
  orderNumber: "WO-2",
  customerName: "Someone Else",
  customerPhone: "90000 00000",
  customerEmail: "someone@example.com",
  customerAddress: "Elsewhere",
  productSerial: "5CD51259LX",
  productNumber: "89T30PC",
  productName: "HP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
  items: [{ description: "SPS-CABLE KIT LCD 13", hsnSac: "85444299", qty: "1", rate: "", per: "" }],
};

describe("formatChallanDate", () => {
  it("prints a date as DD-MM-YYYY", () => {
    expect(formatChallanDate("2026-10-07")).toBe("07-10-2026");
    expect(formatChallanDate("2027-03-31T00:00:00.000Z")).toBe("31-03-2027");
  });

  it("leaves anything that is not a date as it came", () => {
    expect(formatChallanDate("")).toBe("");
    expect(formatChallanDate("07/10/2026")).toBe("07/10/2026");
  });
});

describe("challanLines", () => {
  it("splits a one-per-line field, trimming each line and dropping blank ones", () => {
    expect(challanLines(" 5163299011 \r\n\n5165190448\n  ")).toEqual(["5163299011", "5165190448"]);
    expect(challanLines("")).toEqual([]);
    expect(challanLines(null)).toEqual([]);
  });
});

describe("appendLine", () => {
  it("adds a value as the new last line, and nothing for a blank value", () => {
    expect(appendLine("", "5163299011")).toBe("5163299011");
    expect(appendLine("5163299011\n", " 5165190448 ")).toBe("5163299011\n5165190448");
    expect(appendLine("5163299011", "  ")).toBe("5163299011");
  });
});

describe("applyChallanAutofill", () => {
  it("on an empty form: fills the customer, the case's lines, and puts its parts in place of the empty row", () => {
    const form = applyChallanAutofill(emptyChallanForm("2026-10-07"), CASE_A);
    expect(form.customerName).toBe("Elancheran M");
    expect(form.customerPhone).toBe("9789 72876");
    expect(form.customerEmail).toBe("elancheran.m@deltaww.com");
    expect(form.customerAddress).toBe("Unit, Delta SEZ, Kurubarapalli Village");
    expect(form.caseIds).toBe("5163299011");
    expect(form.productSerials).toBe("5CG303425X");
    expect(form.productNumbers).toBe("402Y3PC");
    expect(form.productNames).toBe("HP EliteBook x360 830 G8 Notebook PC (17N15AV)");
    expect(form.items).toEqual(CASE_A.items);
  });

  it("a second case is APPENDED: new lines, new rows, and the first customer kept", () => {
    const form = applyChallanAutofill(applyChallanAutofill(emptyChallanForm("2026-10-07"), CASE_A), CASE_B);
    expect(form.caseIds).toBe("5163299011\n5165190448");
    expect(form.productSerials).toBe("5CG303425X\n5CD51259LX");
    expect(form.productNumbers).toBe("402Y3PC\n89T30PC");
    expect(form.productNames).toBe(
      "HP EliteBook x360 830 G8 Notebook PC (17N15AV)\nHP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
    );
    expect(form.items.map((item) => item.description)).toEqual([
      "SPS-TOPCOVER W/KB CP BL INDIA",
      "SPS-CABLE KIT LCD 13",
    ]);
    expect(form.customerName).toBe("Elancheran M");
    expect(form.customerPhone).toBe("9789 72876");
    expect(form.customerAddress).toBe("Unit, Delta SEZ, Kurubarapalli Village");
  });

  it("never overwrites what was typed, and fills only the customer fields still empty", () => {
    const typed: DeliveryChallanForm = {
      ...emptyChallanForm("2026-10-07"),
      customerName: "Typed by hand",
      items: [{ description: "Typed part", hsnSac: "", qty: "2", rate: "", per: "" }],
    };
    const form = applyChallanAutofill(typed, CASE_A);
    expect(form.customerName).toBe("Typed by hand");
    expect(form.customerPhone).toBe("9789 72876");
    expect(form.items.map((item) => item.description)).toEqual(["Typed part", "SPS-TOPCOVER W/KB CP BL INDIA"]);
  });

  it("a case with no parts and no serial adds no blank row and no blank line", () => {
    const form = applyChallanAutofill(emptyChallanForm("2026-10-07"), {
      ...CASE_A,
      productSerial: "",
      items: [],
    });
    expect(form.productSerials).toBe("");
    expect(form.items).toEqual([{ description: "", hsnSac: "", qty: "", rate: "", per: "" }]);
  });
});

describe("challanRequestBody", () => {
  it("is exactly the contract's fields: trimmed, one-per-line fields cleaned, empty rows left out", () => {
    const form: DeliveryChallanForm = {
      ...emptyChallanForm("2026-10-07"),
      branchKey: "hosur",
      customerName: "  Elancheran M ",
      customerAddress: " Unit, Delta SEZ\nKurubarapalli Village ",
      caseIds: "5163299011\n\n 5165190448 \n",
      refNoDate: " PO 4471 ",
      items: [
        { description: " SPS-CABLE KIT LCD 13 ", hsnSac: "85444299", qty: "01", rate: "", per: "" },
        { description: "", hsnSac: "", qty: "", rate: "", per: "" },
      ],
    };
    const body = challanRequestBody(form, "hosur");
    expect(Object.keys(body).sort()).toEqual(
      [
        "branchKey", "challanDate", "customerName", "customerPhone", "customerEmail", "customerAddress",
        "caseIds", "productSerials", "productNumbers", "productNames", "refNoDate", "modeTerms",
        "otherReferences", "items",
      ].sort(),
    );
    expect(body.customerName).toBe("Elancheran M");
    expect(body.customerAddress).toBe("Unit, Delta SEZ\nKurubarapalli Village");
    expect(body.caseIds).toBe("5163299011\n5165190448");
    expect(body.refNoDate).toBe("PO 4471");
    expect(body.items).toEqual([
      { description: "SPS-CABLE KIT LCD 13", hsnSac: "85444299", qty: "01", rate: "", per: "" },
    ]);
  });

  it("knows an empty goods row when it sees one", () => {
    expect(isBlankChallanItem({ description: " ", hsnSac: "", qty: "", rate: "", per: "" })).toBe(true);
    expect(isBlankChallanItem({ description: "", hsnSac: "", qty: "1", rate: "", per: "" })).toBe(false);
  });
});

describe("missingLetterhead", () => {
  const branch = (overrides: Partial<ChallanBranch>): ChallanBranch => ({
    branchKey: "hosur",
    name: "Hosur",
    companyLine: "Renderways Technologies –",
    addressLines: "L-88A, Rayakottai Hudco, Opp-Murugan Temple\nHosur – 635109",
    gstin: "33AALCR1788A1ZG",
    contact: "+916383428751",
    email: "hosur@renderways.in",
    updatedAt: null,
    updatedBy: "",
    ...overrides,
  });

  it("names the parts of a letterhead still empty", () => {
    expect(missingLetterhead(branch({}))).toEqual([]);
    expect(
      missingLetterhead(
        branch({ branchKey: "salem", name: "Salem", companyLine: "", addressLines: "", gstin: "", contact: "", email: "" }),
      ),
    ).toEqual(["company line", "address", "GSTIN/UIN", "contact", "e-mail"]);
    expect(missingLetterhead(branch({ email: " " }))).toEqual(["e-mail"]);
  });

  it("says nothing when the branch is not known yet", () => {
    expect(missingLetterhead(undefined)).toEqual([]);
  });
});
