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
