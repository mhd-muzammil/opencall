import type { GeneratedReportResponse } from "./apiClient";

type Row = GeneratedReportResponse["rows"][number];

/**
 * SLA adherence, counted ONE CALL AT A TIME.
 *
 * The Flex WIP report is a PART-level export, not a call-level one: a work order waiting on
 * two spare parts comes back as two rows carrying the same Ticket ID, and one waiting on
 * three comes back as three. Every other count on the dashboard is about parts or rows, so
 * that shape is right for them — but SLA is a promise made once per call. Counting rows
 * meant a call with three parts on it was three calls in the adherence figure, three tickets
 * in the drill-down list, and weighted three times in the percentage.
 *
 * So this collapses to one entry per Ticket ID before it counts anything.
 *
 * WHICH ROW WINS. The TAT is a property of the call, so the part rows normally agree — but
 * they do not always, and a part row added later can carry a blank where the original row
 * has a date. The most informative row wins: a parsable TAT beats "Manual Entry Required"
 * or a blank, and between two parsable ones the EARLIEST is kept, because that is the
 * deadline the call is actually judged against. Never "whichever came first in the file",
 * which would make the answer depend on the order the parts were ordered in.
 */

export type SlaBucket = "within" | "breached" | "pending";

export interface SlaMetrics {
  /** Distinct calls, not rows. */
  total: number;
  withinSla: number;
  breached: number;
  pending: number;
  /** within / (within + breached), as a whole percent. 100 when nothing is judgeable. */
  adherence: number;
  withinSlaTickets: string[];
  breachedSlaTickets: string[];
  pendingTickets: string[];
  allTickets: string[];
}

/**
 * The ticket as a comparison key.
 *
 * `WO-035640797`, `WO035640797` and `wo-035640797` are one call written three ways, and the
 * WIP export is not consistent about which it uses between columns. Case and punctuation go;
 * what is left is what two rows have to share to be the same call.
 */
export function ticketKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** The TAT on a row as a date, or null when there is nothing usable to read. */
export function readTat(row: Row): Date | null {
  const raw = row.output["TAT"];
  const text = String(raw ?? "").trim();
  if (!text || text === "Manual Entry Required") return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Where one call stands against its deadline. No TAT to judge by is Pending, not Breached. */
export function bucketFor(tat: Date | null, now: Date): SlaBucket {
  if (!tat) return "pending";
  return now < tat ? "within" : "breached";
}

/**
 * One entry per call: its display ticket id and the TAT that judges it.
 *
 * Exported because the drill-down needs the same collapsing the counts used — a list that
 * shows three rows behind a number that counted one is the disagreement this file exists to
 * end.
 */
export function collapseToCalls(rows: readonly Row[]): Map<string, { ticketId: string; tat: Date | null }> {
  const calls = new Map<string, { ticketId: string; tat: Date | null }>();
  for (const row of rows) {
    const ticketId = String(row.output["Ticket ID"] ?? "").trim();
    const key = ticketKey(ticketId);
    // A row with no ticket cannot be attributed to a call, and inventing a key for it would
    // pile every such row into one phantom call.
    if (!key) continue;

    const tat = readTat(row);
    const held = calls.get(key);
    if (!held) {
      calls.set(key, { ticketId, tat });
      continue;
    }
    // A real date beats no date; between two dates the earlier deadline stands.
    if (!held.tat && tat) {
      calls.set(key, { ticketId: held.ticketId, tat });
    } else if (held.tat && tat && tat.getTime() < held.tat.getTime()) {
      calls.set(key, { ticketId: held.ticketId, tat });
    }
  }
  return calls;
}

/** How close to a deadline counts as "act on this today". */
export const BREACHING_SOON_HOURS = 4;

export interface FieldezSlaMetrics {
  /** Distinct calls, not rows. */
  total: number;
  within: number;
  breached: number;
  /** FieldEZ records no SLA for these at all. Not the same as keeping one. */
  noSla: number;
  /** A subset of `within`: still inside the promise, but not for much longer. */
  soon: number;
  /** within / (within + breached). Calls with no SLA are not evidence either way. */
  adherence: number;
  withinTickets: string[];
  breachedTickets: string[];
  noSlaTickets: string[];
  soonTickets: string[];
}

export interface SlaLookup {
  slaEndTime: string | null;
  slaStatus: string;
}

/**
 * SLA adherence from what FieldEZ actually promised, rather than from our own TAT column.
 *
 * The TAT-based figure this sits beside was a reconstruction: take the target date we hold,
 * compare it to now, call the difference adherence. It was the best available answer while
 * FieldEZ's own numbers were locked inside its ticket pages, and it disagreed with them —
 * different dates, different rules, no notion of a call FieldEZ makes no promise about.
 *
 * THE DEADLINE DECIDES, NOT THE STORED STATUS. FieldEZ's `slaStatus` was true when the
 * worker read it, up to fifteen minutes ago; a call that crossed its deadline since then
 * still says "Within SLA". The deadline is a fixed instant, so comparing it to the clock is
 * correct at the moment somebody looks — which is what makes this live rather than a
 * fifteen-minute-old photograph.
 *
 * A CALL WITH NO SLA IS ITS OWN ANSWER. Plenty carry none, and counting those as kept
 * promises would flatter every percentage on the page. They are held apart and left out of
 * the denominator entirely.
 */
export function calculateFieldezSlaMetrics(
  rows: readonly Row[],
  slaByTicket: ReadonlyMap<string, SlaLookup>,
  now: Date = new Date(),
): FieldezSlaMetrics {
  const withinTickets: string[] = [];
  const breachedTickets: string[] = [];
  const noSlaTickets: string[] = [];
  const soonTickets: string[] = [];
  const soonCutoff = now.getTime() + BREACHING_SOON_HOURS * 3_600_000;

  // One entry per call first, for the same reason as everywhere else on this page: the WIP
  // export is part-level, and a call waiting on three parts is one promise, not three.
  const seen = new Set<string>();
  for (const row of rows) {
    const ticketId = String(row.output["Ticket ID"] ?? "").trim();
    const key = ticketKey(ticketId);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const sla = slaByTicket.get(key);
    if (!sla) {
      // FieldEZ has not been asked about this one yet — a call raised since the last sweep.
      // Unknown is not "no SLA", but there is nothing else to do with it here and it is
      // counted apart from the two that mean something.
      noSlaTickets.push(ticketId);
      continue;
    }

    const end = sla.slaEndTime ? new Date(sla.slaEndTime).getTime() : Number.NaN;
    if (!Number.isNaN(end)) {
      if (end > now.getTime()) {
        withinTickets.push(ticketId);
        if (end <= soonCutoff) soonTickets.push(ticketId);
      } else {
        breachedTickets.push(ticketId);
      }
      continue;
    }
    // No usable deadline: fall back to whatever FieldEZ said in words, and to nothing if it
    // said nothing.
    if (/breach/i.test(sla.slaStatus)) breachedTickets.push(ticketId);
    else if (/within/i.test(sla.slaStatus)) withinTickets.push(ticketId);
    else noSlaTickets.push(ticketId);
  }

  const judgeable = withinTickets.length + breachedTickets.length;
  return {
    total: seen.size,
    within: withinTickets.length,
    breached: breachedTickets.length,
    noSla: noSlaTickets.length,
    soon: soonTickets.length,
    adherence: judgeable > 0 ? Math.round((withinTickets.length / judgeable) * 100) : 100,
    withinTickets,
    breachedTickets,
    noSlaTickets,
    soonTickets,
  };
}

export function calculateSlaMetrics(rows: readonly Row[], now: Date = new Date()): SlaMetrics {
  const withinSlaTickets: string[] = [];
  const breachedSlaTickets: string[] = [];
  const pendingTickets: string[] = [];
  const allTickets: string[] = [];

  for (const call of collapseToCalls(rows).values()) {
    allTickets.push(call.ticketId);
    const bucket = bucketFor(call.tat, now);
    if (bucket === "within") withinSlaTickets.push(call.ticketId);
    else if (bucket === "breached") breachedSlaTickets.push(call.ticketId);
    else pendingTickets.push(call.ticketId);
  }

  const judgeable = withinSlaTickets.length + breachedSlaTickets.length;
  return {
    // Distinct calls. `rows.length` here is what put a three-part call in the total three
    // times while the four boxes under it added up to one.
    total: allTickets.length,
    withinSla: withinSlaTickets.length,
    breached: breachedSlaTickets.length,
    pending: pendingTickets.length,
    // Pending is deliberately out of the denominator: a call whose deadline nobody has
    // recorded is not evidence for or against keeping deadlines.
    adherence: judgeable > 0 ? Math.round((withinSlaTickets.length / judgeable) * 100) : 100,
    withinSlaTickets,
    breachedSlaTickets,
    pendingTickets,
    allTickets,
  };
}
