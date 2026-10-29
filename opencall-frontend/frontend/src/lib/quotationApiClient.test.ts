import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveQuotationDraft,
  createQuotation,
  listQuotationDrafts,
  listQuotations,
  removeQuotationDraft,
  type CreateQuotationInput,
} from "./quotationApiClient";

/** What the client asked the server, as the URL and the body it sent. */
function stubFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ data: { items: [], total: 0, page: 1, perPage: 50, pages: 1 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listQuotations", () => {
  it("asks for the tab's kind", async () => {
    const fetchMock = stubFetch();
    await listQuotations("t", { search: "ravi", kind: "VISIT", perPage: 50 });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/api/v1/quotations");
    expect(url.searchParams.get("kind")).toBe("VISIT");
    expect(url.searchParams.get("search")).toBe("ravi");
    expect(url.searchParams.get("per_page")).toBe("50");
  });

  it("asks for one side of a moment, for the page's History", async () => {
    const fetchMock = stubFetch();
    await listQuotations("t", { kind: "PART", createdBefore: "2026-10-28T18:30:00.000Z", page: 2, perPage: 100 });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    // Encoded, so a "+05:30" style moment would survive the query string too.
    expect(url.searchParams.get("created_before")).toBe("2026-10-28T18:30:00.000Z");
    expect(url.searchParams.has("created_from")).toBe(false);
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("asks for no kind when none is given, so both come back", async () => {
    const fetchMock = stubFetch();
    await listQuotations("t", { perPage: 50 });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.has("kind")).toBe(false);
  });
});

describe("createQuotation", () => {
  it("sends the kind in the body", async () => {
    const fetchMock = stubFetch();
    const input: CreateQuotationInput = {
      kind: "VISIT",
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
      lineItems: [{ serviceDescription: "", productDescription: "HP Smart Tank 580", modelNo: "", serialNo: "", baseAmount: 550 }],
      sgstPercent: 9,
      cgstPercent: 9,
    };
    await createQuotation("t", input);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).kind).toBe("VISIT");
  });
});

describe("the quotations waiting for approval", () => {
  const ID = "0b6f3b0e-1d2c-4c6e-9a51-000000000001";

  it("asks for one kind's waiting list", async () => {
    const fetchMock = stubFetch();
    await listQuotationDrafts("t", { kind: "PART", search: "dinesh" });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/api/v1/quotations/drafts");
    expect(url.searchParams.get("kind")).toBe("PART");
    expect(url.searchParams.get("search")).toBe("dinesh");
  });

  it("approves with the form as the body, and removes with none", async () => {
    const fetchMock = stubFetch();
    await approveQuotationDraft("t", ID, {
      kind: "VISIT",
      quotationDate: "2026-10-29",
      caseId: "5166159539",
      orderNumber: "WO-036404653",
      customerName: "Likhitha",
      customerAddress: "",
      customerCity: "",
      customerState: "",
      customerPincode: "",
      customerPhone: "",
      customerEmail: "",
      lineItems: [{ serviceDescription: "", productDescription: "", modelNo: "", serialNo: "", baseAmount: 550 }],
      sgstPercent: 9,
      cgstPercent: 9,
    });
    await removeQuotationDraft("t", ID);

    const [approveUrl, approveInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(approveUrl).pathname).toBe(`/api/v1/quotations/drafts/${ID}/approve`);
    expect(approveInit.method).toBe("POST");
    expect(JSON.parse(String(approveInit.body)).lineItems[0].baseAmount).toBe(550);
    const [removeUrl, removeInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(new URL(removeUrl).pathname).toBe(`/api/v1/quotations/drafts/${ID}/remove`);
    expect(removeInit.method).toBe("POST");
    expect(removeInit.body).toBeUndefined();
  });
});
