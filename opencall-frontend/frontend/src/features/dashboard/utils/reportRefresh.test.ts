import { describe, expect, it } from "vitest";
import {
  isAutoSwitchCandidate,
  retainedAspSelection,
  shouldApplyReportRefresh,
} from "./reportRefresh";

describe("shouldApplyReportRefresh", () => {
  const base = { seq: 2, appliedSeq: 1, startedAt: 1_000, mutatedAt: 0 };

  it("applies a normal in-order response", () => {
    expect(shouldApplyReportRefresh(base)).toBe(true);
  });

  it("drops a response that a newer refresh already overtook", () => {
    expect(shouldApplyReportRefresh({ ...base, seq: 2, appliedSeq: 3 })).toBe(false);
  });

  it("applies a response whose sequence is the one already applied", () => {
    // Same seq means this IS the applied request re-checking itself, not a
    // stale one; only a strictly older sequence is out of order.
    expect(shouldApplyReportRefresh({ ...base, seq: 3, appliedSeq: 3 })).toBe(true);
  });

  it("drops a response computed before a save this session made", () => {
    // The reported bug: refresh leaves at t=1000, the user saves at t=1500, the
    // response arrives at t=30000 still describing the pre-save row and snaps
    // the status back to its old value.
    expect(
      shouldApplyReportRefresh({ ...base, startedAt: 1_000, mutatedAt: 1_500 }),
    ).toBe(false);
  });

  it("drops a tie between the request start and the save stamp", () => {
    expect(
      shouldApplyReportRefresh({ ...base, startedAt: 1_000, mutatedAt: 1_000 }),
    ).toBe(false);
  });

  it("applies a refresh started after the save was confirmed", () => {
    expect(
      shouldApplyReportRefresh({ ...base, startedAt: 2_000, mutatedAt: 1_500 }),
    ).toBe(true);
  });

  it("never blocks a session that has saved nothing", () => {
    expect(
      shouldApplyReportRefresh({ ...base, startedAt: 1, mutatedAt: 0 }),
    ).toBe(true);
  });
});

describe("retainedAspSelection", () => {
  it("keeps the selection across a report swap", () => {
    expect(retainedAspSelection("ASPS01462")).toBe("ASPS01462");
  });

  /**
   * The regression that put this bug back in production.
   *
   * The helper used to also require the ASP to appear in the incoming report's
   * regionBreakdown. The reset effect runs on every reportId change — every
   * FieldEZ worker cycle, ~15 minutes — and a region-scoped or partial Flex
   * upload produces a report with no rows for that ASP. The guard then returned
   * null and the dropdown silently fell back to "All ASP Codes" mid-shift, so
   * the employee kept working while looking at every region's calls.
   *
   * An empty grid under their own ASP is the honest outcome.
   */
  it("keeps the selection even when the report carries no rows for it", () => {
    expect(retainedAspSelection("ASPS09999")).toBe("ASPS09999");
  });

  it("treats the all-regions sentinel as no selection", () => {
    expect(retainedAspSelection("ALL")).toBeNull();
  });

  it("honours a custom all-regions sentinel", () => {
    expect(retainedAspSelection("__ALL__", "__ALL__")).toBeNull();
  });

  it("returns null when nothing was selected", () => {
    expect(retainedAspSelection(null)).toBeNull();
  });

  it("returns null for a blank or unusable code", () => {
    expect(retainedAspSelection("")).toBeNull();
    expect(retainedAspSelection("   ")).toBeNull();
  });
});

describe("isAutoSwitchCandidate", () => {
  const SUPER_ADMIN = "";
  const VELLORE = "6f1c2d3e-region-uuid";
  const CHENNAI = "9a8b7c6d-region-uuid";

  it("follows an unscoped report from any session", () => {
    // The worker's and every combined upload: regionId null, all regions inside.
    // This is the case the auto-switch exists for.
    expect(
      isAutoSwitchCandidate({ reportRegionId: null, currentRegionId: SUPER_ADMIN }),
    ).toBe(true);
    expect(
      isAutoSwitchCandidate({ reportRegionId: null, currentRegionId: VELLORE }),
    ).toBe(true);
  });

  it("never pulls a multi-region login onto a single-region upload", () => {
    // The reported bug: a SUPER_ADMIN working across every ASP got moved onto a
    // region-scoped report mid-shift, which narrowed the table to that one
    // region and reset the full-screen ASP Code filter to "All ASP Codes".
    expect(
      isAutoSwitchCandidate({ reportRegionId: VELLORE, currentRegionId: SUPER_ADMIN }),
    ).toBe(false);
  });

  it("follows a scoped report only from a session pinned to that region", () => {
    expect(
      isAutoSwitchCandidate({ reportRegionId: VELLORE, currentRegionId: VELLORE }),
    ).toBe(true);
    expect(
      isAutoSwitchCandidate({ reportRegionId: VELLORE, currentRegionId: CHENNAI }),
    ).toBe(false);
  });
});
