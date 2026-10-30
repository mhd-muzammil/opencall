// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuotationInput, Quotation, QuotationDraft } from "../../../lib/quotationApiClient";

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
  getQuotationSendDefaults: vi.fn(),
  getQuotation: vi.fn(),
  setQuotationPayment: vi.fn(),
  listQuotationDrafts: vi.fn(),
  approveQuotationDraft: vi.fn(),
  removeQuotationDraft: vi.fn(),
}));
vi.mock("../../../lib/quotationApiClient", () => api);
vi.mock("../../../lib/customerEmailApiClient", () => ({
  getCustomerEmails: vi.fn().mockResolvedValue({ mailboxes: [] }),
}));
// The sheet as a PDF needs a real browser to draw it (checked in Chrome, not here).
const pdf = vi.hoisted(() => ({ quotationPdf: vi.fn() }));
vi.mock("./quotationPdf", () => pdf);

import { getCustomerEmails } from "../../../lib/customerEmailApiClient";
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

/** What the report raised and nobody has approved: no number, no amount. */
const WAITING_VISIT: QuotationDraft = {
  id: "0b6f3b0e-1d2c-4c6e-9a51-000000000001",
  kind: "VISIT",
  ticketId: "WO-036404653",
  caseId: "5166159539",
  flexStatus: "Visit Estimate",
  workLocation: "VELLORE",
  customerName: "Likhitha",
  customerAddress: "12, Gandhi Road",
  customerCity: "Vellore",
  customerState: "Tamil Nadu",
  customerPincode: "632001",
  customerPhone: "9000000002",
  customerEmail: "likhitha@example.com",
  productDescription: "HP Smart Tank 581 All-in-One Printer",
  modelNo: "4A8D4A",
  serialNo: "CN43F65KWK",
  part: "",
  status: "WAITING",
  createdAt: "2026-10-29 15:45:00.5+05:30",
};
const WAITING_VISIT_2: QuotationDraft = {
  ...WAITING_VISIT,
  id: "0b6f3b0e-1d2c-4c6e-9a51-000000000003",
  ticketId: "WO-036394026",
  customerName: "Muthu",
};
const WAITING_PART: QuotationDraft = {
  ...WAITING_VISIT,
  id: "0b6f3b0e-1d2c-4c6e-9a51-000000000002",
  kind: "PART",
  ticketId: "WO-036403359",
  flexStatus: "Visit Quote To Customer",
  customerName: "Dinesh",
  part: "SPS-TOP COVER",
};

/** The server's waiting list: one kind, as the API filters. */
function waiting(rows: QuotationDraft[], params: { kind?: string }) {
  const items = rows.filter((d) => !params.kind || d.kind === params.kind);
  return { items, total: items.length };
}

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
  api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string }) =>
    waiting([WAITING_VISIT, WAITING_VISIT_2, WAITING_PART], params),
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

describe("Waiting Approval", () => {
  const tiles = (scope: ParentNode) =>
    Array.from(scope.querySelectorAll("button")).filter((b) => /^(Waiting Approval|Created|Sent)/.test(b.textContent ?? ""));
  const waitingTile = (scope: ParentNode) =>
    Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Waiting Approval"));
  const fieldValue = (scope: ParentNode, label: string) => {
    const lbl = Array.from(scope.querySelectorAll("label")).find((l) => l.textContent?.trim() === label);
    return (lbl?.nextElementSibling as HTMLInputElement | null)?.value;
  };

  it("counts what the report raised in a box of its own, left of Created", async () => {
    await mount();
    const visit = panel("Visit Quotation")!;

    expect(tiles(visit).map((b) => b.textContent)).toEqual([
      "Waiting Approval2from the report",
      "Created1not mailed yet",
      expect.stringMatching(/^Sent0/),
    ]);
    // Asked for this tab's kind only.
    expect(api.listQuotationDrafts).toHaveBeenCalledWith("t", { kind: "VISIT", search: "" });
  });

  it("lists them in place of the quotations when the box is clicked", async () => {
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));

    expect(visit.textContent).toContain("Showing waiting approval only.");
    const table = visit.querySelector("table")!;
    expect(table.textContent).toContain("WO-036404653");
    expect(table.textContent).toContain("Likhitha");
    expect(table.textContent).toContain("WO-036394026");
    // Not numbered, so not in the quotations' table, and that table is not on screen.
    expect(table.textContent).not.toContain("RTPL/26-27/QEV/1");
    expect(button(table, "Approve")).toBeDefined();
    expect(button(table, "Remove")).toBeDefined();
    // A Visit quotation prices the visit, so the case's part is not a column here.
    expect(Array.from(table.querySelectorAll("th")).map((th) => th.textContent)).not.toContain("Part");

    await click(waitingTile(visit));
    expect(visit.querySelector("table")!.textContent).toContain("RTPL/26-27/QEV/1");
  });

  it("approves one: the form opens filled in, the amount is typed, and the number comes back", async () => {
    api.approveQuotationDraft.mockImplementation(async (_token: string, _id: string, input: CreateQuotationInput) => ({
      ...VISIT_ROW,
      id: "v-2",
      quotationNo: "RTPL/26-27/QEV/2",
      orderNumber: input.orderNumber,
      customerName: input.customerName,
    }));
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));
    await click(button(visit.querySelector("table")!, "Approve"));

    expect(visit.textContent).toContain("Approving the waiting visit quotation for WO-036404653 (Flex Status: Visit Estimate)");
    expect(fieldValue(visit, "Order Number (WO)")).toBe("WO-036404653");
    expect(fieldValue(visit, "Customer Name *")).toBe("Likhitha");
    expect(fieldValue(visit, "Address")).toBe("12, Gandhi Road");
    expect(fieldValue(visit, "Model No")).toBe("4A8D4A");
    expect(fieldValue(visit, "Amount (₹) *")).toBe("");

    await fill(visit, "Amount (₹) *", "550");
    await click(button(visit, "Approve & generate quotation"));

    expect(api.createQuotation).not.toHaveBeenCalled();
    expect(api.approveQuotationDraft).toHaveBeenCalledTimes(1);
    const [, id, input] = api.approveQuotationDraft.mock.calls[0]! as [string, string, CreateQuotationInput];
    expect(id).toBe(WAITING_VISIT.id);
    expect(input).toMatchObject({
      kind: "VISIT",
      caseId: "5166159539",
      orderNumber: "WO-036404653",
      customerName: "Likhitha",
      customerEmail: "likhitha@example.com",
      lineItems: [
        {
          serviceDescription: "",
          productDescription: "HP Smart Tank 581 All-in-One Printer",
          modelNo: "4A8D4A",
          serialNo: "CN43F65KWK",
          baseAmount: 550,
        },
      ],
    });
    expect(container.textContent).toContain("Approved — RTPL/26-27/QEV/2 raised for WO-036404653.");
    // The sheet opens, as it does for one raised by hand, and the lists are asked again.
    expect(document.body.textContent).toContain("Service Charge of HP Printer having details as");
    expect(api.listQuotationDrafts.mock.calls.length).toBeGreaterThan(1);
  });

  it("will not approve without an amount", async () => {
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));
    await click(button(visit.querySelector("table")!, "Approve"));
    await click(button(visit, "Approve & generate quotation"));

    expect(api.approveQuotationDraft).not.toHaveBeenCalled();
    expect(visit.textContent).toContain("Enter an amount greater than 0 on at least one line item.");
  });

  it("says why when the server refuses the approval", async () => {
    api.approveQuotationDraft.mockRejectedValue(new Error("WO-036404653 already has RTPL/26-27/QEV/5. Remove this one instead."));
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));
    await click(button(visit.querySelector("table")!, "Approve"));
    await fill(visit, "Amount (₹) *", "550");
    await click(button(visit, "Approve & generate quotation"));

    expect(visit.textContent).toContain("WO-036404653 already has RTPL/26-27/QEV/5. Remove this one instead.");
  });

  it("removes one only after asking", async () => {
    api.removeQuotationDraft.mockResolvedValue({ ...WAITING_VISIT, status: "REMOVED" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));

    await click(button(visit.querySelector("table")!, "Remove"));
    expect(api.removeQuotationDraft).not.toHaveBeenCalled();

    await click(button(visit.querySelector("table")!, "Remove"));
    expect(confirm).toHaveBeenLastCalledWith("Remove the waiting visit quotation for WO-036404653? It will not come back.");
    expect(api.removeQuotationDraft).toHaveBeenCalledWith("t", WAITING_VISIT.id);
    expect(visit.textContent).toContain("Removed the waiting visit quotation for WO-036404653.");
    confirm.mockRestore();
  });

  it("shows the Part page its own waiting quotations, with the part each case needs", async () => {
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;

    expect(waitingTile(part)?.textContent).toBe("Waiting Approval1from the report");
    await click(waitingTile(part));
    const table = part.querySelector("table")!;
    expect(table.textContent).toContain("WO-036403359");
    expect(table.textContent).toContain("SPS-TOP COVER");
    expect(table.textContent).not.toContain("WO-036404653");
  });

  it("keeps the waiting one's WO while approving: fixed, and auto-fill looks it up by that alone", async () => {
    // What an auto-fill by case could bring back: a sibling work order on the same case.
    api.autofillQuotation.mockResolvedValue({
      caseId: "5166159539",
      orderNumber: "WO-036404999",
      customerName: "Likhitha R",
      customerAddress: "12, Gandhi Road",
      customerCity: "Vellore",
      customerState: "Tamil Nadu",
      customerPincode: "632001",
      customerPhone: "9000000002",
      customerEmail: "likhitha@example.com",
      productDescription: "HP Smart Tank 581 All-in-One Printer",
      modelNo: "4A8D4A",
      serialNo: "CN43F65KWK",
    });
    await mount();
    const visit = panel("Visit Quotation")!;
    await click(waitingTile(visit));
    await click(button(visit.querySelector("table")!, "Approve"));

    const wo = Array.from(visit.querySelectorAll("label"))
      .find((l) => l.textContent?.trim() === "Order Number (WO)")
      ?.nextElementSibling as HTMLInputElement;
    expect(wo.readOnly).toBe(true);
    await click(button(visit, "Auto-fill from case"));

    expect(api.autofillQuotation).toHaveBeenCalledWith("t", { orderNumber: "WO-036404653" });
    expect(fieldValue(visit, "Order Number (WO)")).toBe("WO-036404653");
    expect(fieldValue(visit, "Customer Name *")).toBe("Likhitha R");
  });

  it("names the part in the form when approving a Part one", async () => {
    await mount();
    await click(tabs()[1]);
    const part = panel("Part Quotation")!;
    await click(waitingTile(part));
    await click(button(part.querySelector("table")!, "Approve"));

    expect(part.textContent).toContain(
      "Approving the waiting part quotation for WO-036403359 (Flex Status: Visit Quote To Customer). Part: SPS-TOP COVER. Enter the amount",
    );
  });

  it("shows the newest search's waiting list when an earlier search answers last", async () => {
    await mount();
    const visit = panel("Visit Quotation")!;
    const pending: Array<{ search: string; resolve: (value: unknown) => void }> = [];
    api.listQuotationDrafts.mockImplementation(
      (_token: string, params: { search?: string }) =>
        new Promise((resolve) => pending.push({ search: params.search ?? "", resolve })),
    );
    const box = visit.querySelector<HTMLInputElement>('input[type="search"]')!;
    const type = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, value);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("WO-036");
    await type("WO-0363940");

    // The narrow search answers first, the wide one after it.
    await act(async () => {
      pending.find((p) => p.search === "WO-0363940")!.resolve(waiting([WAITING_VISIT_2], {}));
    });
    await act(async () => {
      pending.find((p) => p.search === "WO-036")!.resolve(waiting([WAITING_VISIT, WAITING_VISIT_2], {}));
    });
    await flush();

    expect(waitingTile(visit)?.textContent).toBe("Waiting Approval1from the report");
  });

  it("adds up to the Records page's count: what waits, and why the rest does not", async () => {
    api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string; search?: string }) => ({
      ...waiting([WAITING_VISIT, WAITING_VISIT_2, WAITING_PART], params),
      report: {
        onReport: 5,
        notWaiting: [
          { ticketId: "WO-035461827", reason: "QUOTED", quotationNos: ["RTPL/26-27/QEV/48"] },
          { ticketId: "WO-035887044", reason: "QUOTED", quotationNos: ["RTPL/26-27/QEV/72", "RTPL/26-27/QEV/79"] },
          { ticketId: "WO-036159873", reason: "REMOVED", quotationNos: [] },
        ],
      },
    }));
    await mount();
    const visit = panel("Visit Quotation")!;

    expect(waitingTile(visit)?.textContent).toBe("Waiting Approval2of 5 on the report · 2 already quoted · 1 removed");
    await click(waitingTile(visit));
    const text = visit.textContent ?? "";
    expect(text).toContain("The Records page shows 5 at Flex Status Visit Estimate (01-Trade): 2 waiting below, 3 not:");
    expect(text).toContain(
      "Already quoted (2): WO-035461827 (RTPL/26-27/QEV/48) · WO-035887044 (RTPL/26-27/QEV/72, RTPL/26-27/QEV/79)",
    );
    expect(text).toContain("Removed (1): WO-036159873");

    // A search narrows the list, not the report: the split is not offered against it.
    const box = visit.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, "Likhitha");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(waitingTile(visit)?.textContent).toBe("Waiting Approval2from the report");
    expect(visit.textContent).not.toContain("The Records page shows");
  });

  it("shows the waiting approvals by location above the boxes, and lists one branch's on a click", async () => {
    const at = (id: string, ticketId: string, workLocation: string): QuotationDraft => ({
      ...WAITING_VISIT,
      id,
      ticketId,
      workLocation,
    });
    api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string }) =>
      waiting(
        [
          at("0b6f3b0e-1d2c-4c6e-9a51-0000000000a1", "WO-000000001", "ASPS01461"),
          at("0b6f3b0e-1d2c-4c6e-9a51-0000000000a2", "WO-000000002", "ASPS01511"),
          at("0b6f3b0e-1d2c-4c6e-9a51-0000000000a3", "WO-000000003", "ASPS01461"),
          at("0b6f3b0e-1d2c-4c6e-9a51-0000000000a4", "WO-000000004", "VELLORE"),
          at("0b6f3b0e-1d2c-4c6e-9a51-0000000000a5", "WO-000000005", "SOMEWHERE ELSE"),
        ],
        params,
      ),
    );
    await mount();
    const visit = panel("Visit Quotation")!;
    const group = visit.querySelector('[role="group"][aria-label="Waiting approval by location"]')!;
    const cards = Array.from(group.querySelectorAll("button"));

    // All locations first, then one card per branch in the region bar's order, plus Other for
    // a location none of them is.
    expect(cards.map((c) => c.textContent)).toEqual([
      "All locations5waiting approval",
      "Chennai2waiting approval",
      "Hosur1waiting approval",
      "Kanchipuram0waiting approval",
      "Salem0waiting approval",
      "Vellore1waiting approval",
      "Other1waiting approval",
    ]);
    // Above the boxes, and adding up to the Waiting Approval box.
    expect(group.compareDocumentPosition(waitingTile(visit)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(waitingTile(visit)?.textContent).toBe("Waiting Approval5from the report");

    // All locations lists every branch's waiting approvals; a second click goes back.
    await click(cards[0]);
    expect(visit.textContent).toContain("Showing waiting approval only.");
    expect(visit.querySelector("table")!.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("true");
    await click(cards[0]);
    expect(visit.textContent).not.toContain("Showing waiting approval");
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("false");

    const chennai = cards[1]!;
    await click(chennai);
    expect(visit.textContent).toContain("Showing waiting approval · Chennai only.");
    let table = visit.querySelector("table")!;
    expect(Array.from(table.querySelectorAll("tbody tr")).map((r) => r.querySelector("td")?.textContent)).toEqual([
      "WO-000000001",
      "WO-000000003",
    ]);
    // The branch's name in the list too, its ASP code on hover.
    const location = Array.from(table.querySelectorAll("tbody td")).find((td) => td.textContent === "Chennai");
    expect(location?.getAttribute("title")).toBe("ASPS01461");
    expect(chennai.getAttribute("aria-pressed")).toBe("true");
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("false");

    await click(chennai);
    expect(visit.textContent).toContain("Showing waiting approval only.");
    table = visit.querySelector("table")!;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(cards[0]!.getAttribute("aria-pressed")).toBe("true");

    // All locations from a branch gives every branch back; another box keeps the branch.
    await click(cards[2]);
    expect(visit.textContent).toContain("Showing waiting approval · Hosur only.");
    await click(cards[0]);
    expect(visit.textContent).toContain("Showing waiting approval only.");
    await click(cards[2]);
    await click(Array.from(visit.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Created")));
    expect(visit.textContent).toContain("Showing created · Hosur only.");
    expect(cards[2]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("narrows every box and list to the branch a location card chose", async () => {
    // A Chennai quotation not mailed yet, and a Hosur one the customer has.
    const chennai: Quotation = { ...VISIT_ROW, id: "v-c", quotationNo: "RTPL/26-27/QEV/2", workLocation: "ASPS01461" };
    const hosur: Quotation = {
      ...VISIT_ROW,
      id: "v-h",
      quotationNo: "RTPL/26-27/QEV/3",
      workLocation: "ASPS01511",
      sentAt: "2026-10-29 16:00:00+05:30",
    };
    api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) =>
      answer([chennai, hosur, PART_ROW, OLD_ROW], params),
    );
    api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string }) => ({
      ...waiting(
        [
          { ...WAITING_VISIT, workLocation: "ASPS01461" },
          { ...WAITING_VISIT_2, workLocation: "ASPS01461" },
          { ...WAITING_PART, workLocation: "ASPS01511" },
        ],
        params,
      ),
      report: {
        onReport: 4,
        onReportByLocation: { ASPS01461: 3, ASPS01511: 1 },
        notWaiting: [
          { ticketId: "WO-035461827", workLocation: "ASPS01461", reason: "QUOTED", quotationNos: ["RTPL/26-27/QEV/48"] },
          { ticketId: "WO-036000001", workLocation: "ASPS01511", reason: "QUOTED", quotationNos: ["RTPL/26-27/QEV/50"] },
        ],
      },
    }));
    await mount();
    const visit = panel("Visit Quotation")!;
    const group = visit.querySelector('[role="group"][aria-label="Waiting approval by location"]')!;
    const card = (name: string) =>
      Array.from(group.querySelectorAll("button")).find((b) => b.textContent?.startsWith(name))!;
    const box = (name: string) =>
      Array.from(visit.querySelectorAll("button")).find((b) => b.parentElement !== group && b.textContent?.startsWith(name))!;

    // Each card carries its branch's share of the report, the way the box carries the whole.
    expect(card("All locations").textContent).toBe("All locations2of 4 on the report · 2 already quoted");
    expect(card("Chennai").textContent).toBe("Chennai2of 3 on the report · 1 already quoted");
    expect(card("Hosur").textContent).toBe("Hosur0of 1 on the report · 1 already quoted");
    expect(box("Created").textContent).toBe("Created1not mailed yet");
    expect(box("Sent").textContent).toMatch(/^Sent1/);

    await click(card("Hosur"));
    expect(box("Waiting Approval").textContent).toBe("Waiting Approval0of 1 on the report · 1 already quoted");
    expect(box("Created").textContent).toBe("Created0not mailed yet");
    expect(box("Sent").textContent).toMatch(/^Sent1/);
    await click(box("Sent"));
    expect(visit.textContent).toContain("Showing sent · Hosur only.");
    const rows = visit.querySelector("table")!.textContent ?? "";
    expect(rows).toContain("RTPL/26-27/QEV/3");
    expect(rows).not.toContain("RTPL/26-27/QEV/2");

    await click(card("Chennai"));
    expect(box("Created").textContent).toBe("Created1not mailed yet");
    expect(box("Sent").textContent).toMatch(/^Sent0/);
    expect(visit.textContent).toContain("Showing sent · Chennai only.");

    await click(card("All locations"));
    expect(visit.textContent).toContain("Showing sent only.");
    expect(box("Created").textContent).toBe("Created1not mailed yet");
    expect(box("Sent").textContent).toMatch(/^Sent1/);
    expect(box("Waiting Approval").textContent).toBe("Waiting Approval2of 4 on the report · 2 already quoted");
  });

  it("offers Other for a quotation in no branch, so the branch cards add up to All locations", async () => {
    // Raised by hand with no WO: Flex cannot place it, and no waiting row is Other.
    const chennai: Quotation = { ...VISIT_ROW, id: "v-c", quotationNo: "RTPL/26-27/QEV/2", workLocation: "ASPS01461" };
    const nowhere: Quotation = { ...VISIT_ROW, id: "v-n", quotationNo: "RTPL/26-27/QEV/4", orderNumber: "", workLocation: "" };
    api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) =>
      answer([chennai, nowhere], params),
    );
    api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string }) =>
      waiting([{ ...WAITING_VISIT, workLocation: "ASPS01461" }], params),
    );
    await mount();
    const visit = panel("Visit Quotation")!;
    const group = visit.querySelector('[role="group"][aria-label="Waiting approval by location"]')!;
    const card = (name: string) =>
      Array.from(group.querySelectorAll("button")).find((b) => b.textContent?.startsWith(name));
    const created = () =>
      Number(
        Array.from(visit.querySelectorAll("button"))
          .find((b) => b.parentElement !== group && b.textContent?.startsWith("Created"))!
          .textContent!.replace("Created", "")
          .replace("not mailed yet", ""),
      );

    expect(card("Other")?.textContent).toBe("Other0waiting approval");
    expect(created()).toBe(2);
    let sum = 0;
    for (const name of ["Chennai", "Hosur", "Kanchipuram", "Salem", "Vellore", "Other"]) {
      await click(card(name));
      sum += created();
      await click(card(name));
    }
    expect(sum).toBe(2);

    // Chosen, it stays on screen even with nothing left in it to wait.
    await click(card("Other"));
    expect(card("Other")?.getAttribute("aria-pressed")).toBe("true");
    expect(visit.textContent).toContain("Showing waiting approval · Other only.");
  });

  it("keeps the boxes whole with a server that sends no locations for quotations", async () => {
    // What a server from before Quotation.workLocation sends: no workLocation at all.
    api.listQuotationDrafts.mockImplementation(async (_token: string, params: { kind?: string }) =>
      waiting([{ ...WAITING_VISIT, workLocation: "ASPS01461" }], params),
    );
    await mount();
    const visit = panel("Visit Quotation")!;
    const group = visit.querySelector('[role="group"][aria-label="Waiting approval by location"]')!;
    const chennai = Array.from(group.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Chennai"))!;
    const createdBox = () =>
      Array.from(visit.querySelectorAll("button")).find((b) => b.parentElement !== group && b.textContent?.startsWith("Created"));

    expect(createdBox()?.textContent).toBe("Created1not mailed yet");
    await click(chennai);
    expect(createdBox()?.textContent).toBe("Created1not mailed yet");
  });

  it("keeps the page working when the waiting list cannot be loaded", async () => {
    api.listQuotationDrafts.mockRejectedValue(new Error("Request failed 500"));
    await mount();
    const visit = panel("Visit Quotation")!;

    expect(waitingTile(visit)?.textContent).toBe("Waiting Approval—could not load");
    expect(visit.textContent).toContain("RTPL/26-27/QEV/1");
    await click(waitingTile(visit));
    expect(visit.textContent).toContain("Could not load the waiting quotations: Request failed 500");
  });
});

/**
 * Sending. A Visit quotation goes out as the trade desk's own mail — from trade@, copied to
 * the desk's two and the customer's branch, the sheet attached as a PDF. A Part quotation
 * keeps the send it has always had until its format is given.
 */
describe("sending a quotation", () => {
  const DEFAULTS = {
    kind: "VISIT",
    from: "trade@renderways.in",
    subject: "WO-000000001-5100000001- Trade",
    cc: ["radhika@renderways.in", "dinesh@renderways.in", "vellore@renderways.in"],
    branch: "VELLORE",
    attachmentName: "5100000001.pdf",
  };
  const SHEET = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');
  const ccField = () => dialog()?.querySelector<HTMLInputElement>('input[aria-label="CC"]');

  beforeEach(() => {
    api.getQuotationSendDefaults.mockResolvedValue(DEFAULTS);
    api.getQuotation.mockResolvedValue(VISIT_ROW);
    api.sendQuotation.mockResolvedValue({ ...VISIT_ROW, sentAt: "2026-10-30T10:00:00Z" });
    pdf.quotationPdf.mockResolvedValue(SHEET);
  });

  afterEach(() => {
    vi.mocked(getCustomerEmails).mockResolvedValue({ mailboxes: [] } as never);
  });

  it("sends a Visit quotation from trade@, copied by branch, with the sheet attached", async () => {
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));

    expect(api.getQuotationSendDefaults).toHaveBeenCalledWith("t", "v-1");
    // From is fixed, not a choice.
    expect(dialog()?.querySelector("select")).toBeNull();
    expect(dialog()?.textContent).toContain("trade@renderways.in");
    expect(ccField()?.value).toBe("radhika@renderways.in, dinesh@renderways.in, vellore@renderways.in");
    expect(dialog()?.textContent).toContain("Subject: WO-000000001-5100000001- Trade");
    expect(dialog()?.textContent).toContain("Attached: 5100000001.pdf");

    await click(button(dialog()!, "Send to customer"));

    expect(api.getQuotation).toHaveBeenCalledWith("t", "v-1");
    expect(pdf.quotationPdf).toHaveBeenCalledWith(VISIT_ROW);
    expect(api.sendQuotation).toHaveBeenCalledWith(
      "t",
      "v-1",
      {
        regionCode: "TRADE",
        to: "customer@example.com",
        note: "",
        cc: "radhika@renderways.in, dinesh@renderways.in, vellore@renderways.in",
        renderedVersion: VISIT_ROW.createdAt,
      },
      { pdf: SHEET, filename: "5100000001.pdf" },
    );
    expect(dialog()).toBeNull();
    expect(container.textContent).toContain("Quotation sent to customer@example.com.");
  });

  it("draws the sheet from the quotation as it is on file now, and says which version that was", async () => {
    // Corrected elsewhere after this page loaded: a new amount, and an edit time.
    const corrected = {
      ...VISIT_ROW,
      updatedAt: "2026-10-30 10:05:00.5+05:30",
      lineItems: [{ ...item, baseAmount: 650 }],
    };
    api.getQuotation.mockResolvedValue(corrected);
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));
    await click(button(dialog()!, "Send to customer"));

    expect(pdf.quotationPdf).toHaveBeenCalledWith(corrected);
    expect(api.sendQuotation.mock.calls[0]![2]).toMatchObject({ renderedVersion: "2026-10-30 10:05:00.5+05:30" });
  });

  it("tells a login that cannot send a Visit quotation so, before any PDF is made", async () => {
    api.getQuotationSendDefaults.mockResolvedValue({
      ...DEFAULTS,
      canSend: false,
      blockedReason: "Visit quotations go out from trade@renderways.in, and only a Super Admin can send from it.",
    });
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("only a Super Admin can send");
    const send = button(dialog()!, "Send to customer") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await click(send);
    expect(pdf.quotationPdf).not.toHaveBeenCalled();
    expect(api.sendQuotation).not.toHaveBeenCalled();
  });

  it("copies whoever the sender leaves in the CC", async () => {
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));
    await fill(dialog()!, "CC", "radhika@renderways.in");
    await click(button(dialog()!, "Send to customer"));

    expect(api.sendQuotation.mock.calls[0]![2]).toMatchObject({ cc: "radhika@renderways.in" });
  });

  it("leaves the CC to the server when its defaults never came, rather than copying nobody", async () => {
    api.getQuotationSendDefaults.mockRejectedValue(new Error("Request failed 500"));
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));

    expect(ccField()?.disabled).toBe(true);
    expect(ccField()?.placeholder).toContain("the server will copy its usual list");
    await click(button(dialog()!, "Send to customer"));
    expect(api.sendQuotation.mock.calls[0]![2]).not.toHaveProperty("cc");
    expect(api.sendQuotation.mock.calls[0]![3]).toEqual({ pdf: SHEET, filename: "quotation.pdf" });
  });

  it("warns when the trade desk's mailbox is not set up", async () => {
    api.getQuotationSendDefaults.mockResolvedValue({ ...DEFAULTS, from: null });
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("not set up");
  });

  it("says why when the send is refused, and keeps the dialog open", async () => {
    api.sendQuotation.mockRejectedValue(new Error("The quotation PDF did not come with this send."));
    await mount();
    await click(button(panel("Visit Quotation")!, "Send"));
    await click(button(dialog()!, "Send to customer"));

    expect(dialog()).not.toBeNull();
    // Inside the dialog, not only on the page behind it.
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      "The quotation PDF did not come with this send.",
    );
  });

  it("keeps the Part send as it was: a mailbox to choose, no CC and no PDF", async () => {
    vi.mocked(getCustomerEmails).mockResolvedValue({
      mailboxes: [{ regionCode: "CHENNAI", email: "chennai@renderways.in" }],
    } as never);
    await mount();
    await click(tabs()[1]);
    await click(button(panel("Part Quotation")!, "Send"));

    expect(dialog()?.querySelector("select")?.value).toBe("CHENNAI");
    expect(ccField()).toBeNull();
    expect(api.getQuotationSendDefaults).not.toHaveBeenCalled();

    await click(button(dialog()!, "Send to customer"));
    expect(pdf.quotationPdf).not.toHaveBeenCalled();
    expect(api.sendQuotation).toHaveBeenCalledWith("t", "p-81", {
      regionCode: "CHENNAI",
      to: "customer@example.com",
      note: "",
    });
  });
});
