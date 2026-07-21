// RTPL DASHBOARD + FLEX DASHBOARD analytics sections extracted from app/page.tsx
// (Phase 6.8). JSX preserved verbatim; props passed explicitly (no analytics-
// calculation, filtering, scope-selection, region-selection, handler, or
// modal-opening changes). openRtplCheckpointModal and openRecordsWithFilter are
// passed in unchanged. These two sections render unconditionally in page.tsx.
import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  formatNumber,
  todayIsoDate,
  isWarrantyCase,
  isTradeCase,
  isActionableStatusValue,
  isPlannedStatusValue,
  isOnsiteStatusValue,
  isCaseClosedStatusValue,
} from "../utils";
import type { ReportRow, RtplCaseScope } from "../types";
import {
  ALL_REGIONS_FILTER,
  RTPL_CARRY_FORWARD_TIME_CARD_ID,
  type RtplTimeCardId,
  type RtplTimeCard,
  type RtplStatusMetric,
  buildRtplOperationalAnalytics,
} from "../../../lib/reportDashboardAnalytics";
import { RTPL_STATUS_OPTIONS } from "@opencall/shared";

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

  const closedCancelledRows = closed.filter((r) => matchStatus(r, ["cancel"]));
  const newCallsRows = active.filter((r) => r.comparison?.changeType === "NEW");

  // Closed Calls = an explicit "Case-Closed" status in this column, plus rows
  // that closed by vanishing from the day's Flex file (closed synthetic rows).
  const caseClosedRows = [
    ...active.filter((r) => isCaseClosedStatusValue(getRowStatus(r))),
    ...closed,
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
  /** Called to download BOD + EOD as an Excel workbook */
  onDownloadBodEod: (card: RtplTimeCard & { cardBod: number; cardEod: number; breakdown: Array<{ status: string; bodCount: number; eodCount: number }> }) => void;
  hideTimeCards?: boolean;
}>) {
  // Set up the status order mapping helper based on RTPL_STATUS_OPTIONS
  const statusOrderMap = new Map<string, number>();
  RTPL_STATUS_OPTIONS.forEach((status, index) => {
    statusOrderMap.set(status.toLowerCase(), index);
  });

  const rtplStatusMetrics = useMemo(
    () => buildRtplOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  // Actionable = Scheduled + To Be Scheduled, shown as a pinned summary card
  // ahead of the per-status cards.
  const actionableMetric = useMemo(() => {
    const rows = rtplAnalyticsRows.filter((r) =>
      isActionableStatusValue(String(r.output["RTPL status"] ?? "")),
    );
    return {
      count: rows.length,
      ticketIds: rows
        .map((r) => String(r.output["Ticket ID"] ?? "").trim())
        .filter(Boolean),
    };
  }, [rtplAnalyticsRows]);

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
    // status has since moved on: the Evening entry exists and is no longer a
    // planning status. An Evening set back to Scheduled/Assigned is still just
    // booked, not attended. Needs both columns, so it lives here rather than
    // in calculateKpiMetricsForCardView.
    const attendedRows = rowsWithStatuses.filter(
      (r) =>
        isPlannedStatusValue(r.bodStatus) &&
        r.eodStatus !== "" &&
        !isPlannedStatusValue(r.eodStatus),
    );
    const attendedTicketIds = attendedRows.map((r) => r.ticketId);

    const bodBase = calculateKpiMetricsForCardView(rtplAnalyticsRows, bodStatusMap, true);
    const eodBase = calculateKpiMetricsForCardView(rtplAnalyticsRows, eodStatusMap, false);
    // Attended is an EOD-only outcome; the BOD side stays empty by definition.
    const bodKpiMetrics = {
      ...bodBase,
      attended: 0,
      tickets: { ...bodBase.tickets, attended: [] as string[] },
    };
    const eodKpiMetrics = {
      ...eodBase,
      attended: attendedRows.length,
      tickets: { ...eodBase.tickets, attended: attendedTicketIds },
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
            {rtplAnalyticsRows.length} rows
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

      {rtplStatusMetrics.length > 0 ? (
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
          {rtplStatusMetrics.map((metric, metricIndex) => (
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
                  rtplStatus: metric.status,
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
                    { id: 5, desc: "Planned Calls", key: "planned" },
                    { id: 6, desc: "Attended", key: "attended", isEodOnly: true },
                    { id: 7, desc: "Closed Calls", key: "closedCalls", isEodOnly: true, alert: true },
                    { id: 8, desc: "Engg onsite", key: "enggOnsite" },
                    { id: 9, desc: "To be schedule", key: "toBeSchedule" },
                    { id: 10, desc: "CX Reschedule Calls", key: "cxReschedule" },
                    { id: 11, desc: "SSC Pending Calls", key: "sscPending" },
                    { id: 12, desc: "Elevate/Tech Support Calls", key: "elevateTech" },
                    { id: 13, desc: "Under observation Calls", key: "underObservation" },
                    { id: 14, desc: "To be Yank", key: "toBeYank" },
                    { id: 15, desc: "Closed cancelled", key: "closedCancelled", isEodOnly: true },
                    { id: 16, desc: "Add.Part ordered", key: "addPartOrdered", alert: true },
                    { id: 17, desc: "To be Cancel", key: "toBeCancel" },
                    { id: 18, desc: "New calls", key: "newCalls", isEodOnly: true, alert: true },
                    { id: 19, desc: "Trade Open Calls", key: "tradeOpenCalls" },
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

                {/* Action row — the BOD & EOD download only. "Fix BOD" was
                    removed: BOD is now the Morning column (already the fixed,
                    carried-forward start-of-day value), so freezing a snapshot
                    no longer does anything. */}
                {view.mode === "both" && (
                  <div style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {(card.cardBod > 0 || card.cardEod > 0) && (
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
                        onClick={(e) => { e.stopPropagation(); onDownloadBodEod(card); }}
                        title={`Download BOD & EOD for ${card.label}`}
                      >
                        📥 BOD &amp; EOD
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
  onDownloadBodEod: (card: RtplTimeCard & { cardBod: number; cardEod: number; breakdown: Array<{ status: string; bodCount: number; eodCount: number }> }) => void;
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


