import { isCustomerPendingStatus, isScheduledStatus } from "@opencall/shared";
import type { GeneratedReportResponse, RtplStatusChange } from "./apiClient";

export const ALL_REGIONS_FILTER = "ALL";
export const RTPL_CARRY_FORWARD_TIME_CARD_ID = "carry-forward";

export const RTPL_TIME_CARD_DEFINITIONS = [
  { id: RTPL_CARRY_FORWARD_TIME_CARD_ID, label: "Upload Time" },
  { id: "1145", label: "11:45 AM", cutoffMinutes: 11 * 60 + 45 },
  { id: "1400", label: "2:00 PM", cutoffMinutes: 14 * 60 },
  { id: "1600", label: "4:00 PM", cutoffMinutes: 16 * 60 },
  { id: "1800", label: "6:00 PM", cutoffMinutes: 18 * 60 },
] as const;

export type RtplTimeCardId = (typeof RTPL_TIME_CARD_DEFINITIONS)[number]["id"];

export type RtplTimeCardDetail =
  | {
      type: "carry-forward";
      rowId: string | null;
      serialNo: number;
      ticketId: string;
      status: string;
    }
  | {
      type: "change";
      id?: string;
      rowId: string;
      serialNo: number;
      ticketId: string;
      fromStatus: string | null;
      toStatus: string | null;
      changedAt: string;
      changedBy: string | null;
    };

export interface RtplStatusBreakdown {
  status: string;
  count: number;
}

export interface RtplTimeCard {
  id: RtplTimeCardId;
  label: string;
  status: string;
  count: number;
  statusBreakdown: RtplStatusBreakdown[];
  details: RtplTimeCardDetail[];
}

export interface RtplStatusMetric {
  status: string;
  count: number;
}

export interface WoOtcBreakdownEntry {
  code: string;
  count: number;
}

type ReportRow = GeneratedReportResponse["rows"][number];

function cleanedString(value: unknown): string {
  return String(value ?? "").trim();
}

function isManualEntryRequired(value: unknown): boolean {
  return cleanedString(value).toLowerCase() === "manual entry required";
}

function rtplStatusForAnalytics(row: ReportRow): string {
  const currentStatus = cleanedString(row.output["RTPL status"]);

  if (currentStatus && !isManualEntryRequired(currentStatus)) {
    return currentStatus;
  }

  const previousStatus = cleanedString(row.comparison?.previousRtplStatus);
  return previousStatus || currentStatus;
}

/**
 * Evening-first status for the RTPL Hours Status cards: once an Evening entry
 * exists it is the case's latest truth for the day, so the card counts follow
 * it; until then the Morning-derived status applies. Placeholder values never
 * win over the Morning fallback.
 */
export function rtplEveningFirstStatusForAnalytics(row: ReportRow): string {
  const eveningStatus = cleanedString(row.output["Evening status"]);

  if (eveningStatus && !isManualEntryRequired(eveningStatus)) {
    return eveningStatus;
  }

  return rtplStatusForAnalytics(row);
}

function normalizeFlexStatus(value: unknown): string {
  return cleanedString(value).replace(/\s+/g, " ").toLowerCase();
}

function istMinutesSinceMidnight(value: string): number | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "");

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function rtplSlotIdForChange(change: RtplStatusChange): RtplTimeCardId {
  const minutes = istMinutesSinceMidnight(change.changedAt);

  if (minutes === null) {
    return "1800";
  }

  for (const definition of RTPL_TIME_CARD_DEFINITIONS) {
    if ("cutoffMinutes" in definition && minutes <= definition.cutoffMinutes) {
      return definition.id;
    }
  }

  return "1800";
}

function ticketIdForRow(row: ReportRow): string {
  return cleanedString(row.output["Ticket ID"]) || String(row.serialNo);
}

function statusForRtplTimeDetail(detail: RtplTimeCardDetail): string {
  if (detail.type === "carry-forward") {
    return detail.status;
  }

  return cleanedString(detail.toStatus) || "Blank";
}

function buildStatusBreakdownFromDetails(
  details: readonly RtplTimeCardDetail[],
): RtplStatusBreakdown[] {
  const counts = new Map<string, number>();

  for (const detail of details) {
    const status = statusForRtplTimeDetail(detail);

    if (!status) {
      continue;
    }

    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export function isRequestToCancelFlexStatus(value: unknown): boolean {
  return normalizeFlexStatus(value) === "request to cancel";
}

export function hasRequestToCancelFlexStatus(row: ReportRow): boolean {
  return (
    isRequestToCancelFlexStatus(row.output["Flex Status"]) ||
    // The closure overlay rewrites "Flex Status" with Flex's own closure status and
    // parks the vendor's WIP value here. Without this check a Request-to-Cancel row
    // that Flex has since closed would stop matching and would reappear on the open
    // call plan and the Records page the moment the closure import ran.
    isRequestToCancelFlexStatus(row.output["Flex Status (WIP)"]) ||
    isRequestToCancelFlexStatus(row.comparison?.previousFlexStatus)
  );
}

export function isTodayCallPlanVisibleRow(row: ReportRow): boolean {
  return (
    !row.carryForward.closedSyntheticRow &&
    !hasRequestToCancelFlexStatus(row)
  );
}

/**
 * Rows the Records page lists. This is isTodayCallPlanVisibleRow plus the calls that
 * closed on a same-day re-upload: they are closed (ledger, closed counts, exports and
 * the parts sync all treat them as closed) but stay on the Records page so the day's
 * call plan never loses a row mid-day. The next day's first upload closes them for
 * good and they drop off here too.
 *
 * Deliberately separate from isTodayCallPlanVisibleRow, which still means "open" and
 * is what the workbook export and the backend parts-count sync key off.
 */
export function isRecordsPageVisibleRow(row: ReportRow): boolean {
  return (
    (!row.carryForward.closedSyntheticRow ||
      row.carryForward.sameDayClosedRow === true) &&
    !hasRequestToCancelFlexStatus(row)
  );
}

export function buildOverallWoOtcBreakdown(
  regionBreakdown: GeneratedReportResponse["regionBreakdown"],
): WoOtcBreakdownEntry[] {
  const counts = new Map<string, number>();

  for (const entry of regionBreakdown) {
    for (const wo of entry.woOtcCodeBreakdown ?? []) {
      counts.set(wo.code, (counts.get(wo.code) ?? 0) + wo.count);
    }
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function filterRowsByRegion(
  rows: readonly ReportRow[],
  regionFilter: string | null | undefined,
): ReportRow[] {
  if (!regionFilter || regionFilter === ALL_REGIONS_FILTER) {
    return [...rows];
  }

  // Normalized like the region-chip counts (useRtplAnalytics), so clicking a
  // chip always yields exactly the rows the chip counted.
  const normalizedFilter = regionFilter.trim().toUpperCase();
  return rows.filter(
    (row) =>
      cleanedString(row.output["Work Location"]).toUpperCase() ===
      normalizedFilter,
  );
}

/**
 * Scheduled (booked plan) = rows whose Morning column is exactly "Scheduled" —
 * the engineer-productivity plan gate (isScheduledStatus), minus its engineer
 * requirement. The evening-first status cards move a booked call onto its
 * outcome status as the day progresses, so a plain "Scheduled" chip reads zero
 * by EOD; this metric answers "how many calls were booked today" and stays
 * stable all day. Same-day closures keep their pre-close Morning status, so a
 * booked call that closed today still counts.
 *
 * EXCEPT a booked call the customer then postponed: an Evening of "Customer
 * Pending" takes it back out of the plan (team decision 2026-08-01). The visit
 * is not happening today, so counting it as booked work overstates the day.
 * Every other Evening outcome — closed, part-ordered, under observation — is
 * work that went ahead and stays counted.
 */
export function buildScheduledPlanMetric(rows: readonly ReportRow[]): {
  count: number;
  ticketIds: string[];
} {
  const matched = rows.filter(
    (row) =>
      isScheduledStatus(cleanedString(row.output["RTPL status"])) &&
      !isCustomerPendingStatus(cleanedString(row.output["Evening status"])),
  );

  return {
    count: matched.length,
    ticketIds: matched
      .map((row) => cleanedString(row.output["Ticket ID"]))
      .filter(Boolean),
  };
}

export function buildRtplOperationalAnalytics(
  rows: readonly ReportRow[],
): RtplStatusMetric[] {
  return buildStatusAnalytics(rows, rtplEveningFirstStatusForAnalytics);
}

export function buildFlexOperationalAnalytics(
  rows: readonly ReportRow[],
): RtplStatusMetric[] {
  return buildStatusAnalytics(rows, (row) => row.output["Flex Status"]);
}

export function buildRtplTimeCards(
  rows: readonly ReportRow[],
  changes: readonly RtplStatusChange[],
): RtplTimeCard[] {
  const detailsByCard = new Map<RtplTimeCardId, RtplTimeCardDetail[]>(
    RTPL_TIME_CARD_DEFINITIONS.map((definition) => [definition.id, []]),
  );

  const carryForwardDetails = detailsByCard.get(RTPL_CARRY_FORWARD_TIME_CARD_ID);

  for (const row of rows) {
    if (!row.carryForward.carriedForwardFields.includes("rtpl_status")) {
      continue;
    }

    const status = rtplStatusForAnalytics(row);

    if (!status) {
      continue;
    }

    carryForwardDetails?.push({
      type: "carry-forward",
      rowId: row.id,
      serialNo: row.serialNo,
      ticketId: ticketIdForRow(row),
      status,
    });
  }

  for (const change of changes) {
    detailsByCard.get(rtplSlotIdForChange(change))?.push({
      type: "change",
      rowId: change.rowId,
      serialNo: change.serialNo,
      ticketId: change.ticketId || String(change.serialNo),
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      changedAt: change.changedAt,
      changedBy: change.changedBy,
      ...(change.id ? { id: change.id } : {}),
    });
  }

  return RTPL_TIME_CARD_DEFINITIONS.map((definition) => {
    const details = detailsByCard.get(definition.id) ?? [];
    const isCarryForward = definition.id === RTPL_CARRY_FORWARD_TIME_CARD_ID;

    return {
      id: definition.id,
      label: definition.label,
      status: isCarryForward
        ? details.length > 0
          ? "Baseline"
          : "No Baseline"
        : details.length > 0
          ? "Changed"
          : "No Change",
      count: details.length,
      statusBreakdown: buildStatusBreakdownFromDetails(details),
      details,
    };
  });
}

/**
 * The key two spellings of the same status must share. Case is folded and runs
 * of whitespace collapsed; punctuation is deliberately KEPT, because the admin
 * status list contains genuinely distinct values that differ only by it.
 *
 * Statuses are free-typed in places, so the same one reaches the report in
 * several casings — "Move to cancellation" and "Move to Cancellation" were
 * rendering as two separate cards, each showing a fraction of the real count.
 */
export function normalizeStatusGroupKey(status: unknown): string {
  return cleanedString(status).toLowerCase().replace(/\s+/g, " ");
}

/** The spelling to display for a group: the most common one, ties to first seen. */
function dominantLabel(labels: ReadonlyMap<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [label, count] of labels) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function buildStatusAnalytics(
  rows: readonly ReportRow[],
  getStatus: (row: ReportRow) => unknown,
): RtplStatusMetric[] {
  const groups = new Map<string, { count: number; labels: Map<string, number> }>();

  for (const row of rows) {
    const status = cleanedString(getStatus(row));

    if (!status) {
      continue;
    }

    const key = normalizeStatusGroupKey(status);
    const group = groups.get(key) ?? { count: 0, labels: new Map<string, number>() };
    group.count += 1;
    group.labels.set(status, (group.labels.get(status) ?? 0) + 1);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({ status: dominantLabel(group.labels), count: group.count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export function reportWithRows(
  report: GeneratedReportResponse,
  rows: readonly ReportRow[],
): GeneratedReportResponse {
  return {
    ...report,
    totalRows: rows.length,
    rows: [...rows],
  };
}
