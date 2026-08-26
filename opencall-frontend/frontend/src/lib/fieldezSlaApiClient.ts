import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/** Same shape every other client in here declares for itself. */
function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/**
 * What FieldEZ promised about each open call.
 *
 * Read straight from OpenCall's own table, which the FieldEZ worker refreshes every fifteen
 * minutes. The screens never talk to FieldEZ: a lapsed FieldEZ session or a slow FieldEZ
 * must never be able to make the Open Call Report slow.
 */

export interface FieldezSlaRow {
  /** The work order with case and punctuation removed — what everything joins on. */
  ticketKey: string;
  /** As FieldEZ writes it, for showing to a person. */
  ticketNo: string;
  caseId: string;
  fieldezTicketId: number | null;
  bpId: number | null;
  /**
   * "Within SLA", "SLA Breached", or EMPTY.
   *
   * Empty is a real answer: plenty of calls carry no SLA in FieldEZ at all, and that is not
   * the same as the promise being kept. It must never be counted as adherence.
   */
  slaStatus: string;
  slaPolicy: string;
  /** ISO. Null when FieldEZ tracks no deadline for this call. */
  slaEndTime: string | null;
  priority: string;
  taskName: string;
  /** ISO of the last refresh. */
  fetchedAt: string;
}

export interface FieldezSlaFreshness {
  rows: number;
  lastFetchedAt: string | null;
  withSla: number;
}

export interface FieldezSlaResponse {
  records: FieldezSlaRow[];
  freshness: FieldezSlaFreshness;
}

export async function getFieldezSla(token: string): Promise<FieldezSlaResponse> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/fieldez-sla`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<FieldezSlaResponse>(response);
}

/**
 * The work order reduced to what two spellings share.
 *
 * The report writes `WO-035640797` and FieldEZ sometimes writes `WO035640797`; joining on
 * the raw string would leave the SLA column blank for whichever half spells it the other way.
 */
export function slaTicketKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export type SlaBucket = "within" | "breached" | "none";

/**
 * Where a call stands RIGHT NOW.
 *
 * Computed from the stored deadline rather than read from `slaStatus`, and that is the
 * point: FieldEZ's own status was true when the worker asked, up to fifteen minutes ago, and
 * a call that crossed its deadline in between would still read "Within SLA". The deadline is
 * a fixed instant, so comparing it against the clock is right at the moment somebody looks.
 *
 * `slaStatus` still decides for a call with no deadline — a FieldEZ that says "SLA Breached"
 * without giving a time is telling us something, and we have nothing better to go on.
 */
export function slaBucket(row: Pick<FieldezSlaRow, "slaEndTime" | "slaStatus">, now: Date = new Date()): SlaBucket {
  if (row.slaEndTime) {
    const end = new Date(row.slaEndTime).getTime();
    if (!Number.isNaN(end)) return end > now.getTime() ? "within" : "breached";
  }
  if (/breach/i.test(row.slaStatus)) return "breached";
  if (/within/i.test(row.slaStatus)) return "within";
  return "none";
}

/** Whole seconds left. Negative once missed, null when there is no deadline. */
export function slaSecondsLeft(slaEndTime: string | null, now: Date = new Date()): number | null {
  if (!slaEndTime) return null;
  const end = new Date(slaEndTime).getTime();
  if (Number.isNaN(end)) return null;
  return Math.round((end - now.getTime()) / 1000);
}

/**
 * "3h 12m" up close, "27d" far away.
 *
 * This sits inside a table cell beside the work order, and the first version wrote every
 * value in hours the way FieldEZ does. That is right near a deadline and unreadable away
 * from one: calls breached a month ago came out as "overdue 652h 54m", which is both hard to
 * parse and wide enough to push the Case ID column off the screen.
 *
 * So hours and minutes while the answer is actionable, and days past two of them, where
 * nobody is counting hours anyway. Seconds are never shown — they change while you read them.
 */
export function formatSlaLeft(seconds: number | null): string {
  if (seconds === null) return "";
  const overdue = seconds < 0;
  const total = Math.abs(seconds);
  const prefix = overdue ? "over " : "";
  if (total >= 48 * 3600) return `${prefix}${Math.floor(total / 86400)}d`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${prefix}${hours}h ${minutes}m` : `${prefix}${minutes}m`;
}
