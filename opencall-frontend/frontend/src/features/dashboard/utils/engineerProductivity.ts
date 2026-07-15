// Engineer-productivity status classification. A call is on the table when it
// has an engineer and any status (its Assigned load); its OUTCOME bucket comes
// from the Evening (EOD) column only — Evening resets every morning, so
// outcomes are today's entries by definition:
//
//   Scheduled / To be Scheduled / Engg Assigned
//                        -> SCHEDULED         (booked to the engineer; Assigned only)
//   WO Closed            -> CLOSED
//   Part Order           -> PART_ORDER
//   Under Observation    -> UNDER_OBSERVATION
//   CX Reschedule        -> CX_RESCHEDULE     (customer pushed the visit out)
//   any other status     -> ATTENDED_OTHER    (in progress; Assigned only)
//
//   Assigned = every counted call (his booked load for the day)
//   Attended = CLOSED + PART_ORDER + UNDER_OBSERVATION
//   (end of day, all calls resolved: Assigned = Attended + CX_RESCHEDULE)
//
// A call counts only when BOTH the engineer and the status are filled in on the
// Records page — either one blank (or "Manual Entry Required") and it is ignored.
import { MANUAL_ENTRY_REQUIRED } from "../constants";

export type ProductivityBucket =
  | "SCHEDULED"
  | "CLOSED"
  | "PART_ORDER"
  | "UNDER_OBSERVATION"
  | "CX_RESCHEDULE"
  | "ATTENDED_OTHER";

function cleanFieldValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text === MANUAL_ENTRY_REQUIRED ? "" : text;
}

/**
 * Row eligibility: the row belongs on the productivity table when it carries a
 * status at all (Morning or Evening) — the engineer's book of work for the
 * day. Empty string when the row has no usable status.
 */
export function effectiveProductivityStatus(
  output: Record<string, string | number>,
): string {
  return (
    cleanFieldValue(output["Evening status"]) ||
    cleanFieldValue(output["RTPL status"])
  );
}

/**
 * The status that drives the day's OUTCOMES: the Evening (EOD) column only.
 * Evening starts blank every morning and survives same-day re-uploads, so a
 * value in it is that day's entry by definition — Closed/Part/UO/CX counted
 * from it can never be yesterday's carry-over, and counts never drop after a
 * mid-day upload. The Morning column (the carried/promoted baseline) only
 * makes a row eligible for Assigned; it never produces an outcome.
 */
export function eveningOutcomeStatus(
  output: Record<string, string | number>,
): string {
  return cleanFieldValue(output["Evening status"]);
}

/**
 * Classify a status into its productivity bucket, or null when the status is
 * blank (the row must not count at all). Matching is tolerant of the casing,
 * punctuation and spelling variants that appear in real data ("WO-closed",
 * "wo closed", "CX Reshedule", "Part Order Pending", ...), but deliberately
 * narrower than the old keyword matching: "Part Quote Shared" or
 * "Good Part Received" are attended work, not part orders, and "To be
 * Scheduled" is not a reschedule.
 */
export function classifyProductivityStatus(
  status: string,
): ProductivityBucket | null {
  const normalized = status
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  // The scheduling stage: the call is booked to the engineer but no work has
  // happened yet — Assigned, not Attended. Attended starts at whatever status
  // comes AFTER these. Exact matches, so "CX Reschedule" (contains "schedule")
  // can never land here.
  if (
    normalized === "scheduled" ||
    normalized === "to be scheduled" ||
    normalized === "engg assigned" ||
    normalized === "eng assigned" ||
    normalized === "engineer assigned" ||
    normalized === "engg assignment pending"
  ) {
    return "SCHEDULED";
  }

  // "WO-closed" and manual variants ("WO Closed", "wo close"). Deliberately not
  // "Closed-cancellation" / "Need to Close": a cancellation or an intent to
  // close is attended work, not a completed close.
  if (normalized.includes("wo close")) {
    return "CLOSED";
  }

  if (normalized.includes("part order") || normalized.includes("additional part")) {
    return "PART_ORDER";
  }

  if (normalized.includes("observation")) {
    return "UNDER_OBSERVATION";
  }

  if (normalized.includes("reschedule") || normalized.includes("reshedule")) {
    return "CX_RESCHEDULE";
  }

  return "ATTENDED_OTHER";
}

export interface ProductivityBucketCounts {
  assigned: number;
  attended: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  cxReschedule: number;
  assignedTickets: string[];
  attendedTickets: string[];
  closedTickets: string[];
  partOrderedTickets: string[];
  underObservationTickets: string[];
  cxRescheduleTickets: string[];
}

export function emptyProductivityBucketCounts(): ProductivityBucketCounts {
  return {
    assigned: 0,
    attended: 0,
    closed: 0,
    partOrdered: 0,
    underObservation: 0,
    cxReschedule: 0,
    assignedTickets: [],
    attendedTickets: [],
    closedTickets: [],
    partOrderedTickets: [],
    underObservationTickets: [],
    cxRescheduleTickets: [],
  };
}

/**
 * Add one bucketed call to an engineer's counts.
 *
 *   Assigned = every counted call — the moment a call is scheduled to the
 *              engineer it appears here, and it stays as it progresses.
 *   Attended = Closed + Part ordered + Under Observation (concrete outcomes
 *              only; scheduled and in-progress statuses are not yet attended).
 *
 * Day flow: in the morning Assigned fills with scheduled calls and Attended is
 * 0; as the team records outcomes, calls move into Attended and its
 * sub-columns. At end of day, when nothing is left at the scheduled stage,
 * Assigned = Attended + CX Reschedule.
 */
export function addToProductivityCounts(
  counts: ProductivityBucketCounts,
  bucket: ProductivityBucket,
  ticketId: string,
): void {
  counts.assigned += 1;
  counts.assignedTickets.push(ticketId);

  // Booked or still in progress: assigned, not yet an outcome.
  if (bucket === "SCHEDULED" || bucket === "ATTENDED_OTHER") {
    return;
  }

  if (bucket === "CX_RESCHEDULE") {
    counts.cxReschedule += 1;
    counts.cxRescheduleTickets.push(ticketId);
    return;
  }

  counts.attended += 1;
  counts.attendedTickets.push(ticketId);

  if (bucket === "CLOSED") {
    counts.closed += 1;
    counts.closedTickets.push(ticketId);
  } else if (bucket === "PART_ORDER") {
    counts.partOrdered += 1;
    counts.partOrderedTickets.push(ticketId);
  } else if (bucket === "UNDER_OBSERVATION") {
    counts.underObservation += 1;
    counts.underObservationTickets.push(ticketId);
  }
}
