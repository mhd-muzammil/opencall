// The three imported sources behind the Closed Calls comparisons, and everything derived
// from them.
//
// Lifted out of ClosedCallsDashboardView so the view is composition and page state rather
// than four fetches and six resolvers. Nothing here touches OUR closed count: every value
// only ADDS a line to the page, and every failure is silent by design — a card must look
// exactly as it always did when a comparison source is unavailable, rather than reading
// zero and inviting someone to "fix" a discrepancy that is really a missing import.
import { useEffect, useMemo, useState } from "react";
import {
  closureOutcomeOf,
  rawOutcomeOf,
  type ClosureOutcome,
} from "../components/closureOutcome";
import type {
  ClosureDateSummary,
  ClosureImportStatus,
  RepeatVisitSummary,
} from "../../../lib/closureDateApiClient";
import type { FlexRawSummary } from "../../../lib/flexRawApiClient";

export interface ClosedCallSources {
  /** Freshness of the closure data — the FieldEZ worker's liveness probe. */
  closureStatus: ClosureImportStatus | null;
  /** Repeat visits inside the vendor's unpaid window, for the active period. */
  repeatVisits: RepeatVisitSummary | null;
  /** Months either source has data for — the bill-cycle picker's floor. */
  months: string[];
  /** null until the Flex Closure ASP Report has been imported at all. */
  fieldezOutcomeFor: (aspCode: string) => ClosureOutcome | null;
  /** null until the raw export has been synced at all. */
  rawOutcomeFor: (aspCode: string) => ClosureOutcome | null;
  /** Closures traced to no Work Location. Zero once a region is selected. */
  fieldezUnmatched: number;
  /** Closures with no date at all — invisible to every date range, by definition. */
  fieldezUndated: number;
  /** Raw closures inside the rollup that no region card can show. */
  rawNoRegion: number;
  /** The backend confirmed the raw counts answer the exact dates picked. */
  rawDayPrecise: boolean;
  monthLo: string;
  monthHi: string;
}

export function useClosedCallSources(params: {
  summaryToken: string | null | undefined;
  dateLo: string;
  dateHi: string;
  rangeActive: boolean;
  /** "" for the All Regions rollup. */
  selectedAsp: string;
  regionAspCodes: readonly string[];
  /** Bumped after an import/sync so the summaries refetch without a page reload. */
  refreshNonce: number;
}): ClosedCallSources {
  const {
    summaryToken,
    dateLo,
    dateHi,
    rangeActive,
    selectedAsp,
    regionAspCodes,
    refreshNonce,
  } = params;

  const [closureSummary, setClosureSummary] = useState<ClosureDateSummary | null>(null);
  const [closureScoped, setClosureScoped] = useState<ClosureDateSummary | null>(null);
  const [rawSummary, setRawSummary] = useState<FlexRawSummary | null>(null);
  const [rawScoped, setRawScoped] = useState<FlexRawSummary | null>(null);
  const [repeatVisits, setRepeatVisits] = useState<RepeatVisitSummary | null>(null);
  const [closureStatus, setClosureStatus] = useState<ClosureImportStatus | null>(null);

  // The unscoped summaries + the freshness badge. One effect: they share a token and a
  // refresh trigger, and none of them depends on the date range.
  useEffect(() => {
    if (!summaryToken) return;
    let cancelled = false;
    void (async () => {
      const [closure, raw] = await Promise.all([
        import("../../../lib/closureDateApiClient"),
        import("../../../lib/flexRawApiClient"),
      ]);
      try {
        const summary = await closure.getClosureDatesSummary(summaryToken);
        if (!cancelled) setClosureSummary(summary);
      } catch {
        // Nothing imported yet, or the endpoint is unavailable — the block says so.
      }
      try {
        const summary = await raw.getFlexRawSummary(summaryToken);
        if (!cancelled) setRawSummary(summary);
      } catch {
        // No raw data synced yet.
      }
      try {
        const status = await closure.getClosureDatesStatus(summaryToken);
        if (!cancelled) setClosureStatus(status);
      } catch {
        // Freshness is a nicety — a failed fetch just omits the badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, refreshNonce]);

  // Closure is day-precise, so a range gets its own scoped summary: the monthly rollup
  // cannot answer a mid-month boundary.
  useEffect(() => {
    if (!summaryToken || !rangeActive) {
      setClosureScoped(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getClosureDatesSummary } = await import(
          "../../../lib/closureDateApiClient"
        );
        const scoped = await getClosureDatesSummary(summaryToken, {
          from: dateLo,
          to: dateHi,
        });
        if (!cancelled) setClosureScoped(scoped);
      } catch {
        // Keep whatever the cards last showed on a transient failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, refreshNonce]);

  // Raw, same idea — but only a response that CONFIRMS day precision is kept. An older
  // backend answers month-level, and treating that as day-filtered would show a whole
  // month's closures as one day's.
  useEffect(() => {
    if (!summaryToken || !rangeActive) {
      setRawScoped(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getFlexRawSummary } = await import("../../../lib/flexRawApiClient");
        const scoped = await getFlexRawSummary(summaryToken, {
          from: dateLo,
          to: dateHi,
        });
        if (!cancelled) setRawScoped(scoped.dayPrecise ? scoped : null);
      } catch {
        if (!cancelled) setRawScoped(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, refreshNonce]);

  useEffect(() => {
    if (!summaryToken) {
      setRepeatVisits(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getRepeatVisits } = await import("../../../lib/closureDateApiClient");
        const summary = await getRepeatVisits(summaryToken, {
          from: rangeActive ? dateLo : "",
          to: rangeActive ? dateHi : "",
        });
        if (!cancelled) setRepeatVisits(summary);
      } catch {
        // A backend without the endpoint: leave the panel hidden rather than claiming
        // there were no callbacks.
        if (!cancelled) setRepeatVisits(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, refreshNonce]);

  const monthLo = dateLo ? dateLo.slice(0, 7) : "";
  const monthHi = dateHi ? dateHi.slice(0, 7) : "";
  const rawDayPrecise = rangeActive && rawScoped?.dayPrecise === true;

  const inMonthRange = useMemo(() => {
    return (month: string): boolean => {
      if (!monthLo && !monthHi) return true;
      if (!month) return false;
      if (monthLo && month < monthLo) return false;
      if (monthHi && month > monthHi) return false;
      return true;
    };
  }, [monthLo, monthHi]);

  /**
   * Per-ASP FieldEZ closures, split into completions and cancellations. Day-precise via
   * the scoped summary when a range is active, otherwise the all-dates summary.
   *
   * A backend that predates the split sends neither field; falling back to the total keeps
   * the number the card has always shown, and `hasSplit` then suppresses the cancelled
   * sub-line so nothing claims a split that was never sent.
   */
  const fieldezOutcomeFor = useMemo(() => {
    const source = rangeActive ? closureScoped : closureSummary;
    return (aspCode: string): ClosureOutcome | null => {
      if (!source) return null;
      if (aspCode === "") {
        // The rollup lives on the summary root, where the total is `total` rather than
        // `count` — it also counts closures that matched no region.
        return closureOutcomeOf({
          count: source.total,
          closed: source.closed,
          cancelled: source.cancelled,
        });
      }
      const entry = source.byAsp.find((item) => item.aspCode === aspCode);
      // A region with no closures at all is a real zero, not a missing split.
      return entry
        ? closureOutcomeOf(entry)
        : { closed: 0, cancelled: 0, hasSplit: true };
    };
  }, [closureSummary, closureScoped, rangeActive]);

  /**
   * Per-ASP raw closures: day-precise when the backend confirmed it, else month-mapped for
   * the range, else all months.
   */
  const rawOutcomeFor = useMemo(() => {
    return (aspCode: string): ClosureOutcome | null => {
      if (rawDayPrecise && rawScoped) return rawOutcomeOf(rawScoped.byAsp, aspCode);
      if (!rawSummary) return null;
      if (!rangeActive) return rawOutcomeOf(rawSummary.byAsp, aspCode);
      return rawOutcomeOf(
        rawSummary.byAspMonth.filter((entry) => inMonthRange(entry.month)),
        aspCode,
      );
    };
  }, [rawSummary, rawScoped, rawDayPrecise, rangeActive, inMonthRange]);

  /**
   * Raw closures the rollup counts but no region card can show — the raw export leaves
   * Work Location blank on work orders HP closed in its own CRM. Stated out loud so the
   * cards not summing to the rollup is an explained number rather than a bug to find.
   */
  const rawNoRegion = useMemo(() => {
    if (selectedAsp) return 0;
    const all = rawOutcomeFor("");
    if (all === null) return 0;
    // Completions on both sides of the subtraction — that is what the cards headline, so
    // mixing the cancelled figure in would report a gap no card can show.
    const onCards = regionAspCodes.reduce(
      (sum, aspCode) => sum + (rawOutcomeFor(aspCode)?.closed ?? 0),
      0,
    );
    return Math.max(0, all.closed - onCards);
  }, [rawOutcomeFor, regionAspCodes, selectedAsp]);

  const fieldezUnmatched = selectedAsp
    ? 0
    : (rangeActive ? closureScoped : closureSummary)?.unmatched ?? 0;

  /**
   * Closures the server could not date at all — no closure date and no activity time.
   *
   * Read off the UNSCOPED summary, where they land in the month-less bucket: `closed_on`
   * is null, so every date range filters them out by definition and no scoped summary can
   * ever mention them. Saying the number is what stops a low range count reading as
   * missing data.
   */
  const fieldezUndated = useMemo(() => {
    if (!closureSummary) return 0;
    return closureSummary.byAspMonth
      .filter((entry) => !entry.month)
      .filter((entry) => !selectedAsp || entry.aspCode === selectedAsp)
      .reduce((sum, entry) => sum + entry.count, 0);
  }, [closureSummary, selectedAsp]);

  const months = useMemo(
    () => [...(closureSummary?.months ?? []), ...(rawSummary?.months ?? [])].sort(),
    [closureSummary, rawSummary],
  );

  return {
    closureStatus,
    repeatVisits,
    months,
    fieldezOutcomeFor,
    rawOutcomeFor,
    fieldezUnmatched,
    fieldezUndated,
    rawNoRegion,
    rawDayPrecise,
    monthLo,
    monthHi,
  };
}
