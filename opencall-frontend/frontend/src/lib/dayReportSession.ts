/**
 * Which stored report session speaks for a given day.
 *
 * A drill-down counted on a past day (Engineer Productivity on a specific date)
 * has to bring that day's report into the workspace, because the records table
 * is date-blind: it renders whatever `report` holds, and a call closed on day N
 * is only visible in day N's report. In any later report the same row is still
 * there but carries closedSyntheticRow=true / sameDayClosedRow=false, and the
 * records visibility filter drops it. Verified on real data: WO-035112213 closed
 * 14-07, visible in the 14-07 report, hidden in the 17-07 one.
 *
 * "The day's report" means its FINAL one — the most recent completed session —
 * which is the same session Engineer Productivity counts from. Picking any other
 * session would drill into numbers nothing on screen reported.
 */

export type DayReportSession = Readonly<{
  status: string;
  reportDate?: string | null;
  flexUploadBatchId?: string | null;
  createdAt: string;
}>;

export function findFinalSessionForDay<T extends DayReportSession>(
  sessions: readonly T[],
  reportDate: string | null | undefined,
): T | null {
  if (!reportDate) {
    return null;
  }

  // A session without a Flex batch cannot be regenerated, so it is not a
  // candidate however recent it is — restoring it would fail on the way in.
  const candidates = sessions.filter(
    (s) =>
      s.status === "COMPLETED" &&
      s.reportDate === reportDate &&
      Boolean(s.flexUploadBatchId),
  );

  if (candidates.length === 0) {
    return null;
  }

  return (
    [...candidates].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0] ?? null
  );
}
