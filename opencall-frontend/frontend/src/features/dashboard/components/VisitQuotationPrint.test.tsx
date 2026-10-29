// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Quotation } from "../../../lib/quotationApiClient";
import { QUOTATION_TERMS } from "../../../lib/quotationFormat";
import { QuotationPrint } from "./QuotationPrint";
import { QUOTATION_PART_QR_DATA_URL, QUOTATION_QR_DATA_URL } from "./quotationAssets";

/**
 * The Visit and Part sheets, checked against the office's own samples: the visit quotation
 * 5166159539.pdf (one printer at 550 + 9% + 9% = 649) and the part quotation
 * RTPL_26-27_QEN_80.pdf. Customer details here are made up.
 */

const VISIT: Quotation = {
  id: "q-1",
  kind: "VISIT",
  quotationNo: "RTPL/26-27/QEV/1",
  quotationDate: "2026-10-24",
  caseId: "5100000001",
  orderNumber: "WO-000000001",
  customerName: "Ravi Kumar",
  customerAddress: "14 Angala Nagar, Parivakkam",
  customerCity: "Poonamallee",
  customerState: "Tamilnadu",
  customerPincode: "600056",
  customerPhone: "9000000000",
  customerEmail: "customer@example.com",
  serviceDescription: "",
  productDescription: "HP Smart Tank 580 All-in-One Printer",
  modelNo: "TH57MBW1W7",
  serialNo: "1F3Y2A#ACJ",
  baseAmount: 550,
  sgstPercent: 9,
  cgstPercent: 9,
  createdBy: "office",
  createdAt: "2026-10-24T10:00:00Z",
  lineItems: [
    {
      serviceDescription: "",
      productDescription: "HP Smart Tank 580 All-in-One Printer",
      modelNo: "TH57MBW1W7",
      serialNo: "1F3Y2A#ACJ",
      baseAmount: 550,
    },
  ],
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

async function render(q: Quotation) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(QuotationPrint, { q }));
  });
}

const text = () => container.textContent ?? "";
/** The table row holding this text, as its cells' text. */
function rowOf(needle: string): string[] {
  const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
    Array.from(tr.cells).some((td) => td.textContent?.trim() === needle),
  );
  return row ? Array.from(row.cells).map((td) => td.textContent?.trim() ?? "") : [];
}
const images = () => Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));

describe("the Visit quotation sheet", () => {
  it("is one A4 sheet the print popup can copy on its own", async () => {
    await render(VISIT);
    const sheets = container.querySelectorAll<HTMLElement>(".quotationSheet");
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.style.width).toBe("210mm");
    // Nothing but inline styles and data URLs reach the popup.
    expect(images().every((src) => src?.startsWith("data:image/"))).toBe(true);
  });

  it("carries the header as the sample does, the customer's email included", async () => {
    await render(VISIT);
    for (const line of [
      "QUOTATION",
      "RENDERWAYS TECHNOLOGY PVT LTD",
      "Quotation Date :",
      "24 October 2026",
      "Quotation #",
      "RTPL/26-27/QEV/1",
      "CASE ID",
      "5100000001",
      "ORDER NUMBER",
      "WO-000000001",
      "To:",
      "Ravi Kumar",
      "14 Angala Nagar, Parivakkam",
      "Poonamallee",
      "600056",
      "9000000000",
      "customer@example.com",
    ]) {
      expect(text()).toContain(line);
    }
  });

  it("heads the units with the service charge line and prices each unit on its own row", async () => {
    await render(VISIT);
    expect(rowOf("Service Charge of HP Printer having details as")).toEqual([
      "Service Charge of HP Printer having details as",
      "",
    ]);
    expect(rowOf("Description")).toEqual(["Description", "Model No", "Sl.No", ""]);
    expect(rowOf("HP Smart Tank 580 All-in-One Printer")).toEqual([
      "HP Smart Tank 580 All-in-One Printer",
      "TH57MBW1W7",
      "1F3Y2A#ACJ",
      "550.00",
    ]);
  });

  it("adds up to the sample's 649.00, in words without the sample's misspelling", async () => {
    await render(VISIT);
    expect(rowOf("Total Amount")).toEqual(["Total Amount", "550.00"]);
    expect(rowOf("SGST @ 9 %")).toEqual(["SGST @ 9 %", "49.50"]);
    expect(rowOf("CGST @ 9 %")).toEqual(["CGST @ 9 %", "49.50"]);
    expect(rowOf("Total TAX Amount")).toEqual(["Total TAX Amount", "99.00"]);
    expect(rowOf("Total Quotation Value")).toEqual(["Total Quotation Value", "649.00"]);
    expect(text()).toContain("Rupees Six Hundred Forty Nine Only");
    expect(text()).not.toContain("FourtyNine");
  });

  it("keeps the template's two unit rows: one empty under a single unit, none under two", async () => {
    await render(VISIT);
    const unitRowsWithOne = container.querySelectorAll("tr").length;
    await act(async () => root.unmount());
    container.replaceChildren();

    await render({
      ...VISIT,
      lineItems: [...VISIT.lineItems, { ...VISIT.lineItems[0]!, productDescription: "HP DeskJet 2331", baseAmount: 400 }],
    });
    expect(container.querySelectorAll("tr").length).toBe(unitRowsWithOne);
    expect(rowOf("HP DeskJet 2331")[3]).toBe("400.00");
    expect(rowOf("Total Amount")).toEqual(["Total Amount", "950.00"]);
  });

  it("puts PAN, the signature and the bank lines inside the border, A. B. C. as the sample", async () => {
    await render(VISIT);
    expect(text()).toContain("PAN # AALCR1788A");
    expect(text()).toContain("For RENDERWAYS TECHNOLOGY PVT LTD");
    expect(text()).toContain("Authorized Signatory");
    expect(text()).toContain("THANKS FOR YOUR BUSINESS WITH US");
    expect(text()).toContain("A. Bank: Bank of Baroda, Maduravoyal, A/c : 43770200000450   IFSC Code: BARB0MADTHI");
    expect(text()).toContain(
      "B. Payments to be in advance and details of the payment to be shared on mail with us chennai@renderways.in",
    );
    expect(text()).toContain("C. Please refer the Terms and Conditions as mentioned in page 2");
    expect(text()).not.toContain("metioned");
  });

  it("prints page 2 with the GST note twice, every term, and the Bank of Baroda QR", async () => {
    await render(VISIT);
    const note = "*PLEASE SHARE YOUR GST NO AND ENTITY NAME IN CASE YOU NEED TO CLAIM THE INPUT TAX BENEFITS *";
    expect(text().split(note)).toHaveLength(3);
    QUOTATION_TERMS.forEach((term, i) => expect(text()).toContain(`${i + 1}. ${term}`));
    expect(text()).toContain("Company GSTIN No: 33AALCR1788A1ZG   Company PAN No   : AALCR1788A");
    expect(text()).toContain("Scan QR Code");
    expect(images()).toContain(QUOTATION_QR_DATA_URL);
    expect(images()).not.toContain(QUOTATION_PART_QR_DATA_URL);
  });
});

describe("the Part quotation sheet", () => {
  const PART: Quotation = {
    ...VISIT,
    kind: "PART",
    quotationNo: "RTPL/26-27/QEN/80",
    lineItems: [{ ...VISIT.lineItems[0]!, serviceDescription: "Service Charge", baseAmount: 950 }],
  };

  it("carries the Hp Care Chennai QR, as wide as the Part sample prints it", async () => {
    await render(PART);
    const qr = Array.from(container.querySelectorAll("img")).find(
      (img) => img.getAttribute("src") === QUOTATION_PART_QR_DATA_URL,
    );
    expect(qr).toBeDefined();
    expect(qr!.style.width).toBe("256px");
    expect(images()).not.toContain(QUOTATION_QR_DATA_URL);
    expect(QUOTATION_PART_QR_DATA_URL.startsWith("data:image/jpeg;base64,/9j/")).toBe(true);
  });

  it("is still the Part layout: no visit heading row, no email", async () => {
    await render(PART);
    expect(text()).toContain("Service Charge");
    expect(text()).not.toContain("Service Charge of HP Printer having details as");
    expect(text()).not.toContain("customer@example.com");
  });

  it("is what a quotation without a kind prints, as every one from before Visit quotations", async () => {
    const { kind: _kind, ...withoutKind } = PART;
    await render(withoutKind as Quotation);
    expect(images()).toContain(QUOTATION_PART_QR_DATA_URL);
    expect(text()).not.toContain("Service Charge of HP Printer having details as");
  });
});
