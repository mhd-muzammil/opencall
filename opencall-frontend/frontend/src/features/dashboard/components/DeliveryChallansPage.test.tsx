// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChallanBranch,
  ChallanBranchHeader,
  DeliveryChallan,
  DeliveryChallanAutofill,
} from "../../../lib/deliveryChallanApiClient";

/**
 * The Delivery Challan section, mounted, with the network as the only thing faked: every
 * test reads the method, path, query and body the server would actually receive — the
 * API contract is shared with the backend, so a field misnamed here is a challan lost
 * there.
 */

const BASE = "/api/v1/delivery-challans";

type Call = { method: string; path: string; query: Record<string, string>; body: unknown };
type Reply = { status: number; body: unknown };

const reply = (status: number, body: unknown): Reply => ({ status, body });

const HOSUR_HEADER: ChallanBranchHeader = {
  branchKey: "hosur",
  name: "Hosur",
  companyLine: "Renderways Technologies –",
  addressLines: "L-88A, Rayakottai Hudco, Opp-Murugan Temple\nHosur – 635109",
  gstin: "33AALCR1788A1ZG",
  contact: "+916383428751",
  email: "hosur@renderways.in",
};

const DC_67: DeliveryChallan = {
  id: "67",
  branchKey: "hosur",
  finYear: "2026-2027",
  dcSeq: 67,
  challanDate: "2026-10-07",
  branchHeader: HOSUR_HEADER,
  customerName: "Elancheran M",
  customerPhone: "9789 72876",
  customerEmail: "elancheran.m@deltaww.com",
  customerAddress: "Unit, Delta SEZ, Kurubarapalli Village",
  caseIds: "5163299011\n5165190448",
  productSerials: "5CG303425X\n5CD51259LX",
  productNumbers: "402Y3PC\n89T30PC",
  productNames: "HP EliteBook x360 830 G8 Notebook PC (17N15AV)\nHP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
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

const DC_12: DeliveryChallan = {
  ...DC_67,
  id: "12",
  branchKey: "chennai",
  dcSeq: 12,
  challanDate: "2026-09-30",
  branchHeader: { ...HOSUR_HEADER, branchKey: "chennai", name: "Chennai", companyLine: "RENDERWAYS TECHNOLOGY PVT LTD" },
  customerName: "Kumar Traders",
  caseIds: "5160000001",
  productSerials: "5CG0000001",
  productNumbers: "6F8L1PA",
  productNames: "HP ProBook 440 G9 Notebook PC",
  items: [{ description: "SPS-BATTERY 3C 45WHR", hsnSac: "85076000", qty: "01", rate: "", per: "" }],
};

const CASE_A: DeliveryChallanAutofill = {
  caseId: "5163299011",
  orderNumber: "WO-1001",
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
  orderNumber: "WO-1002",
  customerName: "A Different Customer",
  customerPhone: "90000 00000",
  customerEmail: "other@example.com",
  customerAddress: "Somewhere else",
  productSerial: "5CD51259LX",
  productNumber: "89T30PC",
  productName: "HP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
  items: [{ description: "SPS-CABLE KIT LCD 13", hsnSac: "85444299", qty: "1", rate: "", per: "" }],
};

function branch(key: ChallanBranch["branchKey"], name: string, filled: Partial<ChallanBranch> = {}): ChallanBranch {
  return {
    branchKey: key,
    name,
    companyLine: "",
    addressLines: "",
    gstin: "",
    contact: "",
    email: "",
    updatedAt: null,
    updatedBy: "",
    ...filled,
  };
}

// Sent out of order on purpose: the view lists them in the fixed branch order regardless.
const BRANCHES: ChallanBranch[] = [
  branch("hosur", "Hosur", { ...HOSUR_HEADER, updatedAt: null, updatedBy: "" }),
  branch("salem", "Salem"),
  branch("chennai", "Chennai", {
    companyLine: "RENDERWAYS TECHNOLOGY PVT LTD",
    addressLines: "# 25, First Floor, Gandhi Street, Mettukuppam\nMaduravoyal, Chennai - 600095\nTamil Nadu",
    gstin: "33AALCR1788A1ZG",
    contact: "9543095480",
    email: "chennai@renderways.in",
  }),
  branch("kanchipuram", "Kanchipuram"),
  branch("vellore", "Vellore"),
];

/** What the server would answer, by method and path. */
function server(call: Call): Reply {
  if (call.method === "GET" && call.path === BASE) {
    return reply(200, { data: { items: [DC_67, DC_12], total: 2, page: 1, perPage: 50, pages: 1 } });
  }
  if (call.method === "GET" && call.path === `${BASE}/branches`) {
    return reply(200, { data: BRANCHES });
  }
  if (call.method === "GET" && call.path === `${BASE}/autofill`) {
    const found = [CASE_A, CASE_B].find((c) => c.caseId === call.query.caseId) ?? null;
    return reply(200, { data: found });
  }
  if (call.method === "POST" && call.path === BASE) {
    // The server numbers it: the next one at Hosur in 2026-2027.
    const body = call.body as Record<string, unknown>;
    return reply(201, {
      data: { ...DC_67, ...body, id: "68", dcSeq: 68, finYear: "2026-2027", branchHeader: HOSUR_HEADER },
    });
  }
  if (call.method === "PUT" && call.path.startsWith(`${BASE}/branches/`)) {
    return reply(200, {
      data: { ...BRANCHES[0], ...(call.body as object), updatedAt: "2026-10-16T06:00:00Z", updatedBy: "admin" },
    });
  }
  if (call.method === "PUT" && call.path.startsWith(`${BASE}/`)) {
    return reply(200, { data: { ...DC_67, ...(call.body as object), updatedAt: "2026-10-16T06:00:00Z" } });
  }
  return reply(404, { error: { message: `No route ${call.method} ${call.path}` } });
}

let calls: Call[];
let answer: (call: Call) => Reply;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // 16 Oct 2026, 11:30 IST. Only the date is faked; timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
  calls = [];
  answer = server;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const call: Call = {
        method: (init?.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const { status, body } = answer(call);
      return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Let every pending request answer and every re-render land. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(props: { canEditBranches?: boolean } = {}) {
  const { DeliveryChallansPage } = await import("./DeliveryChallansPage");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(DeliveryChallansPage, { token: "t", canEditBranches: props.canEditBranches ?? true }));
  });
  await settle();
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await settle();
}

async function type(element: HTMLElement, value: string) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
  await settle();
}

function byLabel<T extends HTMLElement = HTMLInputElement>(label: string): T {
  const element = document.body.querySelector<T>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`No field labelled "${label}"`);
  return element;
}

const value = (label: string) => byLabel<HTMLInputElement | HTMLTextAreaElement>(label).value;

function button(text: string, within: ParentNode = document.body): HTMLButtonElement {
  const found = Array.from(within.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}

const rows = () => Array.from(container.querySelectorAll('[data-testid="dc-row"]'));
const cells = (row: Element) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent?.trim());
const listCalls = () => calls.filter((c) => c.method === "GET" && c.path === BASE);
const itemDescriptions = () =>
  Array.from(document.body.querySelectorAll<HTMLInputElement>('[aria-label$=" Description of Goods"]')).map(
    (input) => input.value,
  );

describe("DeliveryChallansPage: the list", () => {
  it("lists the challans as the server sends them: DC No. with its year, date, branch, customer, case IDs", async () => {
    await mount();
    expect(listCalls()[0]?.query).toEqual({ pageSize: "50" });
    expect(rows().map(cells)).toEqual([
      ["67 2026-2027", "07-10-2026", "Hosur", "Elancheran M", "5163299011, 5165190448", "View / Print|Edit"],
      ["12 2026-2027", "30-09-2026", "Chennai", "Kumar Traders", "5160000001", "View / Print|Edit"],
    ]);
  });

  it("the search and the branch box ask the server again", async () => {
    await mount();
    await type(byLabel("Search delivery challans"), "5163");
    expect(listCalls().at(-1)?.query).toEqual({ search: "5163", pageSize: "50" });
    await type(byLabel<HTMLSelectElement>("Filter by branch"), "hosur");
    expect(listCalls().at(-1)?.query).toEqual({ search: "5163", branch: "hosur", pageSize: "50" });
  });

  it("a 503 shows the server's own message in place of the rows", async () => {
    const notSetUp = "Delivery challans are not set up on this server yet (run migrate:delivery-challans).";
    answer = (call) =>
      call.method === "GET" && call.path === BASE ? reply(503, { error: { message: notSetUp } }) : server(call);
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(notSetUp);
    expect(rows()).toHaveLength(0);
  });

  it("View / Print opens that challan's sheet", async () => {
    await mount();
    await click(button("View / Print", rows()[1]!));
    const sheet = document.body.querySelector(".deliveryChallanSheet");
    expect(sheet?.querySelector('[data-testid="dc-number"]')?.textContent).toBe("DC No. 122026-2027");
    expect(sheet?.textContent).toContain("Kumar Traders");
  });
});

describe("DeliveryChallansPage: creating and correcting", () => {
  it("a new challan starts on today's date with no branch chosen", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    expect(value("Challan Date")).toBe("2026-10-16");
    expect(byLabel<HTMLSelectElement>("Branch").value).toBe("");
  });

  it("Save posts exactly the contract's body, and opens the numbered sheet", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel<HTMLSelectElement>("Branch"), "hosur");
    await type(byLabel("Challan Date"), "2026-10-07");
    await type(byLabel("Customer Name"), "Elancheran M");
    await type(byLabel("Customer Phone"), "9789 72876");
    await type(byLabel("Customer Email"), "elancheran.m@deltaww.com");
    await type(byLabel("Customer Address"), "Unit, Delta SEZ\nKurubarapalli Village");
    await type(byLabel("Ref No. & Date"), "PO 4471 / 05-10-2026");
    await type(byLabel("Mode/Terms of Payment"), "Warranty");
    await type(byLabel("Other References"), "WO 22113");
    await type(byLabel("Case IDs"), "5163299011\n5165190448");
    await type(byLabel("Product Serials"), "5CG303425X\n5CD51259LX");
    await type(byLabel("Product Numbers"), "402Y3PC\n89T30PC");
    await type(byLabel("Product Names"), "HP EliteBook x360 830 G8\nHP EliteBook 630 G10");
    await type(byLabel("Item 1 Description of Goods"), "SPS-TOPCOVER W/KB CP BL INDIA");
    await type(byLabel("Item 1 HSN/SAC"), "84716040");
    await type(byLabel("Item 1 Qty"), "01");
    await click(button("+ Add row"));
    await type(byLabel("Item 2 Description of Goods"), "SPS-CABLE KIT LCD 13");
    await type(byLabel("Item 2 HSN/SAC"), "85444299");
    await type(byLabel("Item 2 Qty"), "01");
    await type(byLabel("Item 2 Rate"), "0");
    await type(byLabel("Item 2 Per"), "Nos");
    await click(button("Save & generate challan"));

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.path).toBe(BASE);
    expect(posts[0]!.body).toEqual({
      branchKey: "hosur",
      challanDate: "2026-10-07",
      customerName: "Elancheran M",
      customerPhone: "9789 72876",
      customerEmail: "elancheran.m@deltaww.com",
      customerAddress: "Unit, Delta SEZ\nKurubarapalli Village",
      caseIds: "5163299011\n5165190448",
      productSerials: "5CG303425X\n5CD51259LX",
      productNumbers: "402Y3PC\n89T30PC",
      productNames: "HP EliteBook x360 830 G8\nHP EliteBook 630 G10",
      refNoDate: "PO 4471 / 05-10-2026",
      modeTerms: "Warranty",
      otherReferences: "WO 22113",
      items: [
        { description: "SPS-TOPCOVER W/KB CP BL INDIA", hsnSac: "84716040", qty: "01", rate: "", per: "" },
        { description: "SPS-CABLE KIT LCD 13", hsnSac: "85444299", qty: "01", rate: "0", per: "Nos" },
      ],
    });
    // The number is the server's, and the sheet opens on it straight away.
    expect(document.body.querySelector('.deliveryChallanSheet [data-testid="dc-number"]')?.textContent).toBe(
      "DC No. 682026-2027",
    );
    // And the list is back, read again.
    expect(listCalls().length).toBeGreaterThanOrEqual(2);
  });

  it("asks for the branch before anything is sent — the branch is part of the number", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel("Customer Name"), "Elancheran M");
    await type(byLabel("Item 1 Description of Goods"), "SPS-CABLE KIT LCD 13");
    await click(button("Save & generate challan"));
    expect(container.textContent).toContain("Choose the branch this challan is from.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("Edit corrects the challan with PUT, keeping its branch and number", async () => {
    await mount();
    await click(button("Edit", rows()[0]!));
    expect(container.textContent).toContain("Editing DC No. 67 (2026-2027, Hosur)");
    const branchBox = byLabel<HTMLSelectElement>("Branch");
    expect(branchBox.value).toBe("hosur");
    expect(branchBox.disabled).toBe(true);
    expect(value("Case IDs")).toBe("5163299011\n5165190448");
    expect(itemDescriptions()).toEqual(["SPS-TOPCOVER W/KB CP BL INDIA", "SPS-CABLE KIT LCD 13"]);

    await type(byLabel("Customer Phone"), "98400 12345");
    await click(button("Save changes"));

    expect(calls.some((c) => c.method === "POST")).toBe(false);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`${BASE}/67`);
    expect(puts[0]!.body).toEqual({
      branchKey: "hosur",
      challanDate: "2026-10-07",
      customerName: "Elancheran M",
      customerPhone: "98400 12345",
      customerEmail: "elancheran.m@deltaww.com",
      customerAddress: "Unit, Delta SEZ, Kurubarapalli Village",
      caseIds: "5163299011\n5165190448",
      productSerials: "5CG303425X\n5CD51259LX",
      productNumbers: "402Y3PC\n89T30PC",
      productNames:
        "HP EliteBook x360 830 G8 Notebook PC (17N15AV)\nHP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
      refNoDate: "",
      modeTerms: "",
      otherReferences: "",
      items: DC_67.items,
    });
  });

  it("a date moved into another financial year is refused with the server's message, and the form kept", async () => {
    const refused = "DC 67 belongs to 2026-2027; 02-04-2027 falls in 2027-2028.";
    answer = (call) => (call.method === "PUT" ? reply(400, { error: { message: refused } }) : server(call));
    await mount();
    await click(button("Edit", rows()[0]!));
    await type(byLabel("Challan Date"), "2027-04-02");
    await click(button("Save changes"));
    expect(container.textContent).toContain(refused);
    expect(value("Challan Date")).toBe("2027-04-02");
  });

  it("flags a branch whose letterhead is still empty before a challan is raised on it", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel<HTMLSelectElement>("Branch"), "salem");
    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      "Salem's letterhead has no company line, address, GSTIN/UIN, contact, e-mail yet.",
    );
    await type(byLabel<HTMLSelectElement>("Branch"), "hosur");
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});

describe("DeliveryChallansPage: auto-fill from a case", () => {
  it("APPENDS each case: its lines, its parts as rows, and the customer only where still empty", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel("Customer Name"), "Typed by hand");

    await type(byLabel("Case ID"), "5163299011");
    await click(button("Auto-fill from case"));
    expect(calls.filter((c) => c.path === `${BASE}/autofill`).at(-1)?.query).toEqual({ caseId: "5163299011" });
    expect(value("Case IDs")).toBe("5163299011");
    expect(value("Product Serials")).toBe("5CG303425X");
    expect(value("Product Numbers")).toBe("402Y3PC");
    expect(value("Product Names")).toBe("HP EliteBook x360 830 G8 Notebook PC (17N15AV)");
    // The case's part took the place of the empty starting row.
    expect(itemDescriptions()).toEqual(["SPS-TOPCOVER W/KB CP BL INDIA"]);
    expect(value("Item 1 HSN/SAC")).toBe("84716040");
    // The name was typed, so it stays; the rest of the customer was empty, so it is filled.
    expect(value("Customer Name")).toBe("Typed by hand");
    expect(value("Customer Phone")).toBe("9789 72876");
    expect(value("Customer Email")).toBe("elancheran.m@deltaww.com");
    expect(value("Customer Address")).toBe("Unit, Delta SEZ, Kurubarapalli Village");
    // Ready for the next case.
    expect(value("Case ID")).toBe("");

    await type(byLabel("Case ID"), "5165190448");
    await click(button("Auto-fill from case"));
    expect(value("Case IDs")).toBe("5163299011\n5165190448");
    expect(value("Product Serials")).toBe("5CG303425X\n5CD51259LX");
    expect(value("Product Numbers")).toBe("402Y3PC\n89T30PC");
    expect(value("Product Names")).toBe(
      "HP EliteBook x360 830 G8 Notebook PC (17N15AV)\nHP EliteBook 630 13.3 inch G10 Notebook PC (735X3AV)",
    );
    expect(itemDescriptions()).toEqual(["SPS-TOPCOVER W/KB CP BL INDIA", "SPS-CABLE KIT LCD 13"]);
    expect(value("Item 2 HSN/SAC")).toBe("85444299");
    // The second case's customer does not replace the first's.
    expect(value("Customer Phone")).toBe("9789 72876");
    expect(value("Customer Address")).toBe("Unit, Delta SEZ, Kurubarapalli Village");
  });

  it("adds the same case only once", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel("Case ID"), "5163299011");
    await click(button("Auto-fill from case"));
    await type(byLabel("Case ID"), "5163299011");
    await click(button("Auto-fill from case"));
    expect(container.textContent).toContain("Case 5163299011 is already on this challan.");
    expect(value("Case IDs")).toBe("5163299011");
    expect(itemDescriptions()).toEqual(["SPS-TOPCOVER W/KB CP BL INDIA"]);
  });

  it("says so when no case matches, and changes nothing", async () => {
    await mount();
    await click(button("+ New Delivery Challan"));
    await type(byLabel("Case ID"), "0000000000");
    await click(button("Auto-fill from case"));
    expect(container.textContent).toContain("No matching case found");
    expect(value("Case IDs")).toBe("");
  });
});

describe("DeliveryChallansPage: Branch details", () => {
  it("a super admin edits a branch's letterhead, and the save sends exactly its fields", async () => {
    await mount({ canEditBranches: true });
    await click(button("Branch details"));
    const cards = Array.from(container.querySelectorAll('[data-testid="dc-branch"]'));
    expect(cards.map((card) => card.querySelector("strong")?.textContent)).toEqual([
      "Chennai",
      "Vellore",
      "Salem",
      "Kanchipuram",
      "Hosur",
    ]);
    expect(value("Hosur GSTIN/UIN")).toBe("33AALCR1788A1ZG");

    await type(byLabel("Hosur contact"), "+91 63834 28751");
    await type(byLabel<HTMLTextAreaElement>("Hosur address"), "L-88A, Rayakottai Hudco\n\nHosur – 635109 ");
    await click(button("Save Hosur"));

    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`${BASE}/branches/hosur`);
    expect(puts[0]!.body).toEqual({
      name: "Hosur",
      companyLine: "Renderways Technologies –",
      addressLines: "L-88A, Rayakottai Hudco\nHosur – 635109",
      gstin: "33AALCR1788A1ZG",
      contact: "+91 63834 28751",
      email: "hosur@renderways.in",
    });
    expect(container.textContent).toContain("Hosur saved.");
  });

  it("anyone else can read the letterheads but not change them", async () => {
    await mount({ canEditBranches: false });
    await click(button("Branch details"));
    const cards = container.querySelectorAll('[data-testid="dc-branch"]');
    expect(cards).toHaveLength(5);
    expect(container.querySelectorAll('[data-testid="dc-branch"] input, [data-testid="dc-branch"] textarea')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.startsWith("Save"))).toBe(false);
    expect(container.textContent).toContain("Only a super admin can change these.");
    expect(container.textContent).toContain("33AALCR1788A1ZG");
    expect(container.textContent).toContain("hosur@renderways.in");
  });
});
