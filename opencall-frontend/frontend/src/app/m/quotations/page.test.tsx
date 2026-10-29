// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateQuotationInput, Quotation } from "../../../lib/quotationApiClient";

/**
 * The phone's Quotations page: Visit Quotation and Part Quotation as the two options of its
 * list, as they are the two tabs on the desktop.
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
// One object for every render, as the real context gives: the page's loader depends on it.
const SESSION = vi.hoisted(() => ({ session: { token: "t" } }));
vi.mock("../session", () => ({
  useMobileSession: () => SESSION,
  isSuperAdminSession: () => true,
  canSeeMobileSection: () => true,
}));
// The real bar needs the Next router; only its title, subtitle and action matter here.
vi.mock("../AppBar", async () => {
  const { createElement: h } = await import("react");
  return {
    AppBar: (props: { title: string; subtitle?: string; action?: ReactNode }) =>
      h("header", null, h("h1", null, props.title), h("p", { "data-testid": "subtitle" }, props.subtitle), props.action),
  };
});

import MobileQuotationsPage from "./page";

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
  caseId: "",
  orderNumber: "",
  customerName: "Ravi Kumar",
  customerAddress: "",
  customerCity: "",
  customerState: "",
  customerPincode: "",
  customerPhone: "",
  customerEmail: "",
  ...item,
  sgstPercent: 9,
  cgstPercent: 9,
  createdBy: "office",
  createdAt: "2026-10-24T10:00:00Z",
  lineItems: [item],
};
const PART_ROW: Quotation = { ...VISIT_ROW, id: "p-80", kind: "PART", quotationNo: "RTPL/26-27/QEN/80" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  api.listQuotations.mockImplementation(async (_token: string, params: { kind?: string }) => {
    const items = params.kind === "VISIT" ? [VISIT_ROW] : [PART_ROW];
    return { items, total: items.length, page: 1, perPage: 50, pages: 1 };
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(MobileQuotationsPage));
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

const options = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const labels = () => Array.from(container.querySelectorAll("label")).map((l) => l.textContent?.trim());

async function fill(label: string, value: string) {
  const lbl = Array.from(container.querySelectorAll("label")).find((l) => l.textContent?.trim() === label);
  const input = lbl?.nextElementSibling as HTMLInputElement | null;
  if (!input) throw new Error(`no field ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("MobileQuotationsPage", () => {
  it("lists Visit quotations first, and Part ones on the other option", async () => {
    await mount();

    expect(options().map((o) => o.textContent)).toEqual(["Visit Quotation", "Part Quotation"]);
    expect(options()[0]!.className).toContain("is-active");
    expect(api.listQuotations.mock.calls.at(-1)![1]).toMatchObject({ kind: "VISIT" });
    expect(container.textContent).toContain("RTPL/26-27/QEV/1");

    await click(options()[1]);
    expect(options()[1]!.className).toContain("is-active");
    expect(api.listQuotations.mock.calls.at(-1)![1]).toMatchObject({ kind: "PART" });
    expect(container.textContent).toContain("RTPL/26-27/QEN/80");
    expect(container.textContent).not.toContain("RTPL/26-27/QEV/1");
  });

  it("keeps a slow answer for the option just left out of the one just opened", async () => {
    let answerVisit: (value: unknown) => void = () => {};
    api.listQuotations.mockImplementation((_token: string, params: { kind?: string }) =>
      params.kind === "VISIT"
        ? new Promise((resolve) => {
            answerVisit = resolve;
          })
        : Promise.resolve({ items: [PART_ROW], total: 1, page: 1, perPage: 50, pages: 1 }),
    );
    await mount();
    await click(options()[1]);
    expect(container.textContent).toContain("RTPL/26-27/QEN/80");

    // The Visit list asked for first answers last.
    await act(async () => {
      answerVisit({ items: [VISIT_ROW], total: 1, page: 1, perPage: 50, pages: 1 });
    });
    await flush();
    expect(container.textContent).toContain("RTPL/26-27/QEN/80");
    expect(container.textContent).not.toContain("RTPL/26-27/QEV/1");
  });

  it("raises a Visit quotation from the Visit option, with no service description", async () => {
    api.createQuotation.mockImplementation(async () => ({ ...VISIT_ROW, id: "v-2", quotationNo: "RTPL/26-27/QEV/2" }));
    await mount();
    await click(container.querySelector('[aria-label="New visit quotation"]'));

    expect(container.querySelector('[data-testid="subtitle"]')?.textContent).toBe("New visit quotation");
    expect(labels()).not.toContain("Service Description");
    await fill("Customer Name *", "Ravi Kumar");
    await fill("Amount *", "550");
    await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Save & Print"));

    const input = api.createQuotation.mock.calls[0]![1] as CreateQuotationInput;
    expect(input.kind).toBe("VISIT");
    expect(input.lineItems[0]!.serviceDescription).toBe("");
  });

  it("raises a Part quotation from the Part option, service description and all", async () => {
    api.createQuotation.mockImplementation(async () => ({ ...PART_ROW, id: "p-81", quotationNo: "RTPL/26-27/QEN/81" }));
    await mount();
    await click(options()[1]);
    await click(container.querySelector('[aria-label="New part quotation"]'));

    expect(labels()).toContain("Service Description");
    await fill("Customer Name *", "Ravi Kumar");
    await fill("Amount *", "950");
    await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Save & Print"));

    expect((api.createQuotation.mock.calls[0]![1] as CreateQuotationInput).kind).toBe("PART");
  });

  it("edits a Visit quotation as a Visit quotation", async () => {
    api.updateQuotation.mockImplementation(async () => VISIT_ROW);
    await mount();
    await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Edit"));

    expect(labels()).not.toContain("Service Description");
    await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Save changes"));
    expect((api.updateQuotation.mock.calls[0]![2] as CreateQuotationInput).kind).toBe("VISIT");
  });
});
