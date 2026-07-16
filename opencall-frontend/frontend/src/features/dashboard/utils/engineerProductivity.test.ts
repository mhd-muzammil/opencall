import { describe, expect, it } from "vitest";
import {
  addToProductivityCounts,
  classifyProductivityStatus,
  effectiveProductivityStatus,
  emptyProductivityBucketCounts,
} from "./engineerProductivity";

describe("effectiveProductivityStatus", () => {
  it("prefers the Evening status once it is filled", () => {
    expect(
      effectiveProductivityStatus({
        "RTPL status": "Scheduled",
        "Evening status": "Case-Closed",
      }),
    ).toBe("Case-Closed");
  });

  it("falls back to the Morning status while Evening is blank", () => {
    expect(
      effectiveProductivityStatus({
        "RTPL status": "SSC Pending",
        "Evening status": "",
      }),
    ).toBe("SSC Pending");
  });

  it("treats Manual Entry Required as blank", () => {
    expect(
      effectiveProductivityStatus({
        "RTPL status": "Manual Entry Required",
        "Evening status": "",
      }),
    ).toBe("");
  });
});

describe("classifyProductivityStatus", () => {
  it("returns null for a blank status — the row must not count", () => {
    expect(classifyProductivityStatus("")).toBeNull();
    expect(classifyProductivityStatus("   ")).toBeNull();
  });

  // The scheduling stage means "booked, not yet attended": Assigned only.
  // Attended starts at whatever status comes AFTER these.
  it("maps the scheduling-stage statuses to SCHEDULED", () => {
    expect(classifyProductivityStatus("Scheduled")).toBe("SCHEDULED");
    expect(classifyProductivityStatus("To be Scheduled")).toBe("SCHEDULED");
    expect(classifyProductivityStatus("Engg Assigned")).toBe("SCHEDULED");
    expect(classifyProductivityStatus("eng assigned")).toBe("SCHEDULED");
    expect(classifyProductivityStatus("Engg Assignment Pending")).toBe("SCHEDULED");
  });

  it("maps Case-Closed and WO Closed variants to CLOSED but not other closures", () => {
    expect(classifyProductivityStatus("Case-Closed")).toBe("CLOSED");
    expect(classifyProductivityStatus("case closed")).toBe("CLOSED");
    expect(classifyProductivityStatus("WO-closed")).toBe("CLOSED");
    expect(classifyProductivityStatus("WO Closed")).toBe("CLOSED");
    // A cancellation or an intent to close is attended work, not a close.
    expect(classifyProductivityStatus("Closed-cancellation")).toBe("ATTENDED_OTHER");
    expect(classifyProductivityStatus("Need to Close")).toBe("ATTENDED_OTHER");
  });

  it("maps SSC Pending and part orders to PART_ORDER — quotes/receipts stay attended work", () => {
    expect(classifyProductivityStatus("SSC Pending")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("SSC Pending → Part Pending")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("Part Order Pending")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("Additional Part")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("Part Quote Shared")).toBe("ATTENDED_OTHER");
    expect(classifyProductivityStatus("Good Part Received")).toBe("ATTENDED_OTHER");
  });

  it("maps observation, CX Pending/reschedules and Engineer Delay", () => {
    expect(classifyProductivityStatus("under observation")).toBe("UNDER_OBSERVATION");
    expect(classifyProductivityStatus("CX Pending")).toBe("CX_RESCHEDULE");
    expect(classifyProductivityStatus("CX Reschedule")).toBe("CX_RESCHEDULE");
    expect(classifyProductivityStatus("CX Reshedule")).toBe("CX_RESCHEDULE");
    expect(classifyProductivityStatus("Engineer Delay")).toBe("ENGINEER_DELAY");
    expect(classifyProductivityStatus("engineer delay")).toBe("ENGINEER_DELAY");
    // A reschedule is never confused with the scheduling stage.
    expect(classifyProductivityStatus("Rescheduled")).toBe("CX_RESCHEDULE");
  });

  it("maps every other real status to ATTENDED_OTHER (counts as attended work)", () => {
    for (const status of ["Actionable", "work in progress", "OTP", "Yank", "Visit Estimate"]) {
      expect(classifyProductivityStatus(status)).toBe("ATTENDED_OTHER");
    }
  });
});

describe("addToProductivityCounts", () => {
  it("rolls up: Assigned = whole load, Attended = every post-scheduled status except CX/Delay", () => {
    const counts = emptyProductivityBucketCounts();

    // Mid-day: 18 closed, 2 SSC/part, 1 worked-other, 2 CX pending, 1 engineer
    // delay, 2 still scheduled.
    for (let i = 0; i < 18; i++) addToProductivityCounts(counts, "CLOSED", `C${i}`);
    addToProductivityCounts(counts, "PART_ORDER", "P1");
    addToProductivityCounts(counts, "PART_ORDER", "P2");
    addToProductivityCounts(counts, "ATTENDED_OTHER", "T1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R2");
    addToProductivityCounts(counts, "ENGINEER_DELAY", "D1");
    addToProductivityCounts(counts, "SCHEDULED", "A1");
    addToProductivityCounts(counts, "SCHEDULED", "A2");

    expect(counts.assigned).toBe(26);
    expect(counts.attended).toBe(21); // 18 closed + 2 part + 1 other
    expect(counts.closed).toBe(18);
    expect(counts.partOrdered).toBe(2);
    expect(counts.cxReschedule).toBe(2);
    expect(counts.engineerDelay).toBe(1);
    expect(counts.underObservation).toBe(0);
    expect(counts.assignedTickets).toHaveLength(26);
    expect(counts.attendedTickets).toContain("T1");
    expect(counts.attendedTickets).not.toContain("R1");
    expect(counts.attendedTickets).not.toContain("D1");
    expect(counts.engineerDelayTickets).toEqual(["D1"]);
  });

  // The morning state: scheduled calls fill Assigned, nothing else moves.
  it("counts a freshly scheduled call in Assigned only", () => {
    const counts = emptyProductivityBucketCounts();

    addToProductivityCounts(counts, "SCHEDULED", "S1");

    expect(counts.assigned).toBe(1);
    expect(counts.attended).toBe(0);
    expect(counts.closed).toBe(0);
    expect(counts.cxReschedule).toBe(0);
    expect(counts.engineerDelay).toBe(0);
  });

  // End of day, nothing left scheduled: the load splits exactly into
  // Attended + CX Reschedule + Engineer Delay.
  it("satisfies Assigned = Attended + CX + Engineer Delay once all calls move", () => {
    const counts = emptyProductivityBucketCounts();

    addToProductivityCounts(counts, "CLOSED", "C1");
    addToProductivityCounts(counts, "PART_ORDER", "P1");
    addToProductivityCounts(counts, "UNDER_OBSERVATION", "U1");
    addToProductivityCounts(counts, "ATTENDED_OTHER", "T1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R1");
    addToProductivityCounts(counts, "ENGINEER_DELAY", "D1");

    expect(counts.assigned).toBe(
      counts.attended + counts.cxReschedule + counts.engineerDelay,
    );
    expect(counts.attended).toBe(4);
  });
});
