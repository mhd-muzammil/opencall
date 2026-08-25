// The bill cycle — the 25th of one month through the 24th of the next — and the
// helpers that name it.
//
// Lifted out of ClosedCallsDashboardView so Engineer Productivity can offer the
// SAME cycle rather than defining a second one that drifts. A cycle boundary that
// two pages disagree about is worse than no cycle filter at all, and importing a
// 2,500-line dashboard view for three date functions is not a way to share them.
// ClosedCallsDashboardView re-exports these, so its own importers are unaffected.

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-06" -> "Jun 2026". */
export function formatMonthKey(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const monthIndex = Number(match[2]) - 1;
  return `${MONTH_NAMES[monthIndex] ?? match[2]} ${match[1]}`;
}

export interface BillCycle {
  /** The month the cycle ENDS in, "YYYY-MM" — how the invoice names it. */
  key: string;
  fromIso: string;
  toIso: string;
  /** "25 Jul – 24 Aug" */
  label: string;
  /** "Aug 2026" */
  monthLabel: string;
}

/**
 * The bill cycle an IST calendar day falls in: the 25th of one month through the 24th of
 * the next, the convention closures are invoiced under. Keyed by the month the cycle ENDS
 * in ("2026-08" = 25 Jul → 24 Aug 2026), because that is the month it gets billed as.
 */
export function billCycleFor(iso: string): BillCycle {
  const [y, m, d] = iso.split("-").map(Number);
  const start =
    (d ?? 1) >= 25
      ? new Date(Date.UTC(y!, (m ?? 1) - 1, 25))
      : new Date(Date.UTC(y!, (m ?? 1) - 2, 25));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 24));
  const isoOf = (dt: Date) => dt.toISOString().slice(0, 10);
  const dayLabel = (dt: Date) =>
    dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const key = isoOf(end).slice(0, 7);
  return {
    key,
    fromIso: isoOf(start),
    toIso: isoOf(end),
    label: `${dayLabel(start)} – ${dayLabel(end)}`,
    monthLabel: formatMonthKey(key),
  };
}

/** The cycle a "YYYY-MM" key names — the 24th always falls inside its own cycle. */
export function billCycleForKey(key: string): BillCycle {
  return billCycleFor(`${key}-24`);
}

/** "2026-08" -> "2026-07". */
export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 2, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Every cycle from the one containing `earliestIso` up to the one containing
 * `latestIso`, newest first — the order a cycle picker lists them in. Bounded by
 * `limit` so a stray old date cannot generate hundreds of options.
 */
export function billCyclesBetween(
  earliestIso: string,
  latestIso: string,
  limit = 24,
): BillCycle[] {
  const oldest = billCycleFor(earliestIso).key;
  const cycles: BillCycle[] = [];
  let key = billCycleFor(latestIso).key;
  while (cycles.length < limit) {
    cycles.push(billCycleForKey(key));
    if (key <= oldest) break;
    key = prevMonthKey(key);
  }
  return cycles;
}
