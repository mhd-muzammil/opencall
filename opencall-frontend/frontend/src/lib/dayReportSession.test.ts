import { describe, expect, it } from "vitest";

import { findFinalSessionForDay } from "./dayReportSession";

const session = (
  over: Partial<{
    id: string;
    status: string;
    reportDate: string | null;
    flexUploadBatchId: string | null;
    createdAt: string;
  }> = {},
) => ({
  id: "s1",
  status: "COMPLETED",
  reportDate: "2026-09-04",
  flexUploadBatchId: "batch-1",
  createdAt: "2026-09-04T05:00:00.000Z",
  ...over,
});

describe("findFinalSessionForDay", () => {
  it("returns nothing when no day is asked for", () => {
    expect(findFinalSessionForDay([session()], null)).toBeNull();
    expect(findFinalSessionForDay([session()], undefined)).toBeNull();
    expect(findFinalSessionForDay([session()], "")).toBeNull();
  });

  it("picks the session for the day asked for, not another day's", () => {
    const wanted = session({ id: "want", reportDate: "2026-09-04" });
    const other = session({ id: "other", reportDate: "2026-09-05" });

    expect(findFinalSessionForDay([other, wanted], "2026-09-04")?.id).toBe("want");
  });

  it("picks the day's FINAL report when the day has several", () => {
    // The day Engineer Productivity counted is the day's last completed run;
    // an earlier run holds different numbers, so drilling into it would open
    // rows that no figure on screen reported.
    const morning = session({ id: "morning", createdAt: "2026-09-04T04:00:00.000Z" });
    const evening = session({ id: "evening", createdAt: "2026-09-04T14:30:00.000Z" });
    const midday = session({ id: "midday", createdAt: "2026-09-04T09:15:00.000Z" });

    expect(findFinalSessionForDay([morning, evening, midday], "2026-09-04")?.id).toBe(
      "evening",
    );
  });

  it("ignores sessions that never completed", () => {
    const draft = session({
      id: "draft",
      status: "DRAFT",
      createdAt: "2026-09-04T23:00:00.000Z",
    });
    const done = session({ id: "done", createdAt: "2026-09-04T06:00:00.000Z" });

    expect(findFinalSessionForDay([draft, done], "2026-09-04")?.id).toBe("done");
  });

  it("ignores a session with no Flex batch, however recent", () => {
    // Restoring it calls generate, which refuses without a Flex batch — so it
    // is not a candidate at all rather than a restore that fails on the way in.
    const batchless = session({
      id: "batchless",
      flexUploadBatchId: null,
      createdAt: "2026-09-04T23:00:00.000Z",
    });
    const usable = session({ id: "usable", createdAt: "2026-09-04T06:00:00.000Z" });

    expect(findFinalSessionForDay([batchless, usable], "2026-09-04")?.id).toBe("usable");
  });

  it("returns null when the day has no usable session", () => {
    // Special access has no history sessions at all; the caller falls back to
    // its own cached day report rather than leaving the wrong day on screen.
    expect(findFinalSessionForDay([], "2026-09-04")).toBeNull();
    expect(
      findFinalSessionForDay([session({ reportDate: "2026-09-01" })], "2026-09-04"),
    ).toBeNull();
  });
});
