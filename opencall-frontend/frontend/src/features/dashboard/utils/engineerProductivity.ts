// Engineer-productivity status classification, per the team's definitions. A
// call counts when BOTH the engineer and a status are filled in; the bucket
// comes from the Evening (EOD) status when present, otherwise the Morning:
//
//   Scheduled / To be Scheduled / Engg Assigned
//                        -> SCHEDULED         (booked; Assigned only, not yet attended)
//   Case-Closed / WO Closed (or the call left today's Flex file)
//                        -> CLOSED
//   SSC Pending / Part Order / Additional Part
//                        -> PART_ORDER
//   Under Observation    -> UNDER_OBSERVATION
//   CX Pending / CX Reschedule
//                        -> CX_RESCHEDULE     (customer pushed the visit out)
//   Engineer Delay       -> ENGINEER_DELAY    (the engineer slipped the visit)
//   any other status     -> ATTENDED_OTHER    (worked; a status after Scheduled)
//
//   Assigned = every counted call (his book of work for the day)
//   Attended = every status after the Scheduled stage, minus the two
//              non-attendance outcomes: CX Reschedule and Engineer Delay
//            = CLOSED + PART_ORDER + UNDER_OBSERVATION + ATTENDED_OTHER
import { MANUAL_ENTRY_REQUIRED } from "../constants";

export type ProductivityBucket =
  | "SCHEDULED"
  | "CLOSED"
  | "PART_ORDER"
  | "UNDER_OBSERVATION"
  | "CX_RESCHEDULE"
  | "ENGINEER_DELAY"
  | "ATTENDED_OTHER";

function cleanFieldValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text === MANUAL_ENTRY_REQUIRED ? "" : text;
}

/**
 * The status that drives the bucket: the Evening (EOD) entry once the team
 * fills it, otherwise the Morning (BOD) value. Empty string when the row has
 * no usable status (such a row is not part of the day's book of work).
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

  // "Case-Closed" / "WO-closed" and manual variants. Deliberately not
  // "Closed-cancellation" / "Need to Close": a cancellation or an intent to
  // close is attended work, not a completed close.
  if (normalized.includes("case close") || normalized.includes("wo close")) {
    return "CLOSED";
  }

  // The team logs part waits as "SSC Pending" (incl. "SSC Pending → Part
  // Pending"); explicit part orders count here too.
  if (
    normalized.includes("ssc") ||
    normalized.includes("part order") ||
    normalized.includes("additional part")
  ) {
    return "PART_ORDER";
  }

  if (normalized.includes("observation")) {
    return "UNDER_OBSERVATION";
  }

  // The engineer slipped the visit — its own column, next to CX Reschedule.
  if (normalized.includes("engineer delay") || normalized.includes("eng delay")) {
    return "ENGINEER_DELAY";
  }

  // The customer pushed the visit out: "CX Pending" in this team's vocabulary,
  // plus explicit reschedules.
  if (
    normalized.includes("cx pending") ||
    normalized.includes("reschedule") ||
    normalized.includes("reshedule")
  ) {
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
  engineerDelay: number;
  assignedTickets: string[];
  attendedTickets: string[];
  closedTickets: string[];
  partOrderedTickets: string[];
  underObservationTickets: string[];
  cxRescheduleTickets: string[];
  engineerDelayTickets: string[];
}

export function emptyProductivityBucketCounts(): ProductivityBucketCounts {
  return {
    assigned: 0,
    attended: 0,
    closed: 0,
    partOrdered: 0,
    underObservation: 0,
    cxReschedule: 0,
    engineerDelay: 0,
    assignedTickets: [],
    attendedTickets: [],
    closedTickets: [],
    partOrderedTickets: [],
    underObservationTickets: [],
    cxRescheduleTickets: [],
    engineerDelayTickets: [],
  };
}

/**
 * Add one bucketed call to an engineer's counts.
 *
 *   Assigned = every counted call — the moment a call is scheduled to the
 *              engineer it appears here, and it stays as it progresses.
 *   Attended = every status after the Scheduled stage except the two
 *              non-attendance outcomes (CX Reschedule, Engineer Delay); the
 *              Closed / Part ordered / Under Observation columns are its
 *              named sub-counts.
 *
 * Day flow: in the morning Assigned fills with scheduled calls and Attended is
 * 0; as statuses move past Scheduled, calls flow into Attended (or into
 * CX Reschedule / Engineer Delay when the visit slipped).
 */
export function addToProductivityCounts(
  counts: ProductivityBucketCounts,
  bucket: ProductivityBucket,
  ticketId: string,
): void {
  counts.assigned += 1;
  counts.assignedTickets.push(ticketId);

  // Booked, nothing happened yet: assigned only.
  if (bucket === "SCHEDULED") {
    return;
  }

  if (bucket === "CX_RESCHEDULE") {
    counts.cxReschedule += 1;
    counts.cxRescheduleTickets.push(ticketId);
    return;
  }

  if (bucket === "ENGINEER_DELAY") {
    counts.engineerDelay += 1;
    counts.engineerDelayTickets.push(ticketId);
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
