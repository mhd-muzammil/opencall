import { describe, expect, it } from "vitest";
import {
  isAutoScheduledRemark,
  isScheduledRemarkTriggered,
  scheduledRemarkPreviewValue,
} from "./scheduledRemarkPreview";

const MANUAL = "Manual Entry Required";

// Base case: this edit session moves Morning status to Scheduled with an
// engineer chosen and an empty remarks box.
const base = {
  draftMorningStatus: "Scheduled",
  draftEveningStatus: "",
  persistedMorningStatus: "Actionable",
  persistedEveningStatus: "",
  draftEngineer: "Praveen",
  draftRemark: "",
  todayIso: "2026-07-29",
};

// A row that sat on Customer Pending yesterday: today's report carries that
// status AND that day's remark forward, and the editor now moves it to
// Scheduled with an engineer.
const carriedForward = {
  ...base,
  persistedMorningStatus: "Customer Pending",
  draftRemark: "Customer asked to call back after 2 PM",
  persistedRemark: "Customer asked to call back after 2 PM",
};

describe("isAutoScheduledRemark", () => {
  it("matches the exact generated template (any ordinal date)", () => {
    expect(isAutoScheduledRemark("Scheduled on 29th July")).toBe(true);
    expect(isAutoScheduledRemark("Scheduled on 1st August")).toBe(true);
    expect(isAutoScheduledRemark("Scheduled on 22nd July")).toBe(true);
    expect(isAutoScheduledRemark("  Scheduled on 3rd July  ")).toBe(true);
  });

  it("rejects human-edited variants", () => {
    expect(isAutoScheduledRemark("Scheduled on 29th July, customer confirmed")).toBe(false);
    expect(isAutoScheduledRemark("Rescheduled on 29th July")).toBe(false);
    expect(isAutoScheduledRemark("scheduled on 29th July")).toBe(false);
    expect(isAutoScheduledRemark("")).toBe(false);
    expect(isAutoScheduledRemark(null)).toBe(false);
  });
});

describe("isScheduledRemarkTriggered", () => {
  it("triggers when Morning moves to Scheduled with an engineer", () => {
    expect(isScheduledRemarkTriggered(base)).toBe(true);
  });

  it("triggers when Evening moves to Scheduled with an engineer", () => {
    expect(
      isScheduledRemarkTriggered({
        ...base,
        draftMorningStatus: "Actionable",
        persistedMorningStatus: "Actionable",
        draftEveningStatus: "Scheduled",
        persistedEveningStatus: "",
      }),
    ).toBe(true);
  });

  it("does not trigger without an engineer (empty or sentinel)", () => {
    expect(isScheduledRemarkTriggered({ ...base, draftEngineer: "" })).toBe(false);
    expect(isScheduledRemarkTriggered({ ...base, draftEngineer: MANUAL })).toBe(false);
  });

  it("does not trigger when the row was already Scheduled (no transition — the save path would not PATCH the status, so the server would not regenerate)", () => {
    expect(
      isScheduledRemarkTriggered({
        ...base,
        persistedMorningStatus: "Scheduled",
      }),
    ).toBe(false);
  });

  it("treats the Manual Entry Required sentinel as an empty persisted status", () => {
    expect(
      isScheduledRemarkTriggered({
        ...base,
        persistedMorningStatus: MANUAL,
      }),
    ).toBe(true);
  });

  it("does not trigger for non-scheduled statuses", () => {
    expect(
      isScheduledRemarkTriggered({ ...base, draftMorningStatus: "Customer Pending" }),
    ).toBe(false);
  });

  it("triggers when a carried-forward Customer Pending row moves to Scheduled", () => {
    expect(isScheduledRemarkTriggered(carriedForward)).toBe(true);
  });
});

describe("scheduledRemarkPreviewValue", () => {
  it("prefills the exact server template into an empty remarks box", () => {
    expect(scheduledRemarkPreviewValue(base)).toBe("Scheduled on 29th July");
  });

  it("prefills over the Manual Entry Required sentinel", () => {
    expect(scheduledRemarkPreviewValue({ ...base, draftRemark: MANUAL })).toBe(
      "Scheduled on 29th July",
    );
  });

  it("refreshes a stale previously auto-generated value", () => {
    expect(
      scheduledRemarkPreviewValue({ ...base, draftRemark: "Scheduled on 28th July" }),
    ).toBe("Scheduled on 29th July");
  });

  it("prefills over the remark a Customer Pending row carried in from a previous day", () => {
    expect(scheduledRemarkPreviewValue(carriedForward)).toBe("Scheduled on 29th July");
  });

  it("prefills over a carried-in remark that is itself yesterday's generated line", () => {
    expect(
      scheduledRemarkPreviewValue({
        ...carriedForward,
        draftRemark: "Scheduled on 28th July",
        persistedRemark: "Scheduled on 28th July",
      }),
    ).toBe("Scheduled on 29th July");
  });

  it("never clobbers text typed in this edit session over a carried-in remark", () => {
    expect(
      scheduledRemarkPreviewValue({
        ...carriedForward,
        draftRemark: "customer confirmed 4 PM slot",
      }),
    ).toBeNull();
  });

  it("leaves the carried-in remark alone until the row is actually being scheduled", () => {
    expect(
      scheduledRemarkPreviewValue({
        ...carriedForward,
        draftMorningStatus: "Customer Pending",
      }),
    ).toBeNull();
    expect(
      scheduledRemarkPreviewValue({ ...carriedForward, draftEngineer: "" }),
    ).toBeNull();
  });

  it("never clobbers text the user typed", () => {
    expect(
      scheduledRemarkPreviewValue({ ...base, draftRemark: "customer confirmed slot" }),
    ).toBeNull();
    expect(
      scheduledRemarkPreviewValue({
        ...base,
        draftRemark: "Scheduled on 29th July - confirmed",
      }),
    ).toBeNull();
  });

  it("returns null when the box already shows today's generated line", () => {
    expect(
      scheduledRemarkPreviewValue({ ...base, draftRemark: "Scheduled on 29th July" }),
    ).toBeNull();
  });

  it("returns null when the trigger does not hold", () => {
    expect(scheduledRemarkPreviewValue({ ...base, draftEngineer: "" })).toBeNull();
    expect(
      scheduledRemarkPreviewValue({ ...base, draftMorningStatus: "Actionable" }),
    ).toBeNull();
  });

  it("matches the ordinal date format across dates", () => {
    expect(scheduledRemarkPreviewValue({ ...base, todayIso: "2026-08-01" })).toBe(
      "Scheduled on 1st August",
    );
    expect(scheduledRemarkPreviewValue({ ...base, todayIso: "2026-07-22" })).toBe(
      "Scheduled on 22nd July",
    );
  });
});
