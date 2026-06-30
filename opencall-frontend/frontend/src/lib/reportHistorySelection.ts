import type { ReportHistorySession } from "./api/types";

function historySessionTimestamp(session: ReportHistorySession): number {
  const updatedAt = Date.parse(session.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;

  const createdAt = Date.parse(session.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

// The business date the report is *for* (e.g. "2026-06-30"). This — not the
// last-edit time — is what decides which report is the "latest". Sessions with
// no parseable reportDate rank below every dated one.
function reportDateValue(session: ReportHistorySession): number {
  if (!session.reportDate) return -Infinity;
  const parsed = Date.parse(session.reportDate);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

export function getLatestCompletedReportSession(
  sessions: readonly ReportHistorySession[],
): ReportHistorySession | null {
  let latest: ReportHistorySession | null = null;
  let latestReportDate = -Infinity;
  let latestTimestamp = -1;

  for (const session of sessions) {
    if (session.status !== "COMPLETED" || !session.reportId) {
      continue;
    }

    const reportDate = reportDateValue(session);
    const timestamp = historySessionTimestamp(session);

    // Rank by reportDate first so the report for the most recent date always
    // wins, regardless of when any report was last edited or re-generated.
    // updatedAt/createdAt only breaks ties between same-date reports.
    const isNewer =
      !latest ||
      reportDate > latestReportDate ||
      (reportDate === latestReportDate && timestamp > latestTimestamp);

    if (isNewer) {
      latest = session;
      latestReportDate = reportDate;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}
