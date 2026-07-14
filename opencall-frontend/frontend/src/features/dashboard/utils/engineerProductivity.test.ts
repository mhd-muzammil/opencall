import { describe, expect, it } from "vitest";
import {
  addToProductivityCounts,
  classifyProductivityStatus,
  effectiveProductivityStatus,
  emptyProductivityBucketCounts,
  wasRowEnteredOnItsDay,
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

// A day's productivity counts only what was ENTERED that day. Rows whose
// engineer+status merely carried forward from the previous report (the
// "Carried" badge on the Records page) were the previous day's work.
describe("wasRowEnteredOnItsDay", () => {
  function row(
    output: Record<string, string | number>,
    carriedForwardFields: string[] = [],
  ) {
    return { output, carryForward: { carriedForwardFields } };
  }

  it("counts a row whose engineer was assigned that day", () => {
    expect(
      wasRowEnteredOnItsDay(
        row({ Engineer: "Lava Kumar", "RTPL status": "Scheduled" }, ["rtpl_status"]),
      ),
    ).toBe(true);
  });

  it("counts a row whose Morning status was typed that day", () => {
    expect(
      wasRowEnteredOnItsDay(
        row({ Engineer: "Lava Kumar", "RTPL status": "Scheduled" }, ["engineer"]),
      ),
    ).toBe(true);
  });

  it("counts a fully-carried row once its Evening status is filled", () => {
    expect(
      wasRowEnteredOnItsDay(
        row(
          {
            Engineer: "Lava Kumar",
            "RTPL status": "To be Scheduled",
            "Evening status": "WO-closed",
          },
          ["engineer", "rtpl_status"],
        ),
      ),
    ).toBe(true);
  });

  it("does NOT count a row whose engineer and status are both carry-forwards", () => {
    expect(
      wasRowEnteredOnItsDay(
        row(
          { Engineer: "Lava Kumar", "RTPL status": "To be Scheduled" },
          ["engineer", "rtpl_status"],
        ),
      ),
    ).toBe(false);
  });

  it("does NOT count carried values whose editable fields are blank", () => {
    expect(
      wasRowEnteredOnItsDay(
        row(
          { Engineer: "", "RTPL status": "", "Evening status": "" },
          ["remarks"],
        ),
      ),
    ).toBe(false);
  });
});

describe("addToProductivityCounts", () => {
  it("rolls up like the productivity table: Assigned is total, Attended excludes assigned-only and reschedules", () => {
    const counts = emptyProductivityBucketCounts();

    // sriram's day: 18 closed, 2 part orders, 2 reschedules, 2 still scheduled.
    for (let i = 0; i < 18; i++) addToProductivityCounts(counts, "CLOSED", `C${i}`);
    addToProductivityCounts(counts, "PART_ORDER", "P1");
    addToProductivityCounts(counts, "PART_ORDER", "P2");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R1");
    addToProductivityCounts(counts, "CX_RESCHEDULE", "R2");
    addToProductivityCounts(counts, "SCHEDULED", "A1");
    addToProductivityCounts(counts, "SCHEDULED", "A2");

    expect(counts.assigned).toBe(24);
    expect(counts.attended).toBe(20);
    expect(counts.closed).toBe(18);
    expect(counts.partOrdered).toBe(2);
    expect(counts.cxReschedule).toBe(2);
    expect(counts.underObservation).toBe(0);
    expect(counts.assignedTickets).toHaveLength(24);
    expect(counts.attendedTickets).toHaveLength(20);
    expect(counts.closedTickets).toContain("C0");
    expect(counts.cxRescheduleTickets).toEqual(["R1", "R2"]);
  });

  it("counts attended-other work in Attended but no sub-bucket", () => {
    const counts = emptyProductivityBucketCounts();

    addToProductivityCounts(counts, "ATTENDED_OTHER", "T1");

    expect(counts.assigned).toBe(1);
    expect(counts.attended).toBe(1);
    expect(counts.closed).toBe(0);
    expect(counts.partOrdered).toBe(0);
    expect(counts.underObservation).toBe(0);
    expect(counts.cxReschedule).toBe(0);
  });
});
