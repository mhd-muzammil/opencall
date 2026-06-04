import type { ReportHistorySession } from "./api/types";

function historySessionTimestamp(session: ReportHistorySession): number {
  const updatedAt = Date.parse(session.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;

  const createdAt = Date.parse(session.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

export function getLatestCompletedReportSession(
  sessions: readonly ReportHistorySession[],
): ReportHistorySession | null {
  let latest: ReportHistorySession | null = null;
  let latestTimestamp = -1;

  for (const session of sessions) {
    if (session.status !== "COMPLETED" || !session.reportId) {
      continue;
    }

    const timestamp = historySessionTimestamp(session);
    if (!latest || timestamp > latestTimestamp) {
      latest = session;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}
