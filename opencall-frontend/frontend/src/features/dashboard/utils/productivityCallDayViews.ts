// The two ways a range's call-days are read: booking by booking, and call by
// call. Both the Excel export and the on-screen drill-down render from here, so
// clicking a total and exporting it can never disagree — which is the whole
// point, since they disagreeing (2441 on screen, 30 in the table) is what
// started this.
import type { ProductivityBucket, ProductivityCallDayDetail } from "@opencall/shared";

/**
 * The bucket names as the table already labels them. "Customer Pending" rather
 * than CX_RESCHEDULE because that is the column heading on screen and in the
 * summary sheet — one vocabulary, or the detail cannot be tied back to the
 * count it explains.
 */
export const OUTCOME_LABELS: Readonly<Record<ProductivityBucket, string>> = {
  CLOSED: "Closed",
  PART_ORDER: "Part ordered",
  UNDER_OBSERVATION: "Under Observation",
  ATTENDED_OTHER: "Attended - other",
  CX_RESCHEDULE: "Customer Pending",
  ENGINEER_DELAY: "Engineer Delay",
  // Booked and never worked. Named as a state rather than left blank, so a
  // reader does not take an empty cell for missing data.
  SCHEDULED: "Booked - no outcome",
};

/** ISO (YYYY-MM-DD) to the DD-MM-YYYY the rest of the app shows. */
export function displayDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0]?.length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

/** An ISO timestamp as a plain DD-MM-YYYY day, or "" when there is none. */
export function displayTimestamp(value: string | null): string {
  if (!value) return "";
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? displayDate(day) : value;
}

/**
 * One real call, with how many times it was booked.
 *
 * Per ENGINEER: a call reassigned mid-cycle is a fresh sequence for whoever
 * picks it up. That means these rows do NOT sum to a company-wide distinct
 * count, and anything showing them has to say so rather than quietly presenting
 * a total that double-counts the handover.
 */
export interface UniqueCallRow {
  engineer: string;
  regionName: string;
  ticketId: string;
  woOtcCode: string;
  customerName: string;
  location: string;
  timesBooked: number;
  daysAttended: number;
  firstBooked: string;
  lastBooked: string;
  finalOutcome: ProductivityBucket;
  closedInCycle: boolean;
}

/** Outcomes that count as the engineer having worked the call that day. */
const ATTENDED_BUCKETS: ReadonlySet<ProductivityBucket> = new Set<ProductivityBucket>([
  "CLOSED",
  "PART_ORDER",
  "UNDER_OBSERVATION",
  "ATTENDED_OTHER",
]);

/**
 * Collapse call-days into one row per call per engineer.
 *
 * Ordered by the call-days themselves, which the backend already sorted by
 * date, so "first" and "last" mean what they say and the final outcome is
 * genuinely the last day's.
 */
export function uniqueCallRows(
  callDays: readonly ProductivityCallDayDetail[],
): UniqueCallRow[] {
  const byCall = new Map<string, UniqueCallRow>();

  for (const callDay of callDays) {
    const key = `${callDay.engineer.toLowerCase()}\u0000${callDay.ticketId}`;
    const attended = ATTENDED_BUCKETS.has(callDay.bucket);
    const existing = byCall.get(key);

    if (!existing) {
      byCall.set(key, {
        engineer: callDay.engineer,
        regionName: callDay.regionName,
        ticketId: callDay.ticketId,
        woOtcCode: callDay.woOtcCode,
        customerName: callDay.customerName,
        location: callDay.location,
        timesBooked: 1,
        daysAttended: attended ? 1 : 0,
        firstBooked: callDay.date,
        lastBooked: callDay.date,
        finalOutcome: callDay.bucket,
        closedInCycle: callDay.bucket === "CLOSED",
      });
      continue;
    }

    existing.timesBooked += 1;
    if (attended) existing.daysAttended += 1;
    if (callDay.date < existing.firstBooked) existing.firstBooked = callDay.date;
    if (callDay.date >= existing.lastBooked) {
      // The latest day's outcome IS the final outcome. >= rather than > so that
      // several regions' rows on the same date still land on the last one seen.
      existing.lastBooked = callDay.date;
      existing.finalOutcome = callDay.bucket;
    }
    // Closed ANY day in the cycle. A call can close and be rebooked later (a
    // revisit), and "was it closed in this cycle" stays yes — the closure was
    // real and was billed.
    if (callDay.bucket === "CLOSED") existing.closedInCycle = true;
  }

  return Array.from(byCall.values()).sort(
    (a, b) =>
      a.engineer.localeCompare(b.engineer) ||
      b.timesBooked - a.timesBooked ||
      a.ticketId.localeCompare(b.ticketId),
  );
}

/** Distinct calls across every engineer — the handover counted once. */
export function distinctCallCount(
  callDays: readonly ProductivityCallDayDetail[],
): number {
  return new Set(callDays.map((callDay) => callDay.ticketId)).size;
}

export const DETAIL_SHEET_HEADERS = [
  "Date",
  "Engineer",
  "Region",
  "WO / Ticket ID",
  "Booking",
  "Outcome",
  "WO OTC Code",
  "Customer Name",
  "Location",
  "Product",
  "Segment",
  "Case Created",
  "WIP Aging",
  "Flex Status",
  "RTPL Status",
  "Evening Status",
] as const;

/** One row per assigned call-day. The row count IS the Assigned total. */
export function detailSheetRows(
  callDays: readonly ProductivityCallDayDetail[],
): Array<Array<string | number>> {
  return callDays.map((callDay) => [
    displayDate(callDay.date),
    callDay.engineer,
    callDay.regionName,
    callDay.ticketId,
    // "2 of 3" — the column that turns a repeated WO from a suspected duplicate
    // into a visibly separate day's booking.
    `${callDay.bookingIndex} of ${callDay.bookingCount}`,
    OUTCOME_LABELS[callDay.bucket],
    callDay.woOtcCode,
    callDay.customerName,
    callDay.location,
    callDay.product,
    callDay.segment,
    displayTimestamp(callDay.caseCreatedTime),
    callDay.wipAging,
    callDay.flexStatus,
    callDay.rtplStatus,
    callDay.eveningStatus,
  ]);
}

export const UNIQUE_SHEET_HEADERS = [
  "Engineer",
  "Region",
  "WO / Ticket ID",
  "WO OTC Code",
  "Customer Name",
  "Location",
  "Times booked",
  "Days attended",
  "First booked",
  "Last booked",
  "Final outcome",
  "Closed in cycle",
] as const;

/** One row per call per engineer. */
export function uniqueSheetRows(
  rows: readonly UniqueCallRow[],
): Array<Array<string | number>> {
  return rows.map((row) => [
    row.engineer,
    row.regionName,
    row.ticketId,
    row.woOtcCode,
    row.customerName,
    row.location,
    row.timesBooked,
    row.daysAttended,
    displayDate(row.firstBooked),
    displayDate(row.lastBooked),
    OUTCOME_LABELS[row.finalOutcome],
    row.closedInCycle ? "Yes" : "No",
  ]);
}
