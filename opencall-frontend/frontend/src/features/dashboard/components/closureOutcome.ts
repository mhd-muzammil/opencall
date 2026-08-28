/**
 * The completed / cancelled split behind the two imported comparison lines on a Closed
 * Calls region card ("FieldEZ data closure", "Raw data closures").
 *
 * Both lines headline COMPLETIONS. "Closed - Canceled" is closed in Flex but abandoned
 * and never billable, so it gets its own muted sub-figure rather than being folded into
 * a completion count. The raw line always worked this way — `classifyRawStatus` tests
 * CANCEL before CLOSED, making the groups disjoint — while the FieldEZ line used to be a
 * bare COUNT(*) over every stored closure. That is why the two could disagree on any day
 * carrying a cancellation with nothing on screen to explain it.
 */

/** One source's split for one region (or the "All regions" rollup). */
export interface ClosureOutcome {
  closed: number;
  cancelled: number;
  /**
   * False when the source did not report a split at all, so `closed` is standing in as
   * the old cancellation-inclusive total. The card hides its cancelled sub-line in that
   * state — showing "0 cancelled" would assert something the backend never said.
   */
  hasSplit: boolean;
}

/** An entry as the closure summary sends it; `closed`/`cancelled` absent on old backends. */
export interface ClosureSummaryEntry {
  count: number;
  closed?: number | undefined;
  cancelled?: number | undefined;
}

/**
 * Reads one entry of the FieldEZ closure summary.
 *
 * A backend that predates the split sends neither field. Falling back to `count` keeps
 * the number the card has always shown rather than blanking it or reading zero — the
 * page still works against an un-deployed API, it just cannot separate cancellations
 * yet, and says so by omitting the sub-line.
 */
export function closureOutcomeOf(
  entry: ClosureSummaryEntry | null | undefined,
): ClosureOutcome | null {
  if (!entry) return null;
  const hasSplit = typeof entry.closed === "number";
  return {
    closed: hasSplit ? entry.closed! : entry.count,
    cancelled: entry.cancelled ?? 0,
    hasSplit,
  };
}

/** A raw-summary row. Both fields are always present — the groups are disjoint by design. */
export interface RawSummaryEntry {
  aspCode: string;
  closed: number;
  cancelled: number;
}

/**
 * Sums raw-summary rows for one ASP, or every row when `aspCode` is "" (the All Regions
 * rollup).
 *
 * Summing is correct for the rollup rather than a shortcut: the summary's own top-level
 * `closed` is itself a reduce over `byAsp`, and rows whose Work Location is not an ASP
 * code (the raw export carries HP engineer ids and 'FCT CCO' there) still get their own
 * `byAsp` entry rather than being dropped. So this reproduces the server's total exactly
 * — which is why the missing top-level `cancelled` needed no backend change.
 */
export function rawOutcomeOf(
  rows: readonly RawSummaryEntry[],
  aspCode: string,
): ClosureOutcome {
  const scoped = aspCode === "" ? rows : rows.filter((r) => r.aspCode === aspCode);
  return scoped.reduce<ClosureOutcome>(
    (acc, r) => ({
      closed: acc.closed + r.closed,
      cancelled: acc.cancelled + r.cancelled,
      hasSplit: true,
    }),
    { closed: 0, cancelled: 0, hasSplit: true },
  );
}
