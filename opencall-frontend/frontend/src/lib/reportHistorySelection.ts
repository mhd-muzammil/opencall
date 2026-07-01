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

// A report's business date can never be in the future. Historical data
// corruption (a mis-parsed title once wrote report_date = "2026-12-05") can
// leave such rows in the DB; without this guard they'd outrank every real
// report and get auto-restored forever. One day of slack absorbs timezone skew
// between the client clock and a report dated "today" in another timezone.
const FUTURE_REPORT_DATE_SLACK_MS = 24 * 60 * 60 * 1000;

export function getLatestCompletedReportSession(
  sessions: readonly ReportHistorySession[],
  nowMs: number = Date.now(),
): ReportHistorySession | null {
  const futureCutoff = nowMs + FUTURE_REPORT_DATE_SLACK_MS;

  let latest: ReportHistorySession | null = null;
  let latestReportDate = -Infinity;
  let latestTimestamp = -1;

  for (const session of sessions) {
    if (session.status !== "COMPLETED" || !session.reportId) {
      continue;
    }

    const reportDate = reportDateValue(session);

    // Skip impossible future-dated reports (corrupted data) — but only when the
    // date is known. Undated sessions (reportDate === -Infinity) still fall
    // through to the updatedAt tiebreak below.
    if (Number.isFinite(reportDate) && reportDate > futureCutoff) {
      continue;
    }

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
