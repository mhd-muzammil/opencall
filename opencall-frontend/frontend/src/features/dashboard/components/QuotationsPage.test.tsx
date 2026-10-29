// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuotationInput, Quotation } from "../../../lib/quotationApiClient";

/**
 * The Quotations section: Visit Quotation and Part Quotation as its two options, each its own
 * page — its own list, its own form, its own sheet — inside the one section.
 */

const api = vi.hoisted(() => ({
  listQuotations: vi.fn(),
  createQuotation: vi.fn(),
  updateQuotation: vi.fn(),
  autofillQuotation: vi.fn(),
  sendQuotation: vi.fn(),
  setQuotationPayment: vi.fn(),
}));
vi.mock("../../../lib/quotationApiClient", () => api);
vi.mock("../../../lib/customerEmailApiClient", () => ({
  getCustomerEmails: vi.fn().mockResolvedValue({ mailboxes: [] }),
}));

import { QuotationsPage } from "./QuotationsPage";

const item = {
  serviceDescription: "",
  productDescription: "HP Smart Tank 580 All-in-One Printer",
  modelNo: "TH57MBW1W7",
  serialNo: "1F3Y2A#ACJ",
  baseAmount: 550,
};

const VISIT_ROW: Quotation = {
  id: "v-1",
  kind: "VISIT",
  quotationNo: "RTPL/26-27/QEV/1",
  quotationDate: "2026-10-24",
  caseId: "5100000001",
  orderNumber: "WO-000000001",
  customerName: "Ravi Kumar",
  customerAddress: "",
  customerCity: "",
  customerState: "",
  customerPincode: "",
  customerPhone: "",
  customerEmail: "customer@example.com",
  ...item,
  sgstPercent: 9,
  cgstPercent: 9,
  createdBy: "office",
  createdAt: "2026-10-24T10:00:00Z",
  lineItems: [item],
};
const PART_ROW: Quotation = {
  ...VISIT_ROW,
  id: "p-80",
  kind: "PART",
  quotationNo: "RTPL/26-27/QEN/80",
  lineItems: [{ ...item, serviceDescription: "Service Charge", baseAmount: 950 }],
};
/** A row as a server from before Visit quotations sends it: no kind at all. */
const { kind: _none, ...OLD_ROW_FIELDS } = { ...PART_ROW, id: "p-79", quotationNo: "RTPL/26-27/QEN/79" };
const OLD_ROW = OLD_ROW_FIELDS as Quotation;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) => {
    const items = params.kind === "VISIT" ? [VISIT_ROW] : [PART_ROW, OLD_ROW];
    return { items, total: items.length, page: 1, perPage: 50, pages: 1 };
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(QuotationsPage, { token: "t" }));
  });
  await flush();
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panel = (label: string) =>
  container.querySelector<HTMLElement>(`[role="tabpanel"][aria-label="${label}"]`);
function button(scope: ParentNode, label: string) {
  return Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
}
const fieldLabels = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll("label")).map((l) => l.textContent?.trim());

/** Type into the input that follows this label, the way a person would. */
async function fill(scope: ParentNode, label: string, value: string) {
  const lbl = Array.from(scope.querySelectorAll("label")).find((l) => l.textContent?.trim() === label);
  const input = lbl?.nextElementSibling as HTMLInputElement | null;
  if (!input) throw new Error(`no field ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("QuotationsPage", () => {
  it("offers Visit Quotation and Part Quotation as the section's two options, Visit first", async () => {
    await mount();

    expect(tabs().map((t) => t.textContent)).toEqual(["Visit Quotation", "Part Quotation"]);
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(api.listQuotations).toHaveBeenCalledTimes(1);
    expect(api.listQuotations.mock.calls[0]![1]).toMatchObject({ kind: "VISIT", perPage: 50 });

    const visit = panel("Visit Quotation")!;
    expect(visit.querySelector("h2")?.textContent).toBe("Visit Quotations");
    expect(button(visit, "+ New Visit Quotation")).toBeDefined();
    expect(visit.textContent).toContain("RTPL/26-27/QEV/1");
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/80");
  });

  it("opens the Part page on its option, and keeps the Visit page as it was", async () => {
    await mount();
    await click(tabs()[1]);

    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(api.listQuotations.mock.calls[1]![1]).toMatchObject({ kind: "PART" });
    const part = panel("Part Quotation")!;
    expect(part.hidden).toBe(false);
    expect(part.querySelector("h2")?.textContent).toBe("Part Quotations");
    // Old rows, raised before kinds existed, are Part quotations.
    expect(part.textContent).toContain("RTPL/26-27/QEN/80");
    expect(part.textContent).toContain("RTPL/26-27/QEN/79");
    expect(part.textContent).not.toContain("RTPL/26-27/QEV/1");
    expect(panel("Visit Quotation")!.hidden).toBe(true);

    await click(tabs()[0]);
    expect(panel("Visit Quotation")!.hidden).toBe(false);
    // Kept, not rebuilt: going back asks the server nothing.
    expect(api.listQuotations).toHaveBeenCalledTimes(2);
  });

  it("raises a Visit quotation as a VISIT, with no service description to type", async () => {
    api.createQuotation.mockImplementation(async (_token: string, input: CreateQuotationInput) => ({
      ...VISIT_ROW,
      id: "v-2",
      quotationNo: "RTPL/26-27/QEV/2",
      customerName: input.customerName,
    }));
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(button(visit, "+ New Visit Quotation"));

    expect(fieldLabels(visit)).not.toContain("Service Description");
    expect(fieldLabels(visit)).toEqual(
      expect.arrayContaining(["Product Description", "Model No", "Serial No", "Amount (₹) *"]),
    );
    await fill(visit, "Customer Name *", "Ravi Kumar");
    await fill(visit, "Product Description", "HP Smart Tank 580 All-in-One Printer");
    await fill(visit, "Amount (₹) *", "550");
    await click(button(visit, "Save & generate quotation"));

    expect(api.createQuotation).toHaveBeenCalledTimes(1);
    const input = api.createQuotation.mock.calls[0]![1] as CreateQuotationInput;
    expect(input.kind).toBe("VISIT");
    expect(input.lineItems).toEqual([
      { serviceDescription: "", productDescription: "HP Smart Tank 580 All-in-One Printer", modelNo: "", serialNo: "", baseAmount: 550 },
    ]);
    // The sheet that opens is the Visit one.
    expect(document.body.textContent).toContain("Service Charge of HP Printer having details as");
    expect(container.textContent).not.toContain("recorded it as a Part quotation");
  });

  it("raises a Part quotation as a PART, service description and all", async () => {
    api.createQuotation.mockImplementation(async () => ({ ...PART_ROW, id: "p-81", quotationNo: "RTPL/26-27/QEN/81" }));
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;
    await click(button(part, "+ New Part Quotation"));

    expect(fieldLabels(part)).toContain("Service Description");
    await fill(part, "Customer Name *", "Ravi Kumar");
    await fill(part, "Service Description", "Service Charge");
    await fill(part, "Amount (₹) *", "950");
    await click(button(part, "Save & generate quotation"));

    const input = api.createQuotation.mock.calls[0]![1] as CreateQuotationInput;
    expect(input.kind).toBe("PART");
    expect(input.lineItems[0]!.serviceDescription).toBe("Service Charge");
  });

  it("sends an edit back as the kind the quotation was raised", async () => {
    api.updateQuotation.mockImplementation(async () => VISIT_ROW);
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(button(visit, "Edit"));

    expect(visit.textContent).toContain("Editing RTPL/26-27/QEV/1");
    expect(fieldLabels(visit)).not.toContain("Service Description");
    await click(button(visit, "Save changes"));

    expect(api.updateQuotation).toHaveBeenCalledTimes(1);
    expect(api.updateQuotation.mock.calls[0]![1]).toBe("v-1");
    expect((api.updateQuotation.mock.calls[0]![2] as CreateQuotationInput).kind).toBe("VISIT");
  });

  it("keeps a server's unfiltered rows out of the Visit page", async () => {
    // A server from before Visit quotations ignores the kind and sends everything.
    api.listQuotations.mockImplementation(async () => ({
      items: [VISIT_ROW, PART_ROW, OLD_ROW],
      total: 3,
      page: 1,
      perPage: 50,
      pages: 1,
    }));
    await mount();

    const visit = panel("Visit Quotation")!;
    expect(visit.textContent).toContain("RTPL/26-27/QEV/1");
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/80");
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/79");
  });

  it("says so when the server saved a Visit quotation as a Part one", async () => {
    // What a server not yet updated answers: a QEN number and no kind.
    api.createQuotation.mockImplementation(async () => ({ ...OLD_ROW, id: "p-81", quotationNo: "RTPL/26-27/QEN/81" }));
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(button(visit, "+ New Visit Quotation"));
    await fill(visit, "Customer Name *", "Ravi Kumar");
    await fill(visit, "Amount (₹) *", "550");
    await click(button(visit, "Save & generate quotation"));

    expect(visit.textContent).toContain(
      "Saved as RTPL/26-27/QEN/81, but the server recorded it as a Part quotation",
    );
  });
});
