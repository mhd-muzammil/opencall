import { describe, expect, it } from "vitest";
import type { Quotation } from "./quotationApiClient";
import { TILE_TESTS, reachedCustomer, tileCount, tileTotal } from "./quotationTiles";

/**
 * The boxes are the part of this page anybody actually reads, and they have been wrong in
 * every direction: Not paid counting quotations nobody had sent, Created hiding the paid
 * ones, a rupee total describing a different set from the count printed beside it. Each of
 * those was found by a person staring at a screen and adding up rows by hand.
 *
 * These are the three identities that make the boxes readable as a funnel. If one of them
 * ever fails again, it fails here rather than in front of the person whose money it is.
 */

let n = 0;
function quotation(over: Partial<Quotation> = {}): Quotation {
  n += 1;
  const base: Quotation = {
    id: `id-${n}`,
    quotationNo: `RTPL/26-27/QEN/${n}`,
    quotationDate: "2026-08-01",
    caseId: "",
    orderNumber: `WO-0000${n}`,
    customerName: "A customer",
    customerAddress: "",
    customerCity: "",
    customerState: "",
    customerPincode: "",
    customerPhone: "",
    customerEmail: `customer${n}@example.com`,
    serviceDescription: "",
    productDescription: "",
    modelNo: "",
    serialNo: "",
    baseAmount: 100,
    sgstPercent: 9,
    cgstPercent: 9,
    createdBy: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    lineItems: [],
  };
  // Cast because `exactOptionalPropertyTypes` reads a spread of Partial<Quotation> as
  // possibly re-introducing `undefined` into required fields. Every field the tests set is
  // one the type already allows, and `base` above is a complete Quotation.
  return { ...base, ...over } as Quotation;
}

/** Never mailed, nothing heard, nothing settled. */
const created = () => quotation({ sentAt: null, paymentStatus: "PENDING" });
/** Mailed, no answer. */
const noReply = () => quotation({ sentAt: "2026-08-02T00:00:00.000Z", paymentStatus: "PENDING" });
/** Mailed, the customer wrote back, still owing. */
const replied = () =>
  quotation({
    sentAt: "2026-08-02T00:00:00.000Z",
    replySeenAt: "2026-08-03T00:00:00.000Z",
    paymentStatus: "PENDING",
  });
/** Mailed and paid. */
const paid = () =>
  quotation({
    sentAt: "2026-08-02T00:00:00.000Z",
    replySeenAt: "2026-08-03T00:00:00.000Z",
    paymentStatus: "PAID",
  });
/** Paid, but no send was ever found — the case the Sent-folder search cannot answer. */
const paidNeverFound = () =>
  quotation({
    sentAt: null,
    replySeenAt: "2026-08-03T00:00:00.000Z",
    paymentStatus: "PAID",
  });

describe("reachedCustomer", () => {
  it("is true once a send is recorded", () => {
    expect(reachedCustomer(noReply())).toBe(true);
  });

  it("is false while nothing has been sent and nothing settled", () => {
    expect(reachedCustomer(created())).toBe(false);
  });

  it("is true for a paid quotation whose send was never found", () => {
    // A customer who paid it plainly received it. Treating this as "not mailed yet" is what
    // made Paid read zero on three quotations that were paid for.
    expect(reachedCustomer(paidNeverFound())).toBe(true);
  });

  it("is true for a rejected quotation whose send was never found", () => {
    // They read it before saying no.
    expect(reachedCustomer(quotation({ sentAt: null, paymentStatus: "DECLINED" }))).toBe(true);
  });

  it("treats a missing payment status as still open", () => {
    expect(reachedCustomer(quotation({ sentAt: null }))).toBe(false);
    expect(TILE_TESTS.NOT_PAID(quotation({ sentAt: "2026-08-02T00:00:00.000Z" }))).toBe(true);
  });
});

describe("the header boxes", () => {
  const items = [
    created(),
    created(),
    noReply(),
    noReply(),
    noReply(),
    replied(),
    paid(),
    paidNeverFound(),
    quotation({ sentAt: "2026-08-02T00:00:00.000Z", paymentStatus: "DECLINED" }),
  ];

  it("counts each box the way the funnel describes it", () => {
    expect(tileCount(items, "CREATED")).toBe(2);
    expect(tileCount(items, "SENT")).toBe(7);
    expect(tileCount(items, "REPLIED")).toBe(3);
    expect(tileCount(items, "NO_REPLY")).toBe(4);
    expect(tileCount(items, "PAID")).toBe(2);
    expect(tileCount(items, "NOT_PAID")).toBe(4);
    expect(tileCount(items, "REJECTED")).toBe(1);
  });

  it("Created + Sent is every quotation there is", () => {
    expect(tileCount(items, "CREATED") + tileCount(items, "SENT")).toBe(items.length);
  });

  it("Replied + No reply is exactly Sent", () => {
    expect(tileCount(items, "REPLIED") + tileCount(items, "NO_REPLY")).toBe(
      tileCount(items, "SENT"),
    );
  });

  it("Paid + Not paid + Rejected is exactly Sent", () => {
    expect(
      tileCount(items, "PAID") + tileCount(items, "NOT_PAID") + tileCount(items, "REJECTED"),
    ).toBe(tileCount(items, "SENT"));
  });

  it("no quotation is in both Created and Sent", () => {
    for (const item of items) {
      expect(TILE_TESTS.CREATED(item) && TILE_TESTS.SENT(item)).toBe(false);
    }
  });

  it("keeps an unsent quotation out of Not paid", () => {
    // The bug this replaces: Not paid counted every open quotation, so seven nobody had
    // sent were being reported as money a customer was withholding.
    expect(TILE_TESTS.NOT_PAID(created())).toBe(false);
  });

  it("keeps an unsent quotation out of No reply", () => {
    // Nobody has been asked anything, so silence is not the customer ignoring us.
    expect(TILE_TESTS.NO_REPLY(created())).toBe(false);
  });
});

describe("the money under a box", () => {
  it("sums exactly the quotations that box counts", () => {
    const items = [created(), noReply(), paid()];
    // 100 + 18% = 118, and only the paid one is under Paid.
    expect(tileTotal(items, "PAID")).toBeCloseTo(118, 6);
    expect(tileTotal(items, "NOT_PAID")).toBeCloseTo(118, 6);
    // The unsent one is in neither, which is the whole point.
    expect(tileTotal(items, "CREATED")).toBeCloseTo(118, 6);
  });

  it("is zero for a box that counts nothing", () => {
    expect(tileTotal([created()], "PAID")).toBe(0);
    expect(tileTotal([created()], "NOT_PAID")).toBe(0);
  });
});
