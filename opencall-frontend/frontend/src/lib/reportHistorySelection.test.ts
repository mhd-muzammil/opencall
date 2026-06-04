import { describe, expect, it } from "vitest";
import type { ReportHistorySession } from "./api/types";
import { getLatestCompletedReportSession } from "./reportHistorySelection";

function makeSession(overrides: Partial<ReportHistorySession>): ReportHistorySession {
  return {
    id: "session-1",
    title: "Daily Report",
    status: "COMPLETED",
    regionId: null,
    flexUploadBatchId: "flex-1",
    renderwaysUploadBatchId: null,
    callPlanUploadBatchId: null,
    reportId: "report-1",
    reportDate: "2026-06-04",
    totalRows: 10,
    createdAt: "2026-06-04T08:00:00.000Z",
    updatedAt: "2026-06-04T08:00:00.000Z",
    ...overrides,
  };
}

describe("getLatestCompletedReportSession", () => {
  it("returns the newest completed report even when an older one appears first", () => {
    const older = makeSession({
      id: "older",
      reportId: "older-report",
      updatedAt: "2026-06-04T08:00:00.000Z",
    });
    const latest = makeSession({
      id: "latest",
      reportId: "latest-report",
      updatedAt: "2026-06-04T09:00:00.000Z",
    });

    expect(getLatestCompletedReportSession([older, latest])).toBe(latest);
  });

  it("ignores draft sessions and completed sessions without a report id", () => {
    const draft = makeSession({
      id: "draft",
      status: "DRAFT",
      reportId: null,
      updatedAt: "2026-06-04T10:00:00.000Z",
    });
    const completedWithoutReport = makeSession({
      id: "missing-report",
      reportId: null,
      updatedAt: "2026-06-04T11:00:00.000Z",
    });
    const completed = makeSession({
      id: "completed",
      reportId: "completed-report",
      updatedAt: "2026-06-04T09:00:00.000Z",
    });

    expect(getLatestCompletedReportSession([draft, completedWithoutReport, completed])).toBe(completed);
  });

  it("falls back to createdAt when updatedAt is not parseable", () => {
    const older = makeSession({
      id: "older",
      updatedAt: "not-a-date",
      createdAt: "2026-06-04T08:00:00.000Z",
    });
    const latest = makeSession({
      id: "latest",
      updatedAt: "not-a-date",
      createdAt: "2026-06-04T09:00:00.000Z",
    });

    expect(getLatestCompletedReportSession([older, latest])).toBe(latest);
  });
});
