// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeliveryChallan } from "../../../lib/deliveryChallanApiClient";
import { DeliveryChallanPrint } from "./DeliveryChallanPrint";

/**
 * The printed challan, checked against the owner's own sample: Hosur's DC 67 of 2026-2027,
 * two laptops and two parts. Every field the template has must come out, where it has it.
 */

const SAMPLE: DeliveryChallan = {
  id: "67",
  branchKey: "hosur",
  finYear: "2026-2027",
  dcSeq: 67,
  challanDate: "2026-10-07",
  branchHeader: {
    branchKey: "hosur",
    name: "Hosur",
    companyLine: "Renderways Technologies –",
    addressLines: "L-88A, Rayakottai Hudco, Opp-Murugan Temple\nHosur – 635109",
    gstin: "33AALCR1788A1ZG",
    contact: "+916383428751",
    email: "hosur@renderways.in",
  },
  customerName: "Elancheran M",
  customerPhone: "9789 72876",
  customerEmail: "elancheran.m@deltaww.com",
  customerAddress:
    "Unit, Delta SEZ notified at SY No.16/1B2B&16/1B2A Plot No.1, Industrial Park, Kurubarapalli Village",
  caseIds: "5163299011\n5165190448",
  productSerials: "5CG303425X\n5CD51259LX",
  productNumbers: "402Y3PC\n89T30PC",
  productNames:
    "HP EliteBook x360 830 G8 Notebook PC (17N15AV)\nHP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
  refNoDate: "",
  modeTerms: "",
  otherReferences: "",
  items: [
    { description: "SPS-TOPCOVER W/KB CP BL INDIA", hsnSac: "84716040", qty: "01", rate: "", per: "" },
    { description: "SPS-CABLE KIT LCD 13", hsnSac: "85444299", qty: "01", rate: "", per: "" },
  ],
  createdBy: "admin",
  createdAt: "2026-10-07T05:00:00Z",
  updatedBy: "",
  updatedAt: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

async function render(c: DeliveryChallan) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(DeliveryChallanPrint, { c }));
  });
}

const part = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
/** A cell's own lines, as separate blocks inside it. */
const lines = (id: string) => Array.from(part(id)?.children ?? []).map((el) => el.textContent);
/** The values printed side by side in a cell. */
const sideBySide = (id: string) =>
  Array.from(part(id)?.querySelectorAll("span") ?? []).map((el) => el.textContent);

describe("DeliveryChallanPrint", () => {
  it("is one A4 sheet titled as the template, with its typo corrected", async () => {
    await render(SAMPLE);
    const sheet = container.querySelector<HTMLElement>(".deliveryChallanSheet")!;
    expect(sheet.style.width).toBe("210mm");
    expect(part("dc-title")?.textContent).toBe("DELIVERY CHALLAN (Warranty Replacement)");
    expect(sheet.textContent).not.toContain("DELEVERY");
  });

  it("puts the yellow 'returnable' band under the title, kept yellow when printed", async () => {
    await render(SAMPLE);
    const band = part("dc-band")!;
    expect(band.textContent).toBe("Defective parts should be returnable");
    expect(band.getAttribute("style")).toMatch(/background: (#ffff00|rgb\(255, 255, 0\))/i);
    expect(band.getAttribute("style")).toContain("print-color-adjust: exact");
  });

  it("prints the number with its financial year under it, and the date as DD-MM-YYYY", async () => {
    await render(SAMPLE);
    expect(lines("dc-number")).toEqual(["DC No. 67", "2026-2027"]);
    expect(part("dc-date")?.textContent).toBe("Date: 07-10-2026");
  });

  it("prints the letterhead from the challan's own copy, line by line as the template", async () => {
    await render(SAMPLE);
    expect(lines("dc-header")).toEqual([
      "Renderways Technologies –",
      "L-88A, Rayakottai Hudco, Opp-Murugan Temple",
      "Hosur – 635109",
      "GSTIN/UIN: 33AALCR1788A1ZG",
      "Contact: +916383428751",
      "E-Mail: hosur@renderways.in",
    ]);
  });

  it("prints the reference boxes as labels, with anything typed for them underneath", async () => {
    await render(SAMPLE);
    // The sample leaves them blank: only the labels print.
    expect(lines("dc-mode-terms")).toEqual(["Mode/Terms of Payment"]);
    expect(lines("dc-ref-no-date")).toEqual(["Ref No. & Date."]);
    expect(lines("dc-other-references")).toEqual(["Other References"]);
    expect(container.textContent).toContain("Product Serial");
    expect(container.textContent).toContain("Case ID");
    expect(container.textContent).toContain("Product Number");

    await act(async () => {
      root.render(
        createElement(DeliveryChallanPrint, {
          c: {
            ...SAMPLE,
            refNoDate: "PO 4471 / 05-10-2026",
            modeTerms: "Warranty – no charge",
            otherReferences: "WO 22113",
          },
        }),
      );
    });
    expect(lines("dc-ref-no-date")).toEqual(["Ref No. & Date.", "PO 4471 / 05-10-2026"]);
    expect(lines("dc-mode-terms")).toEqual(["Mode/Terms of Payment", "Warranty – no charge"]);
    expect(lines("dc-other-references")).toEqual(["Other References", "WO 22113"]);
  });

  it("prints the customer as the template: Name :, phone, e-mail, and the address in capitals", async () => {
    await render(SAMPLE);
    expect(part("dc-customer-name")?.textContent).toBe("Name :Elancheran M");
    expect(part("dc-customer-phone")?.textContent).toBe("9789 72876");
    expect(part("dc-customer-email")?.textContent).toBe("elancheran.m@deltaww.com");
    const address = part("dc-customer-address")!;
    expect(address.textContent).toBe(
      "UNIT, DELTA SEZ NOTIFIED AT SY NO.16/1B2B&16/1B2A PLOT NO.1, INDUSTRIAL PARK, KURUBARAPALLI VILLAGE",
    );
    expect(address.style.textAlign).toBe("center");
    expect(address.style.fontWeight).toBe("700");
  });

  it("prints several serials, case IDs and product numbers side by side, and each product name on a line of its own", async () => {
    await render(SAMPLE);
    expect(sideBySide("dc-serials")).toEqual(["5CG303425X", "5CD51259LX"]);
    expect(sideBySide("dc-case-ids")).toEqual(["5163299011", "5165190448"]);
    expect(sideBySide("dc-product-numbers")).toEqual(["402Y3PC", "89T30PC"]);
    expect(lines("dc-product-names")).toEqual([
      "HP EliteBook x360 830 G8 Notebook PC (17N15AV)",
      "HP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
    ]);
    expect(part("dc-product-names")?.style.fontWeight).toBe("700");
  });

  it("numbers the goods from 1 under the template's headings, with its empty right-hand column", async () => {
    await render(SAMPLE);
    const table = part("dc-items")!;
    const headings = Array.from(table.querySelectorAll("thead td")).map((td) => td.textContent);
    expect(headings).toEqual(["S. No", "Description of Goods", "HSN/\nSAC", "Qty", "Rate", "Per", ""]);
    const rows = Array.from(container.querySelectorAll('[data-testid="dc-item-row"]')).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ["1", "SPS-TOPCOVER W/KB CP BL INDIA", "84716040", "01", "", "", ""],
      ["2", "SPS-CABLE KIT LCD 13", "85444299", "01", "", "", ""],
    ]);
  });

  it("runs the goods table's column rules from its heading to the foot of the page", async () => {
    await render(SAMPLE);
    const goods = part("dc-items")!.parentElement!;
    // The goods area takes the rest of the sheet, and the rules span all of it.
    expect(goods.style.flex).toMatch(/^1/);
    const rules = Array.from(goods.querySelectorAll<HTMLElement>('[aria-hidden="true"] > div'));
    expect(rules.map((rule) => rule.style.left)).toEqual(["7.2%", "41.5%", "50.4%", "55.5%", "63.2%", "81.8%"]);
    expect(rules.every((rule) => rule.style.top === "0px" && rule.style.bottom === "0px")).toBe(true);
  });

  it("never prints 'null' or 'undefined' for a field the server left empty", async () => {
    await render({
      ...SAMPLE,
      customerPhone: null as unknown as string,
      refNoDate: undefined as unknown as string,
      branchHeader: { ...SAMPLE.branchHeader, gstin: null as unknown as string },
    });
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(lines("dc-header")).toContain("GSTIN/UIN: ");
  });
});
