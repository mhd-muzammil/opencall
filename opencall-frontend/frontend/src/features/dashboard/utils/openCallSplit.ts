// Open Calls split-up for the BOD/EOD table: every open call counted in exactly
// one part, so the parts always add up to Open Calls.
//
// The parts are the table's own row lists (Scheduled, To be schedule, Customer
// Pending, SSC Pending, …), passed in by calculateKpiMetricsForCardView, so a
// part can never show a different number from its row. What no row counts is
// named instead of silently missing: calls with no status yet, calls Flex later
// cancelled (dropped from the work rows on purpose), and every status whose row
// on the RTPL Statuses page is "Other".

export interface OpenCallSplitPart {
  key: string;
  label: string;
  count: number;
  tickets: string[];
}

export interface OpenCallSplitOverlap {
  status: string;
  count: number;
  /** The rows that all counted these calls; the split keeps them in the first. */
  rows: string[];
}

export interface OpenCallSplit {
  /** Open Calls: the population being split. */
  total: number;
  /** One per table row, in table order (zero counts included). */
  parts: OpenCallSplitPart[];
  /** Open calls no row counts, one entry per status, largest first. */
  other: OpenCallSplitPart[];
  /** Blank status or "Manual Entry Required". */
  noStatus: OpenCallSplitPart;
  /** Calls Flex later cancelled: left out of Scheduled on purpose. */
  cancelled: OpenCallSplitPart;
  /** Calls more than one row counted (status text with no stored row). */
  overlaps: OpenCallSplitOverlap[];
  /** Sum of every part above; equals total by construction. */
  sum: number;
}

export interface OpenCallSplitInput<R> {
  statusOf: (row: R) => string;
  ticketOf: (row: R) => string;
  /** Flex cancelled this call (it closed as "Closed - Canceled"). */
  cancelled: (row: R) => boolean;
  /**
   * Parts sharing a `group` overlap by design (Actionable is cut out of the
   * Scheduled / To be schedule rows), so a call in several of them is not
   * reported as counted twice.
   */
  parts: ReadonlyArray<{ key: string; label: string; rows: readonly R[]; group?: string }>;
}

const isNoStatus = (status: string): boolean => {
  const s = status.trim().toLowerCase();
  return !s || s === "manual entry required";
};

export function splitOpenCalls<R>(open: readonly R[], input: OpenCallSplitInput<R>): OpenCallSplit {
  const memberOf = new Map<R, number[]>();
  input.parts.forEach((part, index) => {
    for (const row of part.rows) {
      const list = memberOf.get(row);
      if (list) {
        if (!list.includes(index)) list.push(index);
      } else {
        memberOf.set(row, [index]);
      }
    }
  });

  const parts: OpenCallSplitPart[] = input.parts.map((p) => ({ key: p.key, label: p.label, count: 0, tickets: [] }));
  const noStatus: OpenCallSplitPart = { key: "noStatus", label: "No status yet", count: 0, tickets: [] };
  const cancelled: OpenCallSplitPart = { key: "cancelledByFlex", label: "Cancelled by Flex", count: 0, tickets: [] };
  const otherByStatus = new Map<string, OpenCallSplitPart>();
  const overlapByStatus = new Map<string, OpenCallSplitOverlap>();
  const add = (part: OpenCallSplitPart, row: R) => {
    part.count += 1;
    part.tickets.push(input.ticketOf(row));
  };

  for (const row of open) {
    const status = input.statusOf(row).trim();
    const rowsIn = memberOf.get(row) ?? [];
    const first = rowsIn[0] === undefined ? undefined : parts[rowsIn[0]];
    if (first) {
      add(first, row);
      const groups = new Set(rowsIn.map((i) => input.parts[i]?.group ?? input.parts[i]?.key));
      if (groups.size > 1) {
        const key = status.toLowerCase();
        const o = overlapByStatus.get(key) ?? { status, count: 0, rows: rowsIn.map((i) => input.parts[i]?.label ?? "") };
        o.count += 1;
        overlapByStatus.set(key, o);
      }
    } else if (isNoStatus(status)) {
      add(noStatus, row);
    } else if (input.cancelled(row)) {
      add(cancelled, row);
    } else {
      const key = status.toLowerCase();
      let part = otherByStatus.get(key);
      if (!part) {
        part = { key: `other:${key}`, label: status, count: 0, tickets: [] };
        otherByStatus.set(key, part);
      }
      add(part, row);
    }
  }

  const other = [...otherByStatus.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const sum =
    parts.reduce((n, p) => n + p.count, 0) +
    other.reduce((n, p) => n + p.count, 0) +
    noStatus.count +
    cancelled.count;

  return {
    total: open.length,
    parts,
    other,
    noStatus,
    cancelled,
    overlaps: [...overlapByStatus.values()].sort((a, b) => b.count - a.count),
    sum,
  };
}

export interface TicketGroup {
  /** Kept on the result, so the table can find the row a group belongs to. */
  key?: string;
  label: string;
  tickets: readonly string[];
}

/**
 * Split one BOD/EOD row's calls (e.g. Actionable) by where each call is in this
 * column: its part of the Open Calls split, or one of the extra groups (Closed,
 * Closed cancelled) for calls no longer open. Groups keep the given order and
 * only non-empty ones are returned; anything matching no group is "Not
 * classified", so the counts always add up to the row.
 */
export function splitTickets(
  tickets: readonly string[],
  split: OpenCallSplit,
  extraGroups: readonly TicketGroup[] = [],
): OpenCallSplitPart[] {
  const groups: TicketGroup[] = [
    ...split.parts,
    ...split.other,
    split.noStatus,
    split.cancelled,
    ...extraGroups,
  ];
  const groupOf = new Map<string, number>();
  groups.forEach((g, index) => {
    for (const t of g.tickets) if (!groupOf.has(t)) groupOf.set(t, index);
  });

  const out = groups.map((g, index) => ({ key: g.key ?? `g${index}`, label: g.label, count: 0, tickets: [] as string[] }));
  const rest: OpenCallSplitPart = { key: "unclassified", label: "Not classified", count: 0, tickets: [] };
  for (const t of tickets) {
    const index = groupOf.get(t);
    const target = index === undefined ? rest : out[index] ?? rest;
    target.count += 1;
    target.tickets.push(t);
  }
  return [...out, rest].filter((g) => g.count > 0);
}
