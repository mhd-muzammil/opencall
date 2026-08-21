import { describe, it, expect } from "vitest";
import { quotationStage, daysSince, OVERDUE_DAYS } from "./quotationStage";
import type { Quotation } from "./quotationApiClient";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function make(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: "1", quotationNo: "RTPL/26-27/QEN/1", quotationDate: "2026-08-21",
    caseId: "", orderNumber: "WO-1", customerName: "C", customerAddress: "",
    customerCity: "", customerState: "", customerPincode: "", customerPhone: "",
    customerEmail: "", serviceDescription: "", productDescription: "", modelNo: "",
    serialNo: "", baseAmount: 100, sgstPercent: 9, cgstPercent: 9,
    createdBy: "", createdAt: "", lineItems: [],
    ...overrides,
  } as Quotation;
}

/**
 * The order these are tested in IS the design, so the tests are about precedence as much
 * as about labels: a settled quotation must not be dressed up as unfinished, and a customer
 * who has written back must never be shown as someone to chase.
 */
describe("quotationStage", () => {
  it("is Created before it has been sent", () => {
    expect(quotationStage(make()).stage).toBe("CREATED");
  });

  it("is Sent for the first couple of days", () => {
    expect(quotationStage(make({ sentAt: daysAgo(1) })).stage).toBe("SENT");
  });

  it("becomes Waiting once it has gone quiet", () => {
    const view = quotationStage(make({ sentAt: daysAgo(OVERDUE_DAYS) }));
    expect(view.stage).toBe("WAITING");
    expect(view.needsAttention).toBe(true);
  });

  it("is Replied once the customer writes back", () => {
    const view = quotationStage(make({ sentAt: daysAgo(1), replySeenAt: daysAgo(0) }));
    expect(view.stage).toBe("REPLIED");
    expect(view.needsAttention).toBe(true);
  });

  it("says so when the reply looked payment-shaped", () => {
    const view = quotationStage(
      make({ sentAt: daysAgo(1), replySeenAt: daysAgo(0), paymentSignal: "WEAK" }),
    );
    expect(view.label).toContain("check payment");
  });

  it("shows a reply rather than a chase, however old the quotation is", () => {
    // Someone who answered yesterday is not being ignored, whatever the day count says —
    // and chasing them would be the wrong move.
    const view = quotationStage(make({ sentAt: daysAgo(30), replySeenAt: daysAgo(1) }));
    expect(view.stage).toBe("REPLIED");
  });

  it("is Paid whatever else is true of it", () => {
    const view = quotationStage(
      make({ sentAt: daysAgo(30), replySeenAt: daysAgo(1), paymentStatus: "PAID" }),
    );
    expect(view.stage).toBe("PAID");
    expect(view.needsAttention).toBe(false);
  });

  it("is Declined whatever else is true of it", () => {
    const view = quotationStage(
      make({ sentAt: daysAgo(30), replySeenAt: daysAgo(1), paymentStatus: "DECLINED" }),
    );
    expect(view.stage).toBe("DECLINED");
    expect(view.needsAttention).toBe(false);
  });

  it("treats a quotation settled without ever being sent as settled, not as Created", () => {
    expect(quotationStage(make({ paymentStatus: "PAID" })).stage).toBe("PAID");
  });
});

describe("daysSince", () => {
  it("is null when nothing has been sent", () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(undefined)).toBeNull();
  });

  it("is null for a date it cannot read, rather than a wrong number", () => {
    expect(daysSince("not a date")).toBeNull();
  });

  it("counts whole days", () => {
    expect(daysSince(daysAgo(0))).toBe(0);
    expect(daysSince(daysAgo(5))).toBe(5);
  });

  it("never goes negative on a clock that is behind", () => {
    expect(daysSince(new Date(Date.now() + 86_400_000).toISOString())).toBe(0);
  });
});

/**
 * Quotations never sent from here cannot be re-sent — the customer already has one — so
 * verifying a payment is the only thing left to do for them, and the row has to say when
 * there is something to verify.
 */
describe("quotations never sent from here", () => {
  it("stays plain Created when the customer has said nothing", () => {
    const view = quotationStage(make({ paymentSignal: "NONE" }));
    expect(view.label).toBe("Created");
    expect(view.needsAttention).toBe(false);
  });

  it("asks to be checked when a payment-shaped reply turned up", () => {
    const view = quotationStage(make({ paymentSignal: "WEAK" }));
    expect(view.label).toContain("check payment");
    expect(view.needsAttention).toBe(true);
  });

  it("is simply Paid once the reply settled it", () => {
    const view = quotationStage(make({ paymentStatus: "PAID", paymentSignal: "STRONG" }));
    expect(view.stage).toBe("PAID");
  });
});
