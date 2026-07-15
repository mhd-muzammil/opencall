import { describe, expect, it } from "vitest";
import {
  addToProductivityCounts,
  classifyProductivityStatus,
  effectiveProductivityStatus,
  emptyProductivityBucketCounts,
  eveningOutcomeStatus,
} from "./engineerProductivity";

describe("effectiveProductivityStatus", () => {
  it("prefers the Evening status once it is filled", () => {
    expect(
      effectiveProductivityStatus({
        "RTPL status": "Engg Assigned",
        "Evening status": "WO-closed",
      }),
    ).toBe("WO-closed");
  });

  it("falls back to the Morning status while Evening is blank", () => {
    expect(
      effectiveProductivityStatus({
        "RTPL status": "Part Order Pending",
        "Evening status": "",
      }),
    ).toBe("Part Order Pending");
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

  it("maps WO Closed variants to CLOSED but not other closures", () => {
    expect(classifyProductivityStatus("WO-closed")).toBe("CLOSED");
    expect(classifyProductivityStatus("WO Closed")).toBe("CLOSED");
    expect(classifyProductivityStatus("wo closed")).toBe("CLOSED");
    // A cancellation or an intent to close is attended work, not a close.
    expect(classifyProductivityStatus("Closed-cancellation")).toBe("ATTENDED_OTHER");
    expect(classifyProductivityStatus("Need to Close")).toBe("ATTENDED_OTHER");
  });

  it("maps part orders narrowly — quotes and receipts are attended work", () => {
    expect(classifyProductivityStatus("Part Order Pending")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("Additional Part")).toBe("PART_ORDER");
    expect(classifyProductivityStatus("Part Quote Shared")).toBe("ATTENDED_OTHER");
    expect(classifyProductivityStatus("Good Part Received")).toBe("ATTENDED_OTHER");
    expect(classifyProductivityStatus("Elevation Part Pending")).toBe("ATTENDED_OTHER");
  });

  it("maps observation and reschedule statuses, tolerating the common typo", () => {
    expect(classifyProductivityStatus("under observation")).toBe("UNDER_OBSERVATION");
    expect(classifyProductivityStatus("CX Reschedule")).toBe("CX_RESCHEDULE");
    expect(classifyProductivityStatus("CX Reshedule")).toBe("CX_RESCHEDULE");
    // A reschedule is never confused with the scheduling stage.
    expect(classifyProductivityStatus("Rescheduled")).toBe("CX_RESCHEDULE");
  });

  it("maps every other real status to ATTENDED_OTHER", () => {
    for (const status of ["Actionable", "CX Pending", "work in progress", "OTP", "Yank"]) {
      expect(classifyProductivityStatus(status)).toBe("ATTENDED_OTHER");
    }
  });
});

// Outcomes come from the Evening column ONLY. Evening resets every morning
// and survives same-day re-uploads, so whatever is in it was entered that day
// — a carried Morning status can never inflate the outcome counts, and counts
// never drop after a mid-day upload.
describe("eveningOutcomeStatus", () => {
  it("returns the Evening entry", () => {
    expect(
      eveningOutcomeStatus({
        "RTPL status": "Scheduled",
        "Evening status": "WO-closed",
      }),
    ).toBe("WO-closed");
  });

  it("returns blank when Evening is not filled — Morning never makes an outcome", () => {
    expect(
      eveningOutcomeStatus({
        "RTPL status": "WO-closed",
        "Evening status": "",
      }),
    ).toBe("");
  });

  it("treats Manual Entry Required as blank", () => {
    expect(
      eveningOutcomeStatus({ "Evening status": "Manual Entry Required" }),
    ).toBe("");
  });
});

describe("addToProductivityCounts", () => {
  it("rolls up: Assigned = whole load, Attended = Closed+Part+UO", () => {
    const counts = emptyProductivityBucketCounts();

    // sriram mid-day: 18 closed, 2 part orders, 2 reschedules, 2 still
    // scheduled, 1 in progress -> Assigned counts all 25, Attended only
    // the 20 concrete outcomes.
    for (let i = 0; i < 18; i++) addToProductivityCounts(counts, "CLOSED", `C${i}`);
    addToProductivityCounts(counts, "PART_ORDER", "P1");
    addToProductivityCounts(counts, "PART_ORDER", "P2");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R2");
    addToProductivityCounts(counts, "SCHEDULED", "A1");
    addToProductivityCounts(counts, "SCHEDULED", "A2");
    addToProductivityCounts(counts, "ATTENDED_OTHER", "T1");

    expect(counts.assigned).toBe(25);
    expect(counts.attended).toBe(20);
    expect(counts.closed).toBe(18);
    expect(counts.partOrdered).toBe(2);
    expect(counts.cxReschedule).toBe(2);
    expect(counts.underObservation).toBe(0);
    expect(counts.assignedTickets).toHaveLength(25);
    expect(counts.assignedTickets).toContain("A1");
    expect(counts.assignedTickets).toContain("T1");
    expect(counts.attendedTickets).toHaveLength(20);
    expect(counts.closedTickets).toContain("C0");
    expect(counts.cxRescheduleTickets).toEqual(["R1", "R2"]);
  });

  // The morning state: calls scheduled to the engineer show up in Assigned
  // immediately, Attended stays 0 until outcomes are recorded.
  it("counts a freshly scheduled call in Assigned only", () => {
    const counts = emptyProductivityBucketCounts();

    addToProductivityCounts(counts, "SCHEDULED", "S1");
    addToProductivityCounts(counts, "ATTENDED_OTHER", "T1");

    expect(counts.assigned).toBe(2);
    expect(counts.attended).toBe(0);
    expect(counts.closed).toBe(0);
    expect(counts.partOrdered).toBe(0);
    expect(counts.underObservation).toBe(0);
    expect(counts.cxReschedule).toBe(0);
  });

  // The end-of-day state: everything resolved, the team's equation holds.
  it("satisfies Assigned = Attended + CX Reschedule once all calls resolve", () => {
    const counts = emptyProductivityBucketCounts();

    addToProductivityCounts(counts, "CLOSED", "C1");
    addToProductivityCounts(counts, "PART_ORDER", "P1");
    addToProductivityCounts(counts, "UNDER_OBSERVATION", "U1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R1");

    expect(counts.assigned).toBe(counts.attended + counts.cxReschedule);
    expect(counts.attended).toBe(3);
  });
});
