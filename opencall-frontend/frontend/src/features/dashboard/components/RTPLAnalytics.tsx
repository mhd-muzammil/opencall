// RTPL DASHBOARD + FLEX DASHBOARD analytics sections extracted from app/page.tsx
// (Phase 6.8). JSX preserved verbatim; props passed explicitly (no analytics-
// calculation, filtering, scope-selection, region-selection, handler, or
// modal-opening changes). openRtplCheckpointModal and openRecordsWithFilter are
// passed in unchanged. These two sections render unconditionally in page.tsx.
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  formatNumber,
  todayIsoDate,
  isWarrantyCase,
  isTradeCase,
  isActionableStatusValue,
  isPlannedStatusValue,
  isOnsiteStatusValue,
  isCaseClosedStatusValue,
  classifyFlexClosureOutcome,
  hasFlexClosureOutcome,
  isCancelledClosure,
} from "../utils";
import type { ReportRow, RtplCaseScope } from "../types";
import {
  ALL_REGIONS_FILTER,
  RTPL_CARRY_FORWARD_TIME_CARD_ID,
  type RtplTimeCardId,
  type RtplTimeCard,
  type RtplStatusMetric,
  buildRtplOperationalAnalytics,
  buildScheduledPlanMetric,
  normalizeStatusGroupKey,
  rtplEveningFirstStatusForAnalytics,
} from "../../../lib/reportDashboardAnalytics";
import { RTPL_STATUS_OPTIONS, isAttendedOutcomeStatus } from "@opencall/shared";

function calculateKpiMetricsForCardView(
  rows: ReportRow[],
  rowStatusMap: Record<string, string>,
  isBod: boolean
) {
  const active = isBod
    ? rows
    : rows.filter((r) => !r.carryForward.closedSyntheticRow);

  const closed = isBod
    ? []
    : rows.filter((r) => r.carryForward.closedSyntheticRow);

  const getUniqueEngineers = (items: typeof rows) => {
    const list = items
      .map((r) => String(r.output.Engineer ?? "").trim())
      .filter((name) => name && name !== "Manual Entry Required");
    return Array.from(new Set(list));
  };
  const uniqueEngineers = getUniqueEngineers(active);
  const engineerCount = uniqueEngineers.length;

  const getRowStatus = (r: typeof rows[number]): string => {
    const ticketId = String(r.output["Ticket ID"] || "").trim();
    return (rowStatusMap[ticketId] ?? "").trim();
  };

  // Present = the engineer has at least one "Scheduled" call under their name
  // that day; an engineer with no scheduled assignment is absent. So Presents
  // counts unique engineers over the Scheduled rows, not all engineers.
  const isScheduledStatus = (r: typeof rows[number]): boolean =>
    getRowStatus(r).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === "scheduled";
  const scheduledRows = active.filter(isScheduledStatus);
  const presentEngineers = getUniqueEngineers(scheduledRows);

  const matchStatus = (
    r: typeof rows[number],
    keywords: string[],
    excludes: string[] = []
  ): boolean => {
    const s = getRowStatus(r).toLowerCase();
    if (!s || s === "manual entry required") return false;
    const matchesKeyword = keywords.some(kw => s.includes(kw.toLowerCase()));
    const matchesExclude = excludes.some(ex => s.includes(ex.toLowerCase()));
    return matchesKeyword && !matchesExclude;
  };

  const getTicketIds = (items: typeof rows) => items.map(r => String(r.output["Ticket ID"] || "").trim());

  // Actionable = "Scheduled" + "To Be Scheduled" (shared definition).
  const actionableRows = active.filter(r => isActionableStatusValue(getRowStatus(r)));
  // Planned = Scheduled + Engineer Assigned (exact); onsite is its own bucket.
  const plannedRows = active.filter(r => isPlannedStatusValue(getRowStatus(r)));
  const enggOnsiteRows = active.filter(r => isOnsiteStatusValue(getRowStatus(r)));
  const toBeScheduleRows = active.filter(r => matchStatus(r, ["to be scheduled", "assignment pending", "non avl", "missed to schedule"]));
  const cxRescheduleRows = active.filter(r => matchStatus(r, ["cx pending", "reschedule", "cx", "cust delay", "customer delay", "customer pending"]));
  // Engineer Delay — mirrors the shared engineer-productivity classifier.
  const engineerDelayRows = active.filter(r => matchStatus(r, ["engineer delay", "eng delay"]));
  const sscPendingRows = active.filter(r => matchStatus(r, ["ssc pending", "ssc"]));
  const elevateTechRows = active.filter(r => matchStatus(r, ["elevation HP Pending", "elevation Part Pending", "elevation - HP Pending", "elevation - Partner Pending", "elevate"]));
  const underObservationRows = active.filter(r => matchStatus(r, ["CRT Pending", "CT Validation Pending", "observation", "under observation", "crt"]));
  const toBeYankRows = active.filter(r => matchStatus(r, ["Need to Yank", "Yank"]));
  const addPartOrderedRows = active.filter(r => matchStatus(r, ["Additional Part", "Part Order Pending", "Parts Hold", "Part need to order"]));
  const toBeCancelRows = active.filter(r => matchStatus(r, ["Need to Cancel", "Need to Cancel Mail", "Request to Cancel"]));
  
  // Trade now flows from the backend-derived Segment (single source of truth).
  const tradeOpenRows = isBod
    ? rows.filter((r) => isTradeCase(r))
    : rows.filter((r) => !r.carryForward.closedSyntheticRow && isTradeCase(r));

  // A vanished row Flex reports as "Closed - Canceled" is a cancellation, not a
  // completed close, whatever our own column says — see isCancelledClosure.
  const wasCancelled = (r: typeof rows[number]) =>
    isCancelledClosure(
      r.output as unknown as Record<string, unknown>,
      getRowStatus(r),
    );

  const closedCancelledRows = closed.filter(wasCancelled);
  const newCallsRows = active.filter((r) => r.comparison?.changeType === "NEW");

  // Closed Calls = an explicit "Case-Closed" status in this column, plus rows
  // that closed by vanishing from the day's Flex file (closed synthetic rows),
  // minus the cancellations — they belong to Closed cancelled only, never both.
  const caseClosedRows = [
    ...active.filter((r) => isCaseClosedStatusValue(getRowStatus(r))),
    ...closed.filter((r) => !wasCancelled(r)),
  ];

  return {
    engineerCount,
    enggPresents: presentEngineers.length,
    openCalls: active.length,
    actionable: actionableRows.length,
    planned: plannedRows.length,
    closedCalls: caseClosedRows.length,
    enggOnsite: enggOnsiteRows.length,
    toBeSchedule: toBeScheduleRows.length,
    cxReschedule: cxRescheduleRows.length,
    engineerDelay: engineerDelayRows.length,
    sscPending: sscPendingRows.length,
    elevateTech: elevateTechRows.length,
    underObservation: underObservationRows.length,
    toBeYank: toBeYankRows.length,
    closedCancelled: closedCancelledRows.length,
    addPartOrdered: addPartOrderedRows.length,
    toBeCancel: toBeCancelRows.length,
    newCalls: newCallsRows.length,
    tradeOpenCalls: tradeOpenRows.length,

    tickets: {
      engineerCount: getTicketIds(active),
      enggPresents: getTicketIds(scheduledRows),
      openCalls: getTicketIds(active),
      actionable: getTicketIds(actionableRows),
      planned: getTicketIds(plannedRows),
      closedCalls: getTicketIds(caseClosedRows),
      enggOnsite: getTicketIds(enggOnsiteRows),
      toBeSchedule: getTicketIds(toBeScheduleRows),
      cxReschedule: getTicketIds(cxRescheduleRows),
      engineerDelay: getTicketIds(engineerDelayRows),
      sscPending: getTicketIds(sscPendingRows),
      elevateTech: getTicketIds(elevateTechRows),
      underObservation: getTicketIds(underObservationRows),
      toBeYank: getTicketIds(toBeYankRows),
      closedCancelled: getTicketIds(closedCancelledRows),
      addPartOrdered: getTicketIds(addPartOrderedRows),
      toBeCancel: getTicketIds(toBeCancelRows),
      newCalls: getTicketIds(newCallsRows),
      tradeOpenCalls: getTicketIds(tradeOpenRows),
    }
  };
}

export function RTPLDashboard({
  rtplAnalyticsDate,
  setRtplAnalyticsDate,
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  rtplTimeCards,
  openRtplCheckpointModal,
  openRecordsWithFilter,
  bodSnapshot,
  onDownloadBodEod,
  hideTimeCards = false,
  loading = false,
}: Readonly<{
  rtplAnalyticsDate: string;
  setRtplAnalyticsDate: Dispatch<SetStateAction<string>>;
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  // Accepts a plain value setter or a React state dispatcher. The records-view
  // instance passes a handler that also re-filters the records table, not just
  // the analytics cards.
  setSelectedRtplCaseScope: (value: RtplCaseScope) => void;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: (value: string) => void;
  rtplTimeCards: RtplTimeCard[];
  selectedRtplTimeCard: RtplTimeCard | null;
  openRtplCheckpointModal: (cardId: RtplTimeCardId, status?: string | null) => void;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
    ticketIds?: string[] | null;
  }>) => void;
  /** ISO string of when BOD was fixed; null = not yet fixed */
  bodFixedTime: string | null;
  /**
   * Frozen snapshot of ticketId → rtplStatus captured when Fix BOD was clicked.
   * When set, BOD counts are derived from this map and never recalculated.
   * When null (before Fix BOD), BOD falls back to the dynamic carry-forward logic.
   */
  bodSnapshot: Record<string, string> | null;
  /** Called when user clicks "Fix BOD" button on Upload Time card */
  onFixBod: () => void;
  /** Called to download the status breakdown as an Excel workbook, scoped to one view. */
  onDownloadBodEod: (card: RtplTimeCard & { cardBod: number; cardEod: number; breakdown: Array<{ status: string; bodCount: number; eodCount: number }> }, mode: "bod" | "eod" | "both") => void;
  hideTimeCards?: boolean;
  /** True while a past Activity date's report is being fetched. */
  loading?: boolean;
}>) {
  // Set up the status order mapping helper based on RTPL_STATUS_OPTIONS
  const statusOrderMap = new Map<string, number>();
  RTPL_STATUS_OPTIONS.forEach((status, index) => {
    statusOrderMap.set(status.toLowerCase(), index);
  });

  // One rendered table node per BOD/EOD view, so "Download as image" captures
  // exactly the table the user is looking at.
  const bodEodTableRefs = useRef(new Map<string, HTMLDivElement>());
  // Which view's Image/Excel chooser is open ("bod" | "eod" | "both" | null).
  const [bodEodFormatPicker, setBodEodFormatPicker] = useState<string | null>(null);
  // The view currently being rendered to PNG (disables its buttons), and the last
  // capture failure — rendering happens in the browser and CAN fail (fonts,
  // memory), which must not end as a silently-dead button.
  const [bodEodImageBusy, setBodEodImageBusy] = useState<string | null>(null);
  const [bodEodImageError, setBodEodImageError] = useState<string | null>(null);

  async function downloadBodEodImage(mode: "bod" | "eod" | "both", label: string): Promise<void> {
    if (bodEodImageBusy) return;
    const wrap = bodEodTableRefs.current.get(mode);
    if (!wrap) return;
    // Capture the TABLE, not its scroll wrapper: the wrapper is overflow:auto, so a
    // capture of it clips whatever is scrolled out of view and paints the scrollbars
    // into the PNG. The table itself always has its full content size.
    const node = (wrap.querySelector("table") ?? wrap) as HTMLElement;
    setBodEodImageBusy(mode);
    setBodEodImageError(null);
    try {
      const { toPng } = await import("html-to-image");
      // pixelRatio 3: the on-screen table is 10px type; anything less reads blurry
      // when pasted into chat apps, which is what this download exists for.
      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 3,
        width: node.scrollWidth,
        height: node.scrollHeight,
      });
      const anchor = document.createElement("a");
      const datePart = (rtplAnalyticsDate || todayIsoDate()).replace(/[^0-9-]/g, "");
      anchor.href = dataUrl;
      anchor.download = `RTPL_${label.replace(/[^a-zA-Z0-9]+/g, "_")}_${datePart}.png`;
      anchor.click();
      setBodEodFormatPicker(null);
    } catch (error) {
      console.error("BOD/EOD image capture failed:", error);
      setBodEodImageError("Could not render the image — try again, or use Excel.");
    } finally {
      setBodEodImageBusy(null);
    }
  }

  const rtplStatusMetrics = useMemo(
    () => buildRtplOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  // Actionable = Scheduled + To Be Scheduled, shown as a pinned summary card
  // ahead of the per-status cards.
  //
  // The UNION of the Morning and Evening columns, taken per row so a case
  // sitting in both is counted once — byte-identical to `actionableEodRows`
  // below, which is what the BOD & EOD table's "Actionable Calls" row reports.
  //
  // This used to read the evening-first status instead, which answers a
  // different question ("still actionable right now") and made the card read 43
  // while the EOD table said 142 for the same day. Worse, it sat directly beside
  // the Morning-based "Scheduled (Plan)" card: Actionable is meant to CONTAIN
  // Scheduled, so a smaller number there is nonsense. Both pinned cards now read
  // the day as a whole and stay stable as calls move onto their outcomes.
  const actionableMetric = useMemo(() => {
    const rows = rtplAnalyticsRows.filter(
      (r) =>
        isActionableStatusValue(r.output["RTPL status"]) ||
        isActionableStatusValue(r.output["Evening status"]),
    );
    return {
      count: rows.length,
      ticketIds: rows
        .map((r) => String(r.output["Ticket ID"] ?? "").trim())
        .filter(Boolean),
    };
  }, [rtplAnalyticsRows]);

  // Scheduled (Plan) = the day's booked calls (Morning status exactly
  // "Scheduled"), pinned so the count survives the evening-first migration of
  // those calls onto their outcome cards. Always rendered, even at 0.
  const scheduledPlanMetric = useMemo(
    () => buildScheduledPlanMetric(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  // Ticket ids per evening-first status, keyed the SAME case-insensitive way
  // buildStatusAnalytics groups its cards — otherwise a card that merged two
  // spellings would drill into only one of them.
  const statusTicketIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rtplAnalyticsRows) {
      const key = normalizeStatusGroupKey(rtplEveningFirstStatusForAnalytics(row));
      if (!key) continue;
      const ticketId = String(row.output["Ticket ID"] ?? "").trim();
      if (!ticketId) continue;
      const list = map.get(key);
      if (list) {
        list.push(ticketId);
      } else {
        map.set(key, [ticketId]);
      }
    }
    return map;
  }, [rtplAnalyticsRows]);

  // Case-Closed uses the same definition as the EOD table's "Closed Calls" row:
  // an explicit Evening closure plus rows that closed by vanishing from the
  // day's Flex file (closed synthetic rows). The generic chips group by the
  // Morning column, which never says Case-Closed for a call closed today, so
  // this bucket is computed separately and any stale Morning-grouped
  // Case-Closed entry is dropped from the generic list below.
  const closureOutcomeMetrics = useMemo(() => {
    const closed: ReportRow[] = [];
    const cancelled: ReportRow[] = [];
    const unreported: ReportRow[] = [];

    for (const row of rtplAnalyticsRows) {
      const output = row.output as unknown as Record<string, unknown>;
      const markedCaseClosed = isCaseClosedStatusValue(
        String(output["Evening status"] ?? ""),
      );
      // Closed today = an Evening Case-Closed, or the call left the Flex file.
      const closedToday = row.carryForward.closedSyntheticRow || markedCaseClosed;
      if (!closedToday) continue;

      const flexOutcome = hasFlexClosureOutcome(output)
        ? classifyFlexClosureOutcome(output["Flex Status"])
        : "other";

      // A cancellation from Flex outranks everything: "Closed - Canceled" is an
      // abandoned call and is never billable, whatever our own column says.
      if (flexOutcome === "cancelled") {
        cancelled.push(row);
        continue;
      }

      // A completed close is either Flex confirming "WO Closed" OR one of the team
      // marking the case closed. Both are real closures and belong in the same
      // count — the split exists to keep CANCELLATIONS out, not to discount the
      // coordinators' own work while Flex catches up.
      if (flexOutcome === "closed" || markedCaseClosed) {
        closed.push(row);
        continue;
      }

      // Left the Flex file, nobody marked it closed, and Flex has not reported how
      // it ended. Genuinely unknown until the hourly closure sync says otherwise.
      unreported.push(row);
    }

    const ticketIdsOf = (rows: ReportRow[]) =>
      rows.map((r) => String(r.output["Ticket ID"] ?? "").trim()).filter(Boolean);

    return {
      closed: { count: closed.length, ticketIds: ticketIdsOf(closed) },
      cancelled: { count: cancelled.length, ticketIds: ticketIdsOf(cancelled) },
      unreported: { count: unreported.length, ticketIds: ticketIdsOf(unreported) },
    };
  }, [rtplAnalyticsRows]);

  const openStatusMetrics = useMemo(
    () => rtplStatusMetrics.filter((m) => !isCaseClosedStatusValue(m.status)),
    [rtplStatusMetrics],
  );

  const compareStatuses = (a: string, b: string): number => {
    const idxA = statusOrderMap.has(a.toLowerCase()) ? statusOrderMap.get(a.toLowerCase())! : 9999;
    const idxB = statusOrderMap.has(b.toLowerCase()) ? statusOrderMap.get(b.toLowerCase())! : 9999;
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return a.localeCompare(b);
  };

  interface BreakdownItem {
    status: string;
    bodCount: number;
    eodCount: number;
  }

  // 1. Compute BOD and EOD status for each row.
  //
  // BOD (Beginning of Day):
  //   - If bodSnapshot is set (Fix BOD was clicked) → use the frozen snapshot status.
  //     This is permanently locked and never changes after Fix BOD.
  //   - If no snapshot (Fix BOD not yet clicked) → derive dynamically from carry-forward
  //     data or the earliest status change today (legacy / pre-fix behaviour).
  //
  // EOD (End of Day):
  //   - Always the current live RTPL status from row.output — updates as edits happen.
  const rowStatusesList = rtplAnalyticsRows.map((row) => {
    const ticketId = String(row.output["Ticket ID"] || "").trim();

    // ── BOD ────────────────────────────────────────────────────────────────────
    let bodStatus: string;
    if (bodSnapshot !== null) {
      // FROZEN: use the snapshot captured at Fix BOD click time.
      bodStatus = bodSnapshot[ticketId] ?? "";
    } else {
      // DYNAMIC (fallback): derive from earliest status change today, then
      // carry-forward / previous report status (pre-Fix-BOD behaviour).
      const ticketChanges: any[] = [];
      rtplTimeCards.forEach((c) => {
        c.details.forEach((detail) => {
          if (detail.type === "change" && detail.ticketId === ticketId) {
            ticketChanges.push(detail);
          }
        });
      });

      bodStatus = "";
      if (ticketChanges.length > 0) {
        const sortedChanges = [...ticketChanges].sort((a, b) =>
          String(a.changedAt || "").localeCompare(String(b.changedAt || ""))
        );
        bodStatus = String(sortedChanges[0].fromStatus || "").trim();
      }

      if (!bodStatus || bodStatus.toLowerCase() === "manual entry required") {
        const prev = String(row.comparison?.previousRtplStatus || "").trim();
        bodStatus =
          prev && prev.toLowerCase() !== "manual entry required"
            ? prev
            : String(row.output["RTPL status"] || "").trim();
      }
    }

    // ── EOD ────────────────────────────────────────────────────────────────────
    // Always live: reflects the current status at any given checkpoint.
    // For the Upload Time card specifically, the "upload-time EOD" is the
    // earliest from-status (same as old logic) so existing cards stay correct.
    let uploadTimeEodStatus = String(row.output["RTPL status"] || "").trim();
    if (bodSnapshot === null) {
      // Only apply the old upload-time-EOD override when no snapshot is set
      // (pre-Fix-BOD), to preserve the original carry-forward baseline display.
      const ticketChanges: any[] = [];
      rtplTimeCards.forEach((c) => {
        c.details.forEach((detail) => {
          if (detail.type === "change" && detail.ticketId === ticketId) {
            ticketChanges.push(detail);
          }
        });
      });
      if (ticketChanges.length > 0) {
        const sortedChanges = [...ticketChanges].sort((a, b) =>
          String(a.changedAt || "").localeCompare(String(b.changedAt || ""))
        );
        const earliestFrom = String(sortedChanges[0].fromStatus || "").trim();
        if (earliestFrom && earliestFrom.toLowerCase() !== "manual entry required") {
          uploadTimeEodStatus = earliestFrom;
        }
      }
    }

    return {
      ticketId,
      bodStatus,
      uploadTimeEodStatus,
    };
  });

  // 2. Gather status counts and active statuses for each card
  const allActiveStatuses = new Set<string>();
  const cardStatusCountsList = rtplTimeCards.map((card) => {
    // BOD = the Morning ("RTPL status") column; EOD = the "Evening status"
    // column. Both are read straight from each row so the BOD/EOD tables match
    // the records grid exactly. Placeholder/blank values are treated as "no
    // status" so they are not counted (Evening is blank until worked).
    const cleanStatus = (value: string): string => {
      const trimmed = (value ?? "").trim();
      return !trimmed || trimmed.toLowerCase() === "manual entry required" ? "" : trimmed;
    };
    const rowsWithStatuses = rtplAnalyticsRows.map((r) => ({
      ticketId: String(r.output["Ticket ID"] || "").trim(),
      bodStatus: cleanStatus(String(r.output["RTPL status"] ?? "")),
      eodStatus: cleanStatus(String(r.output["Evening status"] ?? "")),
    }));

    const cardBod = rowsWithStatuses.filter((r) => r.bodStatus).length;
    const cardEod = rowsWithStatuses.filter((r) => r.eodStatus).length;

    const statusCounts = new Map<string, { bod: number; eod: number }>();
    rowsWithStatuses.forEach(({ bodStatus, eodStatus }) => {
      if (bodStatus) {
        const counts = statusCounts.get(bodStatus) || { bod: 0, eod: 0 };
        counts.bod++;
        statusCounts.set(bodStatus, counts);
        allActiveStatuses.add(bodStatus);
      }
      if (eodStatus) {
        const counts = statusCounts.get(eodStatus) || { bod: 0, eod: 0 };
        counts.eod++;
        statusCounts.set(eodStatus, counts);
        allActiveStatuses.add(eodStatus);
      }
    });

    const bodStatusMap: Record<string, string> = {};
    const eodStatusMap: Record<string, string> = {};
    rowsWithStatuses.forEach((r) => {
      bodStatusMap[r.ticketId] = r.bodStatus;
      eodStatusMap[r.ticketId] = r.eodStatus;
    });

    // Attended = a planned case (Morning Scheduled / Engineer Assigned) whose
    // Evening status shows the visit actually happened. An Evening set back to
    // Scheduled/Assigned is still just booked, not attended. Needs both
    // columns, so it lives here rather than in calculateKpiMetricsForCardView.
    //
    // The outcome test is the SHARED one Engineer Productivity uses
    // (isAttendedOutcomeStatus), so the two pages report the same number for
    // the same day. Previously this counted any status that was merely not a
    // planning status, which swept in Customer Pending and Engineer Delay —
    // outcomes that mean the visit did NOT take place. For 05-08-2026 that
    // read 110 attended against productivity's 73, the 37 difference being
    // exactly those two buckets.
    const attendedRows = rowsWithStatuses.filter(
      (r) =>
        isPlannedStatusValue(r.bodStatus) && isAttendedOutcomeStatus(r.eodStatus),
    );
    const attendedTicketIds = attendedRows.map((r) => r.ticketId);

    // Actionable / Scheduled in the Evening = the Morning population PLUS
    // whatever became actionable/scheduled later in the day: the union of the
    // two columns, taken per row so a case sitting in both is counted once.
    // The Morning half is read over every row (a call actionable at 9 AM still
    // counts once it closes), so the EOD figure can never fall below BOD.
    // Both need the two columns together, so they live here rather than in
    // calculateKpiMetricsForCardView, which only ever sees one column.
    const actionableEodRows = rowsWithStatuses.filter(
      (r) =>
        isActionableStatusValue(r.bodStatus) || isActionableStatusValue(r.eodStatus),
    );
    const plannedEodRows = rowsWithStatuses.filter(
      (r) => isPlannedStatusValue(r.bodStatus) || isPlannedStatusValue(r.eodStatus),
    );

    const bodBase = calculateKpiMetricsForCardView(rtplAnalyticsRows, bodStatusMap, true);
    const eodBase = calculateKpiMetricsForCardView(rtplAnalyticsRows, eodStatusMap, false);
    // Attended is an EOD-only outcome; the BOD side stays empty by definition.
    const bodKpiMetrics = {
      ...bodBase,
      attended: 0,
      tickets: { ...bodBase.tickets, attended: [] as string[] },
    };
    // Actionable and Scheduled read as a whole-day population, not an
    // Evening-only snapshot: the live Evening count alone collapses to ~0 once
    // the morning's booked calls move onto their outcome status. Both take the
    // Morning ∪ Evening union computed above; every other row stays
    // Evening-only.
    const eodKpiMetrics = {
      ...eodBase,
      attended: attendedRows.length,
      actionable: actionableEodRows.length,
      planned: plannedEodRows.length,
      tickets: {
        ...eodBase.tickets,
        attended: attendedTicketIds,
        actionable: actionableEodRows.map((r) => r.ticketId),
        planned: plannedEodRows.map((r) => r.ticketId),
      },
    };

    return {
      card,
      cardBod,
      cardEod,
      statusCounts,
      bodKpiMetrics,
      eodKpiMetrics,
    };
  });

  // 3. Sort all active statuses using the order from RTPL_STATUS_OPTIONS
  const sortedActiveStatuses = Array.from(allActiveStatuses).sort(compareStatuses);

  // 4. Build the final checkpointCards with identical status list ordered consistently
  const checkpointCards = cardStatusCountsList.map(({ card, cardBod, cardEod, statusCounts, bodKpiMetrics, eodKpiMetrics }) => {
    let breakdown: BreakdownItem[] = [];

    // Only display status items if the card actually has data (bod or eod > 0)
    if (cardBod > 0 || cardEod > 0) {
      breakdown = sortedActiveStatuses.map((status) => {
        const counts = statusCounts.get(status) || { bod: 0, eod: 0 };
        return {
          status,
          bodCount: counts.bod,
          eodCount: counts.eod,
        };
      });
    }

    return {
      ...card,
      cardBod,
      cardEod,
      breakdown,
      bodKpiMetrics,
      eodKpiMetrics,
    };
  });

  return (
    <div className="rtplAnalyticsSection">
      <div className="sectionHeader rtplAnalyticsHeader">
        <div>
          <h3>RTPL HOURES STATUS</h3>
          <p>
            View RTPL movement by all cases, warranty cases, or 01-Trade non-warranty cases.
          </p>
        </div>
        <div className="rtplAnalyticsHeaderActions">
          <label className="rtplAnalyticsDatePicker">
            <span>Activity date</span>
            <input
              type="date"
              value={rtplAnalyticsDate}
              onChange={(event) => {
                setRtplAnalyticsDate(event.target.value || todayIsoDate());
              }}
            />
          </label>
          <span className="statusBadge neutral">
            {loading ? "Loading…" : `${rtplAnalyticsRows.length} rows`}
          </span>
        </div>
      </div>

      <div className="rtplScopeTabs" aria-label="RTPL analytics case type view">
        {rtplCaseScopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rtplScopeTab ${selectedRtplCaseScope === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplCaseScope(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
            <strong>{formatNumber(option.count)}</strong>
          </button>
        ))}
      </div>

      <div className="regionFilterTabs" aria-label="RTPL analytics region filter">
        {rtplRegionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`regionFilterTab ${selectedRtplRegion === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplRegion(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>

      {rtplStatusMetrics.length > 0 ||
      closureOutcomeMetrics.closed.count > 0 ||
      closureOutcomeMetrics.cancelled.count > 0 ||
      closureOutcomeMetrics.unreported.count > 0 ? (
        <div className="rtplMetricGrid" style={{ marginBottom: "20px" }}>
          <button
            className="rtplMetricCard"
            type="button"
            style={{ border: "1.5px solid #4f46e5", background: "#eef2ff" }}
            onClick={() =>
              openRecordsWithFilter({
                region:
                  selectedRtplRegion === ALL_REGIONS_FILTER
                    ? null
                    : selectedRtplRegion,
                ticketIds: actionableMetric.ticketIds,
              })
            }
            title="Actionable = Scheduled + To Be Scheduled"
          >
            <span>Actionable</span>
            <strong>{actionableMetric.count}</strong>
          </button>
          <button
            className="rtplMetricCard"
            type="button"
            style={{ border: "1.5px solid #0f766e", background: "#f0fdfa" }}
            onClick={() =>
              openRecordsWithFilter({
                region:
                  selectedRtplRegion === ALL_REGIONS_FILTER
                    ? null
                    : selectedRtplRegion,
                ticketIds: scheduledPlanMetric.ticketIds,
              })
            }
            title="Scheduled (Plan) = calls booked today (Morning status exactly 'Scheduled'). By evening each booked call counts under its outcome card (Case-Closed, Customer Pending, …); Engineer Productivity's Assigned = these calls with an engineer."
          >
            <span>Scheduled (Plan)</span>
            <strong>{scheduledPlanMetric.count}</strong>
          </button>
          {/* How today's closures actually ended, per FLEX. Kept as three separate
              cards because only "WO Closed" is billable — adding a cancellation to it
              answers no question anyone has. */}
          {(
            [
              {
                key: "closed",
                label: "Case-Closed",
                metric: closureOutcomeMetrics.closed,
                title:
                  "Closed today: Flex reports WO Closed, or one of the team marked the case closed. Cancellations are excluded.",
              },
              {
                key: "cancelled",
                label: "Closed-cancelled",
                metric: closureOutcomeMetrics.cancelled,
                title:
                  "Closed today that Flex reports as Closed - Canceled — abandoned calls, not billable.",
              },
              {
                key: "unreported",
                label: "Closed (Flex pending)",
                metric: closureOutcomeMetrics.unreported,
                title:
                  "Left the Flex file, nobody marked the case closed, and Flex has not reported how it ended. The hourly closure sync moves these into one of the other two.",
              },
            ] as const
          ).map(({ key, label, metric, title }) =>
            metric.count > 0 ? (
              <button
                className="rtplMetricCard"
                key={key}
                type="button"
                onClick={() =>
                  openRecordsWithFilter({
                    region:
                      selectedRtplRegion === ALL_REGIONS_FILTER
                        ? null
                        : selectedRtplRegion,
                    ticketIds: metric.ticketIds,
                  })
                }
                title={title}
              >
                <span>{label}</span>
                <strong>{metric.count}</strong>
              </button>
            ) : null,
          )}
          {openStatusMetrics.map((metric, metricIndex) => (
            <button
              className="rtplMetricCard"
              key={`${metric.status || "blank"}-${metricIndex}`}
              type="button"
              onClick={() =>
                openRecordsWithFilter({
                  region:
                    selectedRtplRegion === ALL_REGIONS_FILTER
                      ? null
                      : selectedRtplRegion,
                  // Evening-first counts can't be reproduced by a Morning-status
                  // filter, so hand over the exact tickets the card counted
                  // (same pattern as the Actionable card).
                  ticketIds:
                    statusTicketIds.get(normalizeStatusGroupKey(metric.status)) ?? null,
                })
              }
              title={`Open ${metric.status} records`}
            >
              <span>{metric.status}</span>
              <strong>{metric.count}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="rtplEmptyState" style={{ marginBottom: "20px" }}>
          No RTPL statuses for the selected region.
        </div>
      )}

      {!hideTimeCards && (
        <div className="rtplTimeCardGrid" aria-label="RTPL BOD / EOD summary">
          {/* Only the "Upload Time" baseline BOD/EOD table is shown. The
              clock-time checkpoint cards (11:45 AM / 2:00 PM / 4:00 PM / 6:00 PM)
              were removed per request; this single card carries the BOD/EOD
              table and its download. */}
          {checkpointCards
            .filter((card) => card.id === RTPL_CARRY_FORWARD_TIME_CARD_ID)
            .flatMap((card) =>
              ([
                { mode: "bod", title: "BOD", showBod: true, showEod: false },
                { mode: "eod", title: "EOD", showBod: false, showEod: true },
                { mode: "both", title: "BOD & EOD", showBod: true, showEod: true },
              ] as const).map((view) => {
            const valueColCount = (view.showBod ? 1 : 0) + (view.showEod ? 1 : 0);

            return (
              <div
                key={`${card.id}-${view.mode}`}
                className="rtplTimeCard"
              >
                <div className="rtplTimeCardHeader" onClick={() => openRtplCheckpointModal(card.id)}>
                  <span className="rtplTimeCardTitle">{view.title}</span>
                  <span className="rtplTimeCardBadge baseline">BASELINE</span>
                </div>

                {(() => {
                  let formattedDate = rtplAnalyticsDate;
                  if (rtplAnalyticsDate && rtplAnalyticsDate.includes("-")) {
                    const parts = rtplAnalyticsDate.split("-");
                    if (parts.length === 3) {
                      formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                  }
                  const regionLabel = rtplRegionOptions.find((o) => o.value === selectedRtplRegion)?.label || selectedRtplRegion;

                  const metricsRows = [
                    { id: 1, desc: "Engineer Count", key: "engineerCount" },
                    { id: 2, desc: "No.of Engg Presents", key: "enggPresents" },
                    { id: 3, desc: "Open Calls", key: "openCalls" },
                    { id: 4, desc: "Actionable Calls", key: "actionable" },
                    { id: 5, desc: "Scheduled Calls", key: "planned" },
                    { id: 6, desc: "Attended", key: "attended", isEodOnly: true },
                    { id: 7, desc: "Closed Calls", key: "closedCalls", isEodOnly: true, alert: true },
                    { id: 8, desc: "Engg onsite", key: "enggOnsite" },
                    { id: 9, desc: "To be schedule", key: "toBeSchedule" },
                    { id: 10, desc: "Customer Pending", key: "cxReschedule" },
                    { id: 11, desc: "Engineer Delay", key: "engineerDelay" },
                    { id: 12, desc: "SSC Pending Calls", key: "sscPending" },
                    { id: 13, desc: "Elevate/Tech Support Calls", key: "elevateTech" },
                    { id: 14, desc: "Under observation Calls", key: "underObservation" },
                    { id: 15, desc: "To be Yank", key: "toBeYank" },
                    { id: 16, desc: "Closed cancelled", key: "closedCancelled", isEodOnly: true },
                    { id: 17, desc: "Add.Part ordered", key: "addPartOrdered", alert: true },
                    { id: 18, desc: "To be Cancel", key: "toBeCancel" },
                    { id: 19, desc: "New calls", key: "newCalls", isEodOnly: true, alert: true },
                    { id: 20, desc: "Trade Open Calls", key: "tradeOpenCalls" },
                  ] as const;

                  const renderCell = (
                    val: number,
                    isAlert: boolean,
                    isEmptyOverride: boolean,
                    ticketsList: string[]
                  ) => {
                    const displayVal = isEmptyOverride || val === 0 ? "" : val;
                    const hasValue = displayVal !== "";
                    const cellBg = isAlert ? "#fef08a" : "transparent";
                    const cellColor = isAlert ? "#854d0e" : "#0f172a";

                    return (
                      <td
                        style={{
                          padding: "2px 4px",
                          border: "1px solid #000000",
                          textAlign: "center",
                          background: cellBg,
                          color: cellColor,
                          fontWeight: "bold",
                          cursor: hasValue ? "pointer" : "default",
                          userSelect: "none"
                        }}
                        onClick={(e) => {
                          if (hasValue) {
                            e.stopPropagation();
                            openRecordsWithFilter({
                              region: selectedRtplRegion === ALL_REGIONS_FILTER ? null : selectedRtplRegion,
                              ticketIds: ticketsList,
                            });
                          }
                        }}
                        title={hasValue ? `Show these ${displayVal} records` : undefined}
                      >
                        {displayVal}
                      </td>
                    );
                  };

                  return (
                    <div
                      className="rtplTimeCardTableWrap"
                      ref={(el) => {
                        if (el) bodEodTableRefs.current.set(view.mode, el);
                        else bodEodTableRefs.current.delete(view.mode);
                      }}
                      style={{
                        overflowX: "auto",
                        margin: "12px 0",
                        border: "1px solid #000000",
                        borderRadius: "4px"
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "10px"
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#0ea5e9", color: "#000000", fontWeight: "bold" }}>
                            <th colSpan={2} style={{ padding: "3px 6px", border: "1px solid #000000", textAlign: "left", fontSize: "10px" }}>
                              {formattedDate}
                            </th>
                            <th colSpan={valueColCount} style={{ padding: "3px 6px", border: "1px solid #000000", textAlign: "right", fontSize: "10px" }}>
                              {regionLabel}
                            </th>
                          </tr>
                          <tr style={{ background: "#fef08a", color: "#000000", fontWeight: "bold" }}>
                            <th style={{ width: "30px", padding: "3px 4px", border: "1px solid #000000", textAlign: "center" }}>S.No</th>
                            <th style={{ padding: "3px 6px", border: "1px solid #000000", textAlign: "left" }}>Description</th>
                            {view.showBod && <th style={{ width: "40px", padding: "3px 4px", border: "1px solid #000000", textAlign: "center" }}>BOD</th>}
                            {view.showEod && <th style={{ width: "40px", padding: "3px 4px", border: "1px solid #000000", textAlign: "center" }}>EOD</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {metricsRows.map((metric) => {
                            const bodVal = card.bodKpiMetrics[metric.key as keyof typeof card.bodKpiMetrics] as number;
                            const eodVal = card.eodKpiMetrics[metric.key as keyof typeof card.eodKpiMetrics] as number;

                            const bodTickets = card.bodKpiMetrics.tickets[metric.key as keyof typeof card.bodKpiMetrics.tickets] || [];
                            const eodTickets = card.eodKpiMetrics.tickets[metric.key as keyof typeof card.eodKpiMetrics.tickets] || [];

                            const isAlert = !!(metric as any).alert;
                            const isEodOnly = !!(metric as any).isEodOnly;

                            return (
                              <tr key={metric.id} style={{ background: "#ffffff" }}>
                                <td
                                  style={{
                                    padding: "2px 4px",
                                    border: "1px solid #000000",
                                    textAlign: "center",
                                    fontWeight: "bold",
                                    color: "#000000"
                                  }}
                                >
                                  {metric.id}
                                </td>
                                <td
                                  style={{
                                    padding: "2px 6px",
                                    border: "1px solid #000000",
                                    textAlign: "left",
                                    fontWeight: "bold",
                                    color: "#000000",
                                    whiteSpace: "nowrap"
                                  }}
                                >
                                  {metric.desc}
                                </td>
                                {view.showBod && renderCell(bodVal, isAlert, isEodOnly, bodTickets)}
                                {view.showEod && renderCell(eodVal, isAlert, false, eodTickets)}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Action row — every view (BOD, EOD, BOD & EOD) downloads itself.
                    Clicking 📥 opens the format chooser; Image captures the table
                    exactly as rendered, Excel builds the status-breakdown sheet
                    scoped to this view's columns. ("Fix BOD" was removed: BOD is
                    the Morning column, already the fixed start-of-day value.) */}
                {(card.cardBod > 0 || card.cardEod > 0) && (
                  <div style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {bodEodFormatPicker === view.mode ? (
                      <>
                        {bodEodImageError && (
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#b91c1c" }}>
                            {bodEodImageError}
                          </span>
                        )}
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>
                          Download {view.title} as
                        </span>
                        <button
                          type="button"
                          disabled={bodEodImageBusy !== null}
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #047857",
                            background: "linear-gradient(135deg, #059669, #047857)",
                            color: "#ffffff",
                            cursor: bodEodImageBusy ? "wait" : "pointer",
                            opacity: bodEodImageBusy ? 0.7 : 1,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadBodEodImage(view.mode, `${view.title}_${card.label}`);
                          }}
                          title={`Download the ${view.title} table as a PNG image`}
                        >
                          {bodEodImageBusy === view.mode ? "Rendering…" : "🖼 Image"}
                        </button>
                        <button
                          type="button"
                          disabled={bodEodImageBusy !== null}
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #0369a1",
                            background: "linear-gradient(135deg, #0284c7, #0369a1)",
                            color: "#ffffff",
                            cursor: bodEodImageBusy ? "wait" : "pointer",
                            opacity: bodEodImageBusy ? 0.7 : 1,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBodEodFormatPicker(null);
                            setBodEodImageError(null);
                            onDownloadBodEod(card, view.mode);
                          }}
                          title={`Download the ${view.title} status breakdown as Excel`}
                        >
                          📊 Excel
                        </button>
                        <button
                          type="button"
                          disabled={bodEodImageBusy !== null}
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                            color: "#475569",
                            cursor: bodEodImageBusy ? "wait" : "pointer",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBodEodFormatPicker(null);
                            setBodEodImageError(null);
                          }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid #0369a1",
                          background: "linear-gradient(135deg, #0284c7, #0369a1)",
                          color: "#ffffff",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBodEodImageError(null);
                          setBodEodFormatPicker(view.mode);
                        }}
                        title={`Download ${view.title} for ${card.label} — choose image or Excel`}
                      >
                        📥 {view.title}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
}

export function FlexDashboard({
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  flexStatusMetrics,
  openRecordsWithFilter,
}: Readonly<{
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  setSelectedRtplCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: Dispatch<SetStateAction<string>>;
  flexStatusMetrics: RtplStatusMetric[];
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
    ticketIds?: string[] | null;
  }>) => void;
}>) {
  return (
    <div className="rtplAnalyticsSection">
      <div className="sectionHeader rtplAnalyticsHeader">
        <div>
          <h3>FLEX DASHBOARD</h3>
          <p>
            View Flex status load by all cases, warranty cases, or 01-Trade non-warranty cases.
          </p>
        </div>
        <span className="statusBadge neutral">
          {rtplAnalyticsRows.length} rows
        </span>
      </div>

      <div className="rtplScopeTabs" aria-label="Flex analytics case type view">
        {rtplCaseScopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rtplScopeTab ${selectedRtplCaseScope === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplCaseScope(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
            <strong>{formatNumber(option.count)}</strong>
          </button>
        ))}
      </div>

      <div className="regionFilterTabs" aria-label="Flex analytics region filter">
        {rtplRegionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`regionFilterTab ${selectedRtplRegion === option.value ? "active" : ""}`}
            onClick={() => setSelectedRtplRegion(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </div>

      {flexStatusMetrics.length > 0 ? (
        <div className="rtplMetricGrid">
          {flexStatusMetrics.map((metric, metricIndex) => (
            <button
              className="rtplMetricCard"
              key={`${metric.status || "blank"}-${metricIndex}`}
              type="button"
              onClick={() =>
                openRecordsWithFilter({
                  region:
                    selectedRtplRegion === ALL_REGIONS_FILTER
                      ? null
                      : selectedRtplRegion,
                  flexStatus: metric.status,
                  warrantyOnly: selectedRtplCaseScope === "warranty",
                  tradeOnly: selectedRtplCaseScope === "trade",
                })
              }
              title={`Open ${metric.status} records`}
            >
              <span>{metric.status}</span>
              <strong>{metric.count}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="rtplEmptyState">
          No Flex statuses for the selected region.
        </div>
      )}
    </div>
  );
}

export function RTPLAnalytics({
  rtplAnalyticsDate,
  setRtplAnalyticsDate,
  rtplAnalyticsRows,
  rtplCaseScopeOptions,
  selectedRtplCaseScope,
  setSelectedRtplCaseScope,
  rtplRegionOptions,
  selectedRtplRegion,
  setSelectedRtplRegion,
  rtplTimeCards,
  selectedRtplTimeCard,
  flexStatusMetrics,
  openRtplCheckpointModal,
  openRecordsWithFilter,
  bodFixedTime,
  bodSnapshot,
  onFixBod,
  onDownloadBodEod,
}: Readonly<{
  rtplAnalyticsDate: string;
  setRtplAnalyticsDate: Dispatch<SetStateAction<string>>;
  rtplAnalyticsRows: ReportRow[];
  rtplCaseScopeOptions: Array<{ value: RtplCaseScope; label: string; description: string; count: number }>;
  selectedRtplCaseScope: RtplCaseScope;
  setSelectedRtplCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  rtplRegionOptions: Array<{ value: string; label: string; count: number }>;
  selectedRtplRegion: string;
  setSelectedRtplRegion: Dispatch<SetStateAction<string>>;
  rtplTimeCards: RtplTimeCard[];
  selectedRtplTimeCard: RtplTimeCard | null;
  flexStatusMetrics: RtplStatusMetric[];
  openRtplCheckpointModal: (cardId: RtplTimeCardId, status?: string | null) => void;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    rtplStatus?: string | null;
    flexStatus?: string | null;
    warrantyOnly?: boolean;
    tradeOnly?: boolean;
    ticketIds?: string[] | null;
  }>) => void;
  bodFixedTime: string | null;
  /** Frozen snapshot of ticketId → rtplStatus at Fix BOD click time. */
  bodSnapshot: Record<string, string> | null;
  onFixBod: () => void;
  onDownloadBodEod: (card: RtplTimeCard & { cardBod: number; cardEod: number; breakdown: Array<{ status: string; bodCount: number; eodCount: number }> }, mode: "bod" | "eod" | "both") => void;
}>) {
  return (
    <>
      <RTPLDashboard
        rtplAnalyticsDate={rtplAnalyticsDate}
        setRtplAnalyticsDate={setRtplAnalyticsDate}
        rtplAnalyticsRows={rtplAnalyticsRows}
        rtplCaseScopeOptions={rtplCaseScopeOptions}
        selectedRtplCaseScope={selectedRtplCaseScope}
        setSelectedRtplCaseScope={setSelectedRtplCaseScope}
        rtplRegionOptions={rtplRegionOptions}
        selectedRtplRegion={selectedRtplRegion}
        setSelectedRtplRegion={setSelectedRtplRegion}
        rtplTimeCards={rtplTimeCards}
        selectedRtplTimeCard={selectedRtplTimeCard}
        openRtplCheckpointModal={openRtplCheckpointModal}
        openRecordsWithFilter={openRecordsWithFilter}
        bodFixedTime={bodFixedTime}
        bodSnapshot={bodSnapshot}
        onFixBod={onFixBod}
        onDownloadBodEod={onDownloadBodEod}
      />
      <FlexDashboard
        rtplAnalyticsRows={rtplAnalyticsRows}
        rtplCaseScopeOptions={rtplCaseScopeOptions}
        selectedRtplCaseScope={selectedRtplCaseScope}
        setSelectedRtplCaseScope={setSelectedRtplCaseScope}
        rtplRegionOptions={rtplRegionOptions}
        selectedRtplRegion={selectedRtplRegion}
        setSelectedRtplRegion={setSelectedRtplRegion}
        flexStatusMetrics={flexStatusMetrics}
        openRecordsWithFilter={openRecordsWithFilter}
      />
    </>
  );
}


