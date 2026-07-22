import {
  isTradeCase,
  isActionableStatusValue,
  isPlannedStatusValue,
  isOnsiteStatusValue,
  isCaseClosedStatusValue,
} from "../../features/dashboard/utils";
import type { GeneratedReportResponse } from "../../lib/api/types";

type Row = GeneratedReportResponse["rows"][number];

/**
 * Mobile port of `calculateKpiMetricsForCardView` in
 * features/dashboard/components/RTPLAnalytics.tsx (the "RTPL HOURES STATUS" table).
 *
 * The predicates are copied verbatim from that file so the phone can never disagree
 * with the desktop. The only difference is the shape of the result: the web keeps
 * ticket-id lists for its modal, the phone keeps the rows themselves so a tap can open
 * the case list directly.
 */
export interface RtplHoursMetric {
  key: string;
  label: string;
  value: number;
  rows: Row[];
  /** BOD has no meaningful value for these — the web leaves the cell blank. */
  eodOnly?: boolean;
  /** Rendered with the web's yellow attention colour. */
  alert?: boolean;
}

function cleanStatus(value: string): string {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed.toLowerCase() === "manual entry required" ? "" : trimmed;
}

/** Ticket-id keyed status map, exactly how the web builds it. */
export function buildStatusMaps(rows: Row[]): {
  bod: Record<string, string>;
  eod: Record<string, string>;
  attendedRows: Row[];
} {
  const bod: Record<string, string> = {};
  const eod: Record<string, string> = {};
  const attendedRows: Row[] = [];

  for (const r of rows) {
    const ticketId = String(r.output["Ticket ID"] || "").trim();
    const bodStatus = cleanStatus(String(r.output["RTPL status"] ?? ""));
    const eodStatus = cleanStatus(String(r.output["Evening status"] ?? ""));
    bod[ticketId] = bodStatus;
    eod[ticketId] = eodStatus;

    // Attended = a planned case (Morning Scheduled / Engineer Assigned) whose status
    // has since moved on: the Evening entry exists and is no longer a planning status.
    if (isPlannedStatusValue(bodStatus) && eodStatus !== "" && !isPlannedStatusValue(eodStatus)) {
      attendedRows.push(r);
    }
  }

  return { bod, eod, attendedRows };
}

export function calculateRtplHoursMetrics(
  rows: Row[],
  rowStatusMap: Record<string, string>,
  isBod: boolean,
  attendedRows: Row[],
): RtplHoursMetric[] {
  const active = isBod ? rows : rows.filter((r) => !r.carryForward.closedSyntheticRow);
  const closed = isBod ? [] : rows.filter((r) => r.carryForward.closedSyntheticRow);

  const getUniqueEngineers = (items: Row[]): string[] => {
    const list = items
      .map((r) => String(r.output.Engineer ?? "").trim())
      .filter((name) => name && name !== "Manual Entry Required");
    return Array.from(new Set(list));
  };
  const engineerCount = getUniqueEngineers(active).length;

  const getRowStatus = (r: Row): string => {
    const ticketId = String(r.output["Ticket ID"] || "").trim();
    return (rowStatusMap[ticketId] ?? "").trim();
  };

  // Present = the engineer has at least one "Scheduled" call under their name that day.
  const isScheduled = (r: Row): boolean =>
    getRowStatus(r).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === "scheduled";
  const scheduledRows = active.filter(isScheduled);
  const presentEngineers = getUniqueEngineers(scheduledRows);

  const matchStatus = (r: Row, keywords: string[], excludes: string[] = []): boolean => {
    const s = getRowStatus(r).toLowerCase();
    if (!s || s === "manual entry required") return false;
    const matchesKeyword = keywords.some((kw) => s.includes(kw.toLowerCase()));
    const matchesExclude = excludes.some((ex) => s.includes(ex.toLowerCase()));
    return matchesKeyword && !matchesExclude;
  };

  const actionableRows = active.filter((r) => isActionableStatusValue(getRowStatus(r)));
  const plannedRows = active.filter((r) => isPlannedStatusValue(getRowStatus(r)));
  const enggOnsiteRows = active.filter((r) => isOnsiteStatusValue(getRowStatus(r)));
  const toBeScheduleRows = active.filter((r) =>
    matchStatus(r, ["to be scheduled", "assignment pending", "non avl", "missed to schedule"]));
  const cxRescheduleRows = active.filter((r) =>
    matchStatus(r, ["cx pending", "reschedule", "cx", "cust delay", "customer delay", "customer pending"]));
  const sscPendingRows = active.filter((r) => matchStatus(r, ["ssc pending", "ssc"]));
  const elevateTechRows = active.filter((r) =>
    matchStatus(r, ["elevation HP Pending", "elevation Part Pending", "elevation - HP Pending", "elevation - Partner Pending", "elevate"]));
  const underObservationRows = active.filter((r) =>
    matchStatus(r, ["CRT Pending", "CT Validation Pending", "observation", "under observation", "crt"]));
  const toBeYankRows = active.filter((r) => matchStatus(r, ["Need to Yank", "Yank"]));
  const addPartOrderedRows = active.filter((r) =>
    matchStatus(r, ["Additional Part", "Part Order Pending", "Parts Hold", "Part need to order"]));
  const toBeCancelRows = active.filter((r) =>
    matchStatus(r, ["Need to Cancel", "Need to Cancel Mail", "Request to Cancel"]));

  const tradeOpenRows = isBod
    ? rows.filter((r) => isTradeCase(r))
    : rows.filter((r) => !r.carryForward.closedSyntheticRow && isTradeCase(r));

  const closedCancelledRows = closed.filter((r) => matchStatus(r, ["cancel"]));
  const newCallsRows = active.filter((r) => r.comparison?.changeType === "NEW");

  // Closed Calls = an explicit "Case-Closed" status in this column, plus rows that
  // closed by vanishing from the day's Flex file (closed synthetic rows).
  const caseClosedRows = [
    ...active.filter((r) => isCaseClosedStatusValue(getRowStatus(r))),
    ...closed,
  ];

  // Attended is an EOD-only outcome; the BOD side stays empty by definition.
  const attended = isBod ? [] : attendedRows;

  return [
    { key: "engineerCount", label: "Engineer Count", value: engineerCount, rows: active },
    { key: "enggPresents", label: "No.of Engg Presents", value: presentEngineers.length, rows: scheduledRows },
    { key: "openCalls", label: "Open Calls", value: active.length, rows: active },
    { key: "actionable", label: "Actionable Calls", value: actionableRows.length, rows: actionableRows },
    { key: "planned", label: "Planned Calls", value: plannedRows.length, rows: plannedRows },
    { key: "attended", label: "Attended", value: attended.length, rows: attended, eodOnly: true },
    { key: "closedCalls", label: "Closed Calls", value: caseClosedRows.length, rows: caseClosedRows, eodOnly: true, alert: true },
    { key: "enggOnsite", label: "Engg onsite", value: enggOnsiteRows.length, rows: enggOnsiteRows },
    { key: "toBeSchedule", label: "To be schedule", value: toBeScheduleRows.length, rows: toBeScheduleRows },
    { key: "cxReschedule", label: "CX Reschedule Calls", value: cxRescheduleRows.length, rows: cxRescheduleRows },
    { key: "sscPending", label: "SSC Pending Calls", value: sscPendingRows.length, rows: sscPendingRows },
    { key: "elevateTech", label: "Elevate/Tech Support Calls", value: elevateTechRows.length, rows: elevateTechRows },
    { key: "underObservation", label: "Under observation Calls", value: underObservationRows.length, rows: underObservationRows },
    { key: "toBeYank", label: "To be Yank", value: toBeYankRows.length, rows: toBeYankRows },
    { key: "closedCancelled", label: "Closed cancelled", value: closedCancelledRows.length, rows: closedCancelledRows, eodOnly: true },
    { key: "addPartOrdered", label: "Add.Part ordered", value: addPartOrderedRows.length, rows: addPartOrderedRows, alert: true },
    { key: "toBeCancel", label: "To be Cancel", value: toBeCancelRows.length, rows: toBeCancelRows },
    { key: "newCalls", label: "New calls", value: newCallsRows.length, rows: newCallsRows, eodOnly: true },
    { key: "tradeOpenCalls", label: "Trade Open Calls", value: tradeOpenRows.length, rows: tradeOpenRows },
  ];
}
