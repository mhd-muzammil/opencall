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
  // Raised after the page's fresh start (29 Oct 2026), as Postgres writes the moment.
  createdAt: "2026-10-29 11:30:00.123456+05:30",
  lineItems: [item],
};
const PART_ROW: Quotation = {
  ...VISIT_ROW,
  id: "p-81",
  kind: "PART",
  quotationNo: "RTPL/26-27/QEN/81",
  createdAt: "2026-10-29 12:30:00+05:30",
  lineItems: [{ ...item, serviceDescription: "Service Charge", baseAmount: 950 }],
};
/** A row as a server from before Visit quotations sends it: no kind at all, and raised before
 *  the fresh start, so it belongs to the History. */
const { kind: _none, ...OLD_ROW_FIELDS } = {
  ...PART_ROW,
  id: "p-80",
  quotationNo: "RTPL/26-27/QEN/80",
  createdAt: "2026-10-24 10:00:00+05:30",
};
const OLD_ROW = OLD_ROW_FIELDS as Quotation;

const FRESH_START = "2026-10-28T18:30:00.000Z";
const at = (q: Quotation) => Date.parse(q.createdAt.replace(" ", "T"));

/** The server's answer: one kind, on one side of a moment, as the API filters. */
function answer(rows: Quotation[], params: { kind?: string; createdFrom?: string; createdBefore?: string }) {
  const items = rows.filter(
    (q) =>
      (!params.kind || (q.kind ?? "PART") === params.kind) &&
      (!params.createdFrom || at(q) >= Date.parse(params.createdFrom)) &&
      (!params.createdBefore || at(q) < Date.parse(params.createdBefore)),
  );
  return { items, total: items.length, page: 1, perPage: 100, pages: 1 };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) =>
    answer([VISIT_ROW, PART_ROW, OLD_ROW], params),
  );
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
    // The page's own quotations and its History, asked for apart.
    expect(api.listQuotations).toHaveBeenCalledTimes(2);
    expect(api.listQuotations.mock.calls.map((c) => c[1])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "VISIT", createdFrom: FRESH_START, page: 1, perPage: 100 }),
        expect.objectContaining({ kind: "VISIT", createdBefore: FRESH_START, page: 1, perPage: 100 }),
      ]),
    );

    const visit = panel("Visit Quotation")!;
    expect(visit.querySelector("h2")?.textContent).toBe("Visit Quotations");
    expect(button(visit, "+ New Visit Quotation")).toBeDefined();
    expect(visit.textContent).toContain("RTPL/26-27/QEV/1");
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/80");
    // Nothing raised before the fresh start, so no History to offer.
    expect(visit.textContent).not.toContain("History");
  });

  it("opens the Part page on its option, and keeps the Visit page as it was", async () => {
    await mount();
    await click(tabs()[1]);

    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(api.listQuotations.mock.calls.slice(2).map((c) => c[1].kind)).toEqual(["PART", "PART"]);
    const part = panel("Part Quotation")!;
    expect(part.hidden).toBe(false);
    expect(part.querySelector("h2")?.textContent).toBe("Part Quotations");
    expect(part.textContent).toContain("RTPL/26-27/QEN/81");
    expect(part.textContent).not.toContain("RTPL/26-27/QEV/1");
    expect(panel("Visit Quotation")!.hidden).toBe(true);

    await click(tabs()[0]);
    expect(panel("Visit Quotation")!.hidden).toBe(false);
    // Kept, not rebuilt: going back asks the server nothing.
    expect(api.listQuotations).toHaveBeenCalledTimes(4);
  });

  it("keeps the quotations from before 29 Oct under History, closed until opened", async () => {
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;

    // An old row, raised before kinds existed, is a Part one — and History, not the list.
    expect(part.textContent).not.toContain("RTPL/26-27/QEN/80");
    const toggle = button(part, "▸ History (1)");
    expect(toggle).toBeDefined();
    expect(toggle!.getAttribute("aria-expanded")).toBe("false");
    expect(part.textContent).toContain("Raised before 29 Oct 2026 · not counted in the boxes above");

    await click(toggle);
    expect(button(part, "▾ History (1)")!.getAttribute("aria-expanded")).toBe("true");
    const tables = part.querySelectorAll("table");
    expect(tables).toHaveLength(2);
    expect(tables[0]!.textContent).toContain("RTPL/26-27/QEN/81");
    expect(tables[0]!.textContent).not.toContain("RTPL/26-27/QEN/80");
    expect(tables[1]!.textContent).toContain("RTPL/26-27/QEN/80");
    expect(tables[1]!.textContent).not.toContain("RTPL/26-27/QEN/81");
    // Still worked like any other row.
    expect(button(tables[1]!, "View / Print")).toBeDefined();
    expect(button(tables[1]!, "Edit")).toBeDefined();
  });

  it("counts only the quotations raised since 29 Oct in the boxes", async () => {
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;
    const created = Array.from(part.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Created"));
    // QEN/81 is new and not mailed; QEN/80 is History and not counted.
    expect(created?.textContent).toBe("Created1not mailed yet");
  });

  it("never shows a row twice when the server ignores the moment filters", async () => {
    // A server from before the History split sends every row to both questions.
    api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) =>
      answer([VISIT_ROW, PART_ROW, OLD_ROW], { ...(params.kind ? { kind: params.kind } : {}) }),
    );
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;
    await click(button(part, "▸ History (1)"));
    const tables = part.querySelectorAll("table");
    expect(tables[0]!.textContent).not.toContain("RTPL/26-27/QEN/80");
    expect(tables[1]!.textContent).not.toContain("RTPL/26-27/QEN/81");
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
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/81");
    expect(visit.textContent).not.toContain("RTPL/26-27/QEN/80");
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
