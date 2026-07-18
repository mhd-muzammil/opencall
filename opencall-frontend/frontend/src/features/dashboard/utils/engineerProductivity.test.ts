import { describe, expect, it } from "vitest";
import {
  addToProductivityCounts,
  classifyProductivityStatus,
  computeEngineerProductivity,
  emptyProductivityBucketCounts,
  mergeEngineerProductivityResults,
  resolveDayScopedProductivityBucket,
  type ProductivityReportRow,
} from "./engineerProductivity";

let nextSerial = 1;

function row(input: {
  ticketId?: string;
  engineer?: string;
  morning?: string;
  evening?: string;
  workLocation?: string;
  flexStatus?: string;
  closedSyntheticRow?: boolean;
  sameDayClosedRow?: boolean;
}): ProductivityReportRow {
  return {
    serialNo: nextSerial++,
    output: {
      "Ticket ID": input.ticketId ?? `T${nextSerial}`,
      Engineer: input.engineer ?? "Sriram",
      "RTPL status": input.morning ?? "",
      "Evening status": input.evening ?? "",
      "Work Location": input.workLocation ?? "ASPS01461",
      "Flex Status": input.flexStatus ?? "Open",
    },
    carryForward: {
      closedSyntheticRow: input.closedSyntheticRow ?? false,
      sameDayClosedRow: input.sameDayClosedRow ?? false,
    },
    comparison: null,
  };
}

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

// The split-status rule: Morning decides plan membership, Evening (or a
// same-day close) decides the outcome. Morning NEVER feeds an outcome.
describe("resolveDayScopedProductivityBucket", () => {
  it("keeps a carried-Scheduled call in the plan (Assigned, not worked)", () => {
    expect(
      resolveDayScopedProductivityBucket(row({ morning: "Scheduled" })),
    ).toBe("SCHEDULED");
    expect(
      resolveDayScopedProductivityBucket(row({ morning: "Engg Assigned" })),
    ).toBe("SCHEDULED");
  });

  it("excludes untouched carried backlog (non-scheduling Morning, blank Evening)", () => {
    expect(
      resolveDayScopedProductivityBucket(row({ morning: "Part Order Pending" })),
    ).toBeNull();
    expect(
      resolveDayScopedProductivityBucket(row({ morning: "Under Observation" })),
    ).toBeNull();
  });

  it("regression: carried Morning 'SSC Pending' with blank Evening is NOT Part-ordered", () => {
    // The old effectiveProductivityStatus fell back to Morning, so a call
    // carried from days ago counted as Part-ordered → Attended today.
    expect(
      resolveDayScopedProductivityBucket(row({ morning: "SSC Pending" })),
    ).toBeNull();
  });

  it("buckets today's Evening outcome regardless of the Morning status", () => {
    expect(
      resolveDayScopedProductivityBucket(
        row({ morning: "SSC Pending", evening: "Case-Closed" }),
      ),
    ).toBe("CLOSED");
    expect(
      resolveDayScopedProductivityBucket(
        row({ morning: "Scheduled", evening: "CX Pending" }),
      ),
    ).toBe("CX_RESCHEDULE");
    expect(
      resolveDayScopedProductivityBucket(
        row({ morning: "", evening: "Engineer Delay" }),
      ),
    ).toBe("ENGINEER_DELAY");
  });

  it("treats a same-day closure as CLOSED whatever the columns say", () => {
    expect(
      resolveDayScopedProductivityBucket(
        row({ morning: "SSC Pending", sameDayClosedRow: true, closedSyntheticRow: true }),
      ),
    ).toBe("CLOSED");
  });

  it("treats Manual Entry Required as blank", () => {
    expect(
      resolveDayScopedProductivityBucket(
        row({ morning: "Manual Entry Required", evening: "Manual Entry Required" }),
      ),
    ).toBeNull();
  });
});

describe("computeEngineerProductivity — day-scoped Assigned/Attended", () => {
  it("counts a carried-Scheduled call (engineer set, untouched today) as Assigned, not Attended", () => {
    const result = computeEngineerProductivity([
      row({ ticketId: "W1", engineer: "Kumar", morning: "Scheduled" }),
    ]);

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.assigned).toBe(1);
    expect(result.list[0]?.attended).toBe(0);
    expect(result.totalAttended).toBe(0);
  });

  it("excludes a carried Part-Ordered call with no today Evening and no close", () => {
    const result = computeEngineerProductivity([
      row({ ticketId: "W2", engineer: "Kumar", morning: "SSC Pending" }),
    ]);

    expect(result.list).toHaveLength(0);
    expect(result.totalAttended).toBe(0);
  });

  it("moves a scheduled call to Assigned+Attended+Closed once Evening=Closed today", () => {
    const scheduled = computeEngineerProductivity([
      row({ ticketId: "W3", engineer: "Kumar", morning: "Scheduled" }),
    ]);
    expect(scheduled.list[0]?.assigned).toBe(1);
    expect(scheduled.list[0]?.attended).toBe(0);

    const closed = computeEngineerProductivity([
      row({ ticketId: "W3", engineer: "Kumar", morning: "Scheduled", evening: "Case-Closed" }),
    ]);
    expect(closed.list[0]?.assigned).toBe(1);
    expect(closed.list[0]?.attended).toBe(1);
    expect(closed.list[0]?.closed).toBe(1);
    expect(closed.list[0]?.closedTickets).toEqual(["W3"]);
  });

  it("counts CX Reschedule and Engineer Delay today as Assigned but not Attended", () => {
    const result = computeEngineerProductivity([
      row({ ticketId: "W4", engineer: "Kumar", morning: "Scheduled", evening: "CX Reschedule" }),
      row({ ticketId: "W5", engineer: "Kumar", morning: "Scheduled", evening: "Engineer Delay" }),
    ]);

    expect(result.list[0]?.assigned).toBe(2);
    expect(result.list[0]?.attended).toBe(0);
    expect(result.list[0]?.cxReschedule).toBe(1);
    expect(result.list[0]?.engineerDelay).toBe(1);
  });

  it("the 18→8 case: 8 planned/worked + 10 untouched backlog rows → Assigned = 8", () => {
    const rows = [
      // The day's plan: 3 still scheduled, 3 worked to an outcome, 2 closed today.
      row({ ticketId: "P1", engineer: "Ravi", morning: "Scheduled" }),
      row({ ticketId: "P2", engineer: "Ravi", morning: "To be Scheduled" }),
      row({ ticketId: "P3", engineer: "Ravi", morning: "Engg Assigned" }),
      row({ ticketId: "P4", engineer: "Ravi", morning: "Scheduled", evening: "SSC Pending" }),
      row({ ticketId: "P5", engineer: "Ravi", morning: "SSC Pending", evening: "Under Observation" }),
      row({ ticketId: "P6", engineer: "Ravi", morning: "Scheduled", evening: "CX Pending" }),
      row({ ticketId: "P7", engineer: "Ravi", sameDayClosedRow: true, closedSyntheticRow: true }),
      row({ ticketId: "P8", engineer: "Ravi", morning: "Scheduled", evening: "Case-Closed" }),
      // Carried-open backlog nobody touched today: excluded from Assigned.
      ...Array.from({ length: 6 }, (_, i) =>
        row({ ticketId: `B${i}`, engineer: "Ravi", morning: "SSC Pending" }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        row({ ticketId: `U${i}`, engineer: "Ravi", morning: "Under Observation" }),
      ),
    ];

    const result = computeEngineerProductivity(rows);
    expect(result.list).toHaveLength(1);
    const ravi = result.list[0];
    expect(ravi?.assigned).toBe(8);
    // Attended = SSC(P4) + UO(P5) + closed(P7, P8) — CX Pending (P6) is out.
    expect(ravi?.attended).toBe(4);
    expect(ravi?.closed).toBe(2);
    expect(ravi?.partOrdered).toBe(1);
    expect(ravi?.underObservation).toBe(1);
    expect(ravi?.cxReschedule).toBe(1);
  });

  it("requires an engineer for plan membership", () => {
    const result = computeEngineerProductivity([
      row({ ticketId: "W6", engineer: "", morning: "Scheduled" }),
      row({ ticketId: "W7", engineer: "Manual Entry Required", morning: "Scheduled" }),
    ]);
    expect(result.list).toHaveLength(0);
  });

  it("filters by region ASP codes and skips Request-to-Cancel + stale closed rows", () => {
    const result = computeEngineerProductivity(
      [
        row({ ticketId: "R1", engineer: "Vel", morning: "Scheduled", workLocation: "ASPS01463" }),
        row({ ticketId: "R2", engineer: "Che", morning: "Scheduled", workLocation: "ASPS01461" }),
        row({ ticketId: "R3", engineer: "Vel", morning: "Scheduled", workLocation: "ASPS01463", flexStatus: "Request to Cancel" }),
        // Closed by a previous day's upload: not on the Records page, not counted.
        row({ ticketId: "R4", engineer: "Vel", workLocation: "ASPS01463", closedSyntheticRow: true }),
      ],
      { regionAspCodes: ["ASPS01463"] },
    );

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.name).toBe("Vel");
    expect(result.list[0]?.assigned).toBe(1);
    expect(result.list[0]?.regionName).toBe("VELLORE");
  });

  it("dedupes by Ticket ID and merges engineer casing/alias variants", () => {
    const result = computeEngineerProductivity([
      row({ ticketId: "D1", engineer: "Lava Kumar", morning: "Scheduled" }),
      row({ ticketId: "D1", engineer: "Lava Kumar", morning: "Scheduled" }),
      row({ ticketId: "D2", engineer: "lava", morning: "Scheduled", evening: "Case-Closed" }),
    ]);

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.name).toBe("Lava");
    expect(result.list[0]?.assigned).toBe(2);
    expect(result.list[0]?.closed).toBe(1);
  });
});

describe("mergeEngineerProductivityResults", () => {
  it("merges live and frozen lists, summing counts per engineer", () => {
    const live = computeEngineerProductivity([
      row({ ticketId: "L1", engineer: "Kumar", morning: "Scheduled" }),
    ]);
    const frozen = computeEngineerProductivity([
      row({ ticketId: "F1", engineer: "Kumar", morning: "Scheduled", evening: "Case-Closed" }),
      row({ ticketId: "F2", engineer: "Anand", morning: "Scheduled" }),
    ]);

    const merged = mergeEngineerProductivityResults([live, frozen]);
    expect(merged.list).toHaveLength(2);
    const kumar = merged.list.find((entry) => entry.name === "Kumar");
    expect(kumar?.assigned).toBe(2);
    expect(kumar?.attended).toBe(1);
    expect(merged.totalAttended).toBe(1);
  });
});

describe("addToProductivityCounts", () => {
  it("rolls up: Assigned = whole plan, Attended = every post-scheduled status except CX/Delay", () => {
    const counts = emptyProductivityBucketCounts();

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

  // End of day, nothing left scheduled: the plan splits exactly into
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
