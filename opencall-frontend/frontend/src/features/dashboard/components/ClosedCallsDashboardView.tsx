import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import type { ReportRow } from "../types";
import {
  classifyFlexClosureOutcome,
  formatNumber,
  hasFlexClosureOutcome,
} from "../utils";
import { todayIsoDate } from "../utils/dateUtils";
import {
  billCycleFor,
  billCycleForKey,
  formatMonthKey,
  prevMonthKey,
  type BillCycle,
} from "../utils/billCycle";
import { closureOutcomeOf, rawOutcomeOf, type ClosureOutcome } from "./closureOutcome";
import type {
  ClosureImportStatus,
  ClosureReconciliation,
} from "../../../lib/closureDateApiClient";
import {
  CALL_STATUS_OPTIONS,
  CUSTOMER_FEEDBACK_OPTIONS,
} from "../../../lib/customerFeedbackApiClient";

/** The row's Case Closed Date as YYYY-MM-DD, or null when absent/unparseable. */
function caseClosedIsoOf(output: Record<string, unknown>): string | null {
  const raw = String(output["Case Closed Date"] ?? "").trim();
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

function getRowAspCode(output: Record<string, unknown> = {}): string {
  return String(
    output["Work Location"] ??
    output["ASP Code"] ??
    output["Region"] ??
    output["ASP"] ??
    ""
  ).trim().toUpperCase();
}

function getRowRegionName(aspCode: string): string {
  if (!aspCode) return "-";
  return ASP_CODE_REGION_MAP[aspCode as keyof typeof ASP_CODE_REGION_MAP] || aspCode;
}

// The bill cycle helpers moved to ../utils/billCycle so Engineer Productivity can
// use the same definition. Re-exported here because this module was their home.
export { billCycleFor, billCycleForKey, formatMonthKey, prevMonthKey };
export type { BillCycle };

/** "2026-06-05" -> "05-06-2026". */
function formatDateKey(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : key;
}

/** Human label for a from/to range: "05-06-2026 → 20-08-2026", "onwards", "up to", etc. */
function formatRangeLabel(
  lo: string,
  hi: string,
  fmt: (v: string) => string,
  allLabel: string,
): string {
  if (!lo && !hi) return allLabel;
  if (lo && hi) return lo === hi ? fmt(lo) : `${fmt(lo)} → ${fmt(hi)}`;
  return lo ? `${fmt(lo)} onwards` : `up to ${fmt(hi)}`;
}

/**
 * The two imported comparison counts shown under a region card's own closed count:
 *
 *   FieldEZ data closure — rows in the last Flex Closure ASP Report import that trace back to
 *                    this ASP (that report has no region column, so the server resolves
 *                    it from the report rows / raw data)
 *   Raw data       — rows in the last Flex RAW export import whose Call Status is closed
 *
 * Each line only renders once its source has actually been imported, so a card looks
 * exactly as it always did until there is something to compare against. The two numbers
 * cover different periods from the live closed count and from each other — they are a
 * reconciliation aid, not a total.
 *
 * BOTH headline figures are completions only. "Closed - Canceled" is closed in Flex but
 * abandoned and never billable, so adding it to a completion count answers no question
 * anyone has — it gets its own muted sub-figure instead. The raw line always worked this
 * way; the FieldEZ line used to fold cancellations into its total, which is why the two
 * could disagree on any day with a cancellation and nothing on screen explained it.
 */
function ComparisonCounts({
  closure,
  raw,
  closureHint,
  rawHint,
  onDrill,
}: Readonly<{
  /** null until the Flex Closure ASP Report has been imported at all. */
  closure: ClosureOutcome | null;
  /** null until the raw export has been synced at all. */
  raw: ClosureOutcome | null;
  closureHint?: string | null;
  /**
   * Why the raw number covers a wider period than the closure one — raw data is stored
   * per month, so a day range still reports whole months. Without this the default
   * "today" scope reads as a wild discrepancy instead of two different periods.
   */
  rawHint?: string | null;
  /** Opens the record list for that source; only wired when the count is clickable. */
  onDrill?: (kind: "closure" | "raw", outcome: "closed" | "cancelled") => void;
}>) {
  if (closure === null && raw === null) return null;

  const line = (
    label: string,
    count: number,
    color: string,
    kind: "closure" | "raw",
  ) => {
    const clickable = Boolean(onDrill) && count > 0;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={(e) => {
          // The card itself is clickable (region filter) — don't also select the region.
          e.stopPropagation();
          onDrill?.(kind, "closed");
        }}
        title={clickable ? "View records" : undefined}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "8px",
          fontSize: "11px",
          lineHeight: 1.7,
          padding: 0,
          border: "none",
          background: "none",
          font: "inherit",
          textAlign: "left",
          cursor: clickable ? "pointer" : "default",
        }}
      >
        <span style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: "4px" }}>
          {label}
          {clickable && <span style={{ fontSize: "9px", opacity: 0.7 }}>▸</span>}
        </span>
        <span style={{ fontWeight: 700, color, textDecoration: clickable ? "underline dotted" : "none", textUnderlineOffset: "2px" }}>
          {formatNumber(count)}
        </span>
      </button>
    );
  };

  /**
   * The cancelled sub-figure. Rendered even at zero — "0 cancelled" is the statement
   * that makes the headline above it readable as completions-only. Suppressed entirely
   * when the source reported no split (`hasSplit` false, i.e. a backend that predates
   * it), because "0 cancelled" would then assert something nobody said.
   */
  const cancelledLine = (outcome: ClosureOutcome, kind: "closure" | "raw") => {
    if (!outcome.hasSplit) return null;
    const count = outcome.cancelled;
    const clickable = Boolean(onDrill) && count > 0;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={(e) => {
          e.stopPropagation();
          onDrill?.(kind, "cancelled");
        }}
        title={
          clickable
            ? "View cancelled records"
            : "Closed - Canceled in Flex — abandoned, not billable"
        }
        style={{
          display: "block",
          width: "100%",
          fontSize: "10px",
          lineHeight: 1.5,
          color: count > 0 ? "#b45309" : "#9ca3af",
          padding: 0,
          margin: "-2px 0 2px",
          border: "none",
          background: "none",
          fontFamily: "inherit",
          textAlign: "left",
          cursor: clickable ? "pointer" : "default",
          textDecoration: clickable ? "underline dotted" : "none",
          textUnderlineOffset: "2px",
        }}
      >
        + {formatNumber(count)} cancelled
      </button>
    );
  };

  return (
    <div
      style={{
        marginTop: "8px",
        paddingTop: "8px",
        borderTop: "1px dashed var(--border-color, #e5e7eb)",
      }}
    >
      {closure && line("FieldEZ data closure", closure.closed, "#7c3aed", "closure")}
      {closure && cancelledLine(closure, "closure")}
      {raw && line("Raw data closures", raw.closed, "#ea580c", "raw")}
      {raw && cancelledLine(raw, "raw")}
      {raw && rawHint && (
        <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "-2px" }}>
          {rawHint}
        </div>
      )}
      {closureHint && (
        <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>
          {closureHint}
        </div>
      )}
    </div>
  );
}

/**
 * How often the FieldEZ worker's closure job is expected to run, and how many missed
 * cycles turn the "Auto-synced" line red. Mirrors FIELDEZ_CLOSURE_INTERVAL_MS's default
 * (15 min): the frontend cannot read the worker's env, so this is the assumption the
 * staleness warning is calibrated to. A worker that has silently died keeps serving
 * yesterday's statuses while the stored row count still looks perfectly healthy.
 *
 * Keep this in step with the worker's default — left at an hour, a dead sync would go
 * unflagged for three hours instead of forty-five minutes.
 */
const CLOSURE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const CLOSURE_SYNC_STALE_AFTER_MS = 3 * CLOSURE_SYNC_INTERVAL_MS;

/** "2026-07-31T09:05:00Z" -> "14:35" in IST, or "" when unparseable. */
function formatIstTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type ReconBucket = "matched" | "closedHereNotInFlex" | "closedInFlexNotHere";

const RECON_BUCKETS: ReadonlyArray<{
  key: ReconBucket;
  label: string;
  hint: string;
  color: string;
}> = [
  {
    key: "matched",
    label: "Closed both sides",
    hint: "We closed it and Flex reported a closure for the same day.",
    color: "#059669",
  },
  {
    key: "closedHereNotInFlex",
    label: "Closed here, not in Flex",
    hint: "We marked it closed; Flex has no closure for this day yet.",
    color: "#d97706",
  },
  {
    key: "closedInFlexNotHere",
    label: "Closed in Flex, not here",
    hint: "Flex closed it; our evening status does not say closed.",
    color: "#dc2626",
  },
];

/**
 * The completed / cancelled / unknown split under a card's total.
 *
 * "WO Closed" is a finished job and the only one that gets paid for; "Closed - Canceled"
 * is an abandoned call. They are shown apart because adding them together answers no
 * question anyone has. Unknown means Flex has not reported that closure yet, so it is
 * deliberately neither — and it doubles as a coverage indicator for the closure import.
 */
function ClosedOutcomeSplit({
  closed,
  cancelled,
  unknown,
}: Readonly<{ closed: number; cancelled: number; unknown: number }>) {
  if (closed === 0 && cancelled === 0 && unknown === 0) return null;

  const part = (label: string, value: number, color: string, title: string) => (
    <span title={title} style={{ color, whiteSpace: "nowrap" }}>
      <strong style={{ fontWeight: 700 }}>{formatNumber(value)}</strong> {label}
    </span>
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        fontSize: "10px",
        marginTop: "3px",
      }}
    >
      {part("closed", closed, "#047857", "WO Closed in Flex — completed, billable")}
      {part("cancelled", cancelled, "#b45309", "Closed - Canceled in Flex — not billable")}
      {unknown > 0 &&
        part("unknown", unknown, "#9ca3af", "Flex has not reported a closure for these yet")}
    </div>
  );
}

export interface ClosedCallsDashboardViewProps {
  overallClosedCount: number;
  closedRegionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    closedCount: number;
    activeCount: number;
  }>;
  closedRows: ReportRow[];
  selectedRegion: string | null;
  setSelectedRegion: (region: string | null) => void;
  openRecordsWithFilter: (filter: { region?: string | null; closedOnly?: boolean; ticketIds?: string[] }) => void;
  onOpenCaseDetail?: (row: ReportRow) => void;
  // Session token + a callback fired after a successful closure-date import, so the
  // parent can refresh the report and pull in the new Case Closed Date values. When
  // absent, the "Import Closure Dates" button is hidden (e.g. view-only sessions).
  closureImportToken?: string | null;
  onClosureDatesImported?: () => void;
  // Token used to save Customer Feedback. When absent, the Feedback button is hidden
  // (view-only sessions). A successful save fires onClosureDatesImported to refresh.
  feedbackToken?: string | null;
  // Read-only token used to fetch the two comparison counts shown under each region
  // card (imported closure dates, imported Flex raw data). When absent those lines are
  // simply not rendered — the existing closed count is unaffected either way.
  summaryToken?: string | null;
}

export function ClosedCallsDashboardView({
  overallClosedCount,
  closedRegionBreakdown,
  closedRows,
  selectedRegion,
  setSelectedRegion,
  openRecordsWithFilter,
  onOpenCaseDetail,
  closureImportToken,
  onClosureDatesImported,
  feedbackToken,
  summaryToken,
}: Readonly<ClosedCallsDashboardViewProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  // The page-wide period (YYYY-MM-DD bounds, "" = unbounded). ONE filter on purpose:
  // the badge, the KPI cards, the region cards, the Flex comparison lines and the
  // records table all read this same range, so no two numbers on the page can answer
  // for different periods. Defaults to today — what the page is opened to check; the
  // presets reach the bill cycle and the whole ledger in one click.
  const [periodFrom, setPeriodFrom] = useState(todayIsoDate);
  const [periodTo, setPeriodTo] = useState(todayIsoDate);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const closureFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // The two comparison sources shown under each region card. Both are independent of the
  // live closed count: they come from their own import/sync and only ever ADD lines to a
  // card — a failed fetch leaves the card exactly as it was before. The full per-ASP /
  // per-month payload is kept so the month dropdown can rescope the cards with no refetch.
  const [closureSummary, setClosureSummary] = useState<import("../../../lib/closureDateApiClient").ClosureDateSummary | null>(null);
  const [rawSummary, setRawSummary] = useState<import("../../../lib/flexRawApiClient").FlexRawSummary | null>(null);
  const [rawSyncing, setRawSyncing] = useState(false);
  const [rawSyncMessage, setRawSyncMessage] = useState<string | null>(null);
  // The record-list drill-down opened from a card's "FieldEZ data closure" / "Raw data
  // closures". `outcome` says which half of the line was clicked, so the rows that open
  // are the ones the clicked number counted rather than every closure of that source.
  const [drill, setDrill] = useState<{
    kind: "closure" | "raw";
    outcome: "closed" | "cancelled";
    aspCode: string;
    label: string;
  } | null>(null);
  // Bumped after an import/sync so the summaries refetch without reloading the report.
  const [summaryNonce, setSummaryNonce] = useState(0);

  // --- Flex reconciliation: "did Flex agree with us on this day?" ---
  const [reconDate, setReconDate] = useState(todayIsoDate);
  /**
   * The last day of the period, inclusive.
   *
   * Seeded to the same day as `reconDate`, so the section opens on exactly the question it
   * asked before there was a range — one day — and only widens when somebody widens it.
   */
  const [reconToDate, setReconToDate] = useState(todayIsoDate);

  /**
   * The furthest To may go. Must match the server's own ceiling.
   *
   * Reconciliation reads every report row in the period and window-functions over them. One
   * day is a lookup; a quarter is a report, and it holds one of the API's ten database
   * connections for as long as it runs. On 2026-08-27 that pool was emptied by two
   * concurrent report generations and everything — login, the health check — began failing
   * with "timeout exceeded when trying to connect". An unbounded date picker is a second way
   * to reach the same place. Thirty-one days covers "this month", which is the question.
   */
  const RECON_MAX_DAYS = 31;
  const reconMaxToDate = React.useMemo(() => {
    const start = Date.parse(`${reconDate}T00:00:00Z`);
    if (Number.isNaN(start)) return "";
    return new Date(start + RECON_MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  }, [reconDate]);
  const [recon, setRecon] = useState<ClosureReconciliation | null>(null);
  const [reconError, setReconError] = useState<string | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconBucket, setReconBucket] = useState<ReconBucket | null>(null);
  // Freshness of the closure data itself — drives the "Auto-synced HH:mm" line.
  const [closureStatus, setClosureStatus] = useState<ClosureImportStatus | null>(null);

  React.useEffect(() => {
    if (!summaryToken) return;
    let cancelled = false;
    void (async () => {
      const [{ getClosureDatesSummary }, { getFlexRawSummary }] = await Promise.all([
        import("../../../lib/closureDateApiClient"),
        import("../../../lib/flexRawApiClient"),
      ]);

      try {
        const summary = await getClosureDatesSummary(summaryToken);
        if (!cancelled) setClosureSummary(summary);
      } catch {
        // No closure dates imported yet (or the endpoint is unavailable) — the card
        // simply omits that line.
      }

      try {
        const summary = await getFlexRawSummary(summaryToken);
        if (!cancelled) setRawSummary(summary);
      } catch {
        // No raw data synced yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, summaryNonce]);

  // Month options — union of both sources, newest first. Empty until something imported.
  const comparisonMonths = useMemo(() => {
    const set = new Set<string>();
    for (const m of closureSummary?.months ?? []) set.add(m);
    for (const m of rawSummary?.months ?? []) set.add(m);
    return [...set].sort().reverse();
  }, [closureSummary, rawSummary]);

  // Normalised date bounds — a reversed From/To is swapped so order never matters.
  const [dateLo, dateHi] = useMemo(() => {
    if (periodFrom && periodTo && periodFrom > periodTo) {
      return [periodTo, periodFrom];
    }
    return [periodFrom, periodTo];
  }, [periodFrom, periodTo]);
  const rangeActive = Boolean(dateLo || dateHi);

  // Raw data only has month granularity, so a date range maps to the months it spans.
  const monthLo = dateLo ? dateLo.slice(0, 7) : "";
  const monthHi = dateHi ? dateHi.slice(0, 7) : "";
  const inMonthRange = useMemo(() => {
    return (m: string): boolean => {
      if (!monthLo && !monthHi) return true;
      if (!m) return false;
      if (monthLo && m < monthLo) return false;
      if (monthHi && m > monthHi) return false;
      return true;
    };
  }, [monthLo, monthHi]);

  /**
   * The bill cycle today falls in — the 25th of one month through the 24th of the next,
   * the convention closures are invoiced under. Read off the IST calendar day so the
   * cycle rolls over at midnight IST, not UTC.
   */
  const currentBillCycle = useMemo(() => billCycleFor(todayIsoDate()), []);

  /**
   * Which cycle the "Bill cycle" scope shows. The ledger holds many months, so the
   * toggle alone could only ever answer for the current one; this is the month picker
   * that sits beside it. Keyed by end month ("2026-08" = 25 Jul → 24 Aug).
   */
  const [cycleKey, setCycleKey] = useState(() => currentBillCycle.key);

  /**
   * Selectable cycles: every one from the current cycle back to the oldest closure the
   * page can count, so a month with data is never missing from the list. Capped at two
   * years, and at six cycles while nothing has loaded yet.
   */
  const billCycleOptions = useMemo(() => {
    let earliestIso: string | null = null;
    for (const row of closedRows) {
      const iso = caseClosedIsoOf((row.output ?? {}) as Record<string, unknown>);
      if (!iso) continue;
      if (earliestIso === null || iso < earliestIso) earliestIso = iso;
    }
    const monthsAsc = [...comparisonMonths].sort();
    const earliestMonth = monthsAsc[0];
    const earliestKeys = [
      earliestIso ? billCycleFor(earliestIso).key : null,
      earliestMonth ? billCycleFor(`${earliestMonth}-01`).key : null,
    ].filter((k): k is string => k !== null);
    const earliestKey = earliestKeys.length ? earliestKeys.sort()[0]! : null;
    // A future-dated Case Closed Date (they happen) would otherwise leave the current
    // cycle as the only option — fall back to the six-cycle default instead.
    const floorKey =
      earliestKey && earliestKey < currentBillCycle.key ? earliestKey : null;

    const options: BillCycle[] = [];
    let key = currentBillCycle.key;
    for (let i = 0; i < 24; i += 1) {
      options.push(billCycleForKey(key));
      if (floorKey ? key <= floorKey : i >= 5) break;
      key = prevMonthKey(key);
    }
    return options;
  }, [closedRows, comparisonMonths, currentBillCycle]);

  const billCycle = useMemo(
    () => billCycleOptions.find((c) => c.key === cycleKey) ?? currentBillCycle,
    [billCycleOptions, cycleKey, currentBillCycle],
  );
  const isCurrentCycle = billCycle.key === currentBillCycle.key;

  // Which preset the period currently matches — drives the chip states AND which
  // counting rule the cards use (see `rowInPeriod`).
  const periodPreset = useMemo<"today" | "cycle" | "all" | "custom">(() => {
    if (!dateLo && !dateHi) return "all";
    const today = todayIsoDate();
    if (dateLo === today && dateHi === today) return "today";
    if (dateLo === billCycle.fromIso && dateHi === billCycle.toIso) return "cycle";
    return "custom";
  }, [dateLo, dateHi, billCycle]);

  /** Human name for the active period — the KPI scope line says it out loud. */
  const periodLabel = useMemo(() => {
    if (periodPreset === "today") return "today";
    if (periodPreset === "cycle") return `${billCycle.monthLabel} bill cycle (${billCycle.label})`;
    if (periodPreset === "all") return "all dates";
    return formatRangeLabel(dateLo, dateHi, formatDateKey, "all dates");
  }, [periodPreset, billCycle, dateLo, dateHi]);

  /**
   * Whether a closed row falls inside the selected period — THE page-wide predicate.
   * The records table, the outcome splits and the card counts all go through here, so
   * every number on the page answers for the same set of rows.
   *
   * "Today" keeps the report-day rule (sameDayClosedRow) instead of comparing Case
   * Closed Date strings: it is the rule the "Closed today" headline has always used,
   * and it still counts a closure Flex reported late with a back-dated Case Closed
   * Date. Every other period goes by Case Closed Date.
   */
  const rowInPeriod = useMemo(() => {
    return (row: ReportRow): boolean => {
      if (!rangeActive) return true;
      if (periodPreset === "today") return row.carryForward.sameDayClosedRow === true;
      const iso = caseClosedIsoOf((row.output ?? {}) as Record<string, unknown>);
      if (!iso) return false;
      if (dateLo && iso < dateLo) return false;
      if (dateHi && iso > dateHi) return false;
      return true;
    };
  }, [rangeActive, periodPreset, dateLo, dateHi]);

  // Closure is day-precise: when a date range is active the monthly byAspMonth cannot
  // answer a mid-month boundary, so a scoped summary is fetched for the exact range.
  // Cleared when no range is active (the cards then use the full summary).
  const [closureScoped, setClosureScoped] =
    useState<import("../../../lib/closureDateApiClient").ClosureDateSummary | null>(null);
  React.useEffect(() => {
    if (!summaryToken || !rangeActive) {
      setClosureScoped(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getClosureDatesSummary } = await import("../../../lib/closureDateApiClient");
        const scoped = await getClosureDatesSummary(summaryToken, { from: dateLo, to: dateHi });
        if (!cancelled) setClosureScoped(scoped);
      } catch {
        // Keep whatever the cards last showed on a transient failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, summaryNonce]);

  // Raw closures, same idea: a scoped summary asks the backend to count by each
  // row's WO Closed date. Only a response that CONFIRMS day precision is kept
  // (`dayPrecise`) — an older backend answers month-level, and treating that as
  // day-filtered would show a month's closures as one day's.
  const [rawScoped, setRawScoped] =
    useState<import("../../../lib/flexRawApiClient").FlexRawSummary | null>(null);
  React.useEffect(() => {
    if (!summaryToken || !rangeActive) {
      setRawScoped(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getFlexRawSummary } = await import("../../../lib/flexRawApiClient");
        const scoped = await getFlexRawSummary(summaryToken, { from: dateLo, to: dateHi });
        if (!cancelled) setRawScoped(scoped.dayPrecise ? scoped : null);
      } catch {
        // Month-level fallback keeps working on a transient failure.
        if (!cancelled) setRawScoped(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, summaryNonce]);
  const rawDayPrecise = rangeActive && rawScoped?.dayPrecise === true;

  /**
   * Per-ASP closure count, split into completions and cancellations. Day-precise via the
   * scoped summary when a range is active, otherwise the full all-dates summary. aspCode
   * "" is the "All Regions" rollup (which includes closure dates with no matched region).
   *
   * `closed` is what the card headlines, so this line means the same thing as the Raw
   * data line beside it — that one has always excluded cancellations, while this one
   * counted them silently, so on a day with cancellations the two could never agree.
   *
   * A backend that predates the split sends neither field. Falling back to the total
   * keeps the old (cancellation-inclusive) number rather than showing a blank card, and
   * `hasSplit` suppresses the sub-line so nothing claims a split that wasn't sent.
   */
  const closureOutcomeFor = useMemo(() => {
    const src = rangeActive ? closureScoped : closureSummary;
    return (aspCode: string): ClosureOutcome | null => {
      if (!src) return null;
      if (aspCode === "") {
        // The ALL rollup lives on the summary root, where the total is `total` rather
        // than `count` — it also counts closures that matched no region.
        return closureOutcomeOf({
          count: src.total,
          closed: src.closed,
          cancelled: src.cancelled,
        });
      }
      const entry = src.byAsp.find((e) => e.aspCode === aspCode);
      // A region with no closures at all is a real zero, not a missing split.
      return entry
        ? closureOutcomeOf(entry)
        : { closed: 0, cancelled: 0, hasSplit: true };
    };
  }, [closureSummary, closureScoped, rangeActive]);

  // Closure unmatched count from whichever summary is active (for the ALL card hint).
  const closureUnmatched = (rangeActive ? closureScoped : closureSummary)?.unmatched ?? 0;

  // Reconciliation for the chosen day, scoped to the selected region card. Refetched
  // after an import so the counts move as soon as new closure data lands.
  const reconAsp = selectedRegion && selectedRegion !== "ALL" ? selectedRegion : "";
  React.useEffect(() => {
    if (!summaryToken || !reconDate) {
      setRecon(null);
      return;
    }
    let cancelled = false;
    setReconLoading(true);
    void (async () => {
      try {
        const { getClosureReconciliation } = await import("../../../lib/closureDateApiClient");
        const result = await getClosureReconciliation(summaryToken, {
          date: reconDate,
          // Only when it widens the question. A `to` equal to `date` is the single day the
          // endpoint already answers, so there is nothing to say.
          ...(reconToDate && reconToDate > reconDate ? { to: reconToDate } : {}),
          ...(reconAsp ? { asp: reconAsp } : {}),
        });
        if (cancelled) return;
        setRecon(result);
        setReconError(null);
      } catch (error) {
        if (cancelled) return;
        setRecon(null);
        setReconError(error instanceof Error ? error.message : "Could not load reconciliation");
      } finally {
        if (!cancelled) setReconLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, reconDate, reconToDate, reconAsp, summaryNonce]);

  // Selecting a different day/region invalidates whichever bucket list was open.
  React.useEffect(() => {
    setReconBucket(null);
  }, [reconDate, reconToDate, reconAsp]);

  React.useEffect(() => {
    if (!summaryToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getClosureDatesStatus } = await import("../../../lib/closureDateApiClient");
        const status = await getClosureDatesStatus(summaryToken);
        if (!cancelled) setClosureStatus(status);
      } catch {
        // Freshness is a nicety — a failed fetch just omits the line.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, summaryNonce]);

  // Liveness comes from the last sync RUN (lastSyncAt) when the backend reports it:
  // an empty new-day export imports 0 rows, so lastImportedAt legitimately sits at
  // last night's final import all morning while the worker is perfectly healthy.
  // Older backends (pre-migration-042) only send lastImportedAt — fall back to it.
  const closureSyncAgeMs = useMemo(() => {
    const iso = closureStatus?.lastSyncAt ?? closureStatus?.lastImportedAt;
    if (!iso) return null;
    const then = Date.parse(iso);
    return Number.isNaN(then) ? null : Date.now() - then;
  }, [closureStatus]);
  const closureSyncStale =
    closureSyncAgeMs !== null && closureSyncAgeMs > CLOSURE_SYNC_STALE_AFTER_MS;
  // Sync alive but the newest DATA is old: Flex simply has nothing new to report
  // (typical every morning until its first closure of the day). Shown neutrally —
  // it must not read as the red "worker is down" state.
  const closureDataAgeMs = useMemo(() => {
    const iso = closureStatus?.lastImportedAt;
    if (!iso) return null;
    const then = Date.parse(iso);
    return Number.isNaN(then) ? null : Date.now() - then;
  }, [closureStatus]);
  const closureNoNewData =
    !closureSyncStale &&
    closureStatus?.lastSyncAt != null &&
    closureDataAgeMs !== null &&
    closureDataAgeMs > CLOSURE_SYNC_STALE_AFTER_MS;

  /**
   * Per-ASP raw CLOSED and CANCELLED counts: day-precise via the scoped summary when the
   * backend confirmed it, else month-mapped for the range, else all months.
   *
   * `closed` has always excluded cancellations here — `classifyRawStatus` tests CANCEL
   * before CLOSED, so they are disjoint groups. The cancelled figure was already in the
   * payload and simply never shown; surfacing it is what lets this line be compared with
   * the FieldEZ one above it.
   */
  const rawOutcomeFor = useMemo(() => {
    return (aspCode: string): ClosureOutcome | null => {
      if (rawDayPrecise && rawScoped) return rawOutcomeOf(rawScoped.byAsp, aspCode);
      if (!rawSummary) return null;
      if (!rangeActive) return rawOutcomeOf(rawSummary.byAsp, aspCode);
      // Month-mapped: narrow to the months the range covers first, then roll up the
      // same way — byAspMonth rows carry the identical closed/cancelled fields.
      return rawOutcomeOf(
        rawSummary.byAspMonth.filter((e) => inMonthRange(e.month)),
        aspCode,
      );
    };
  }, [rawSummary, rawScoped, rawDayPrecise, rangeActive, inMonthRange]);

  /**
   * Raw closures the rollup counts but no region card can show — the raw export leaves
   * Work Location blank on work orders HP closed in its own CRM, and the backend only
   * recovers a region for the ones OpenCall has a report row for. Stated on the All
   * Regions card so the cards not summing to it is an explained number, not a bug the
   * reader has to find.
   */
  const rawUnregioned = useMemo(() => {
    const all = rawOutcomeFor("");
    if (all === null) return 0;
    // Completions only, on both sides of the subtraction — that is what the cards
    // headline, so mixing the cancelled figure in here would report a gap the reader
    // cannot see on any card.
    const onCards = closedRegionBreakdown.reduce(
      (sum, entry) => sum + (rawOutcomeFor(entry.aspCode)?.closed ?? 0),
      0,
    );
    return Math.max(0, all.closed - onCards);
  }, [rawOutcomeFor, closedRegionBreakdown]);

  async function handleSyncRawData() {
    if (!closureImportToken) return;
    setRawSyncing(true);
    setRawSyncMessage(null);
    try {
      const { syncFlexRawData } = await import("../../../lib/flexRawApiClient");
      const result = await syncFlexRawData(closureImportToken);
      setRawSyncMessage(
        `Synced ${formatNumber(result.imported)} rows — ${formatNumber(result.closed)} closed.`,
      );
      setSummaryNonce((n) => n + 1);
    } catch (error) {
      setRawSyncMessage(
        `Sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setRawSyncing(false);
    }
  }

  // Customer feedback modal state. `feedbackRow` is the row currently being edited.
  const [feedbackRow, setFeedbackRow] = useState<ReportRow | null>(null);
  const [fbCallStatus, setFbCallStatus] = useState("");
  const [fbFeedback, setFbFeedback] = useState("");
  const [fbRemarks, setFbRemarks] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  function openFeedback(row: ReportRow) {
    const out = (row.output ?? {}) as Record<string, unknown>;
    const existing = out["Customer Feedback"] as
      | { callStatus?: string; feedback?: string; remarks?: string }
      | undefined;
    setFeedbackRow(row);
    setFbCallStatus(String(existing?.callStatus ?? ""));
    setFbFeedback(String(existing?.feedback ?? ""));
    setFbRemarks(String(existing?.remarks ?? ""));
    setFbError(null);
  }

  async function saveFeedback() {
    if (!feedbackRow || !feedbackToken) return;
    if (!fbCallStatus && !fbFeedback) {
      setFbError("Pick a call status or a feedback value.");
      return;
    }
    const out = (feedbackRow.output ?? {}) as Record<string, unknown>;
    setFbSaving(true);
    setFbError(null);
    try {
      const { saveCustomerFeedback } = await import(
        "../../../lib/customerFeedbackApiClient"
      );
      await saveCustomerFeedback(feedbackToken, {
        woId: String(out["Ticket ID"] ?? out["WO ID"] ?? ""),
        caseId: String(out["Case ID"] ?? ""),
        callStatus: fbCallStatus,
        feedback: fbFeedback,
        remarks: fbRemarks.trim(),
      });
      setFeedbackRow(null);
      onClosureDatesImported?.(); // refresh the report so Customer Status updates
    } catch (error) {
      setFbError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setFbSaving(false);
    }
  }

  async function handleClosureFile(file: File | null) {
    if (!file || !closureImportToken) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const { importClosureDates } = await import("../../../lib/closureDateApiClient");
      const result = await importClosureDates(closureImportToken, file);
      // The file has one row per PART ORDER, so the work-order count is the number that
      // means anything to a human; the "no closure date" ones are Flex's cancellations,
      // which are stored, not skipped.
      setImportMessage(
        `Imported ${result.imported} work orders from ${result.totalRows} rows ` +
          `(${result.byStatus.closed} closed, ${result.byStatus.cancelled} cancelled` +
          `${result.withoutClosureDate > 0 ? `, ${result.withoutClosureDate} with no closure date` : ""}).`,
      );
      setSummaryNonce((n) => n + 1);
      onClosureDatesImported?.();
    } catch (error) {
      setImportMessage(
        `Import failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setImporting(false);
      if (closureFileInputRef.current) closureFileInputRef.current.value = "";
    }
  }

  // Total active WIP count across all regions
  const totalActiveWipCount = useMemo(() => {
    return closedRegionBreakdown.reduce((sum, item) => sum + item.activeCount, 0);
  }, [closedRegionBreakdown]);

  // Total calls (Closed + Active WIP)
  const totalCallsCount = overallClosedCount + totalActiveWipCount;

  // Filtered closed rows based on selected region and search query
  const filteredClosedRows = useMemo(() => {
    return closedRows.filter((row) => {
      const output = (row.output ?? {}) as Record<string, unknown>;
      const rowAsp = getRowAspCode(output);
      const rowRegionName = getRowRegionName(rowAsp).toUpperCase();

      // Region filter
      if (selectedRegion && selectedRegion !== "ALL") {
        const target = selectedRegion.trim().toUpperCase();
        const matchesAsp = rowAsp === target;
        const matchesName = rowRegionName === target;
        if (!matchesAsp && !matchesName) {
          return false;
        }
      }

      // Period filter — the same predicate the cards use, so the table always lists
      // exactly the rows the numbers above it counted.
      if (!rowInPeriod(row)) return false;

      // Search query filter
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      const ticketId = String(output["Ticket ID"] ?? "").toLowerCase();
      const woOtc = String(output["WO OTC CODE"] ?? output["WO OTC Code"] ?? "").toLowerCase();
      const engineer = String(output["Engineer"] ?? "").toLowerCase();
      const customer = String(output["Customer Name"] ?? output["Customer"] ?? "").toLowerCase();
      const status = String(output["RTPL status"] ?? "").toLowerCase();
      const asp = rowAsp.toLowerCase();
      const regName = rowRegionName.toLowerCase();
      const segment = String(output["Segment"] ?? "").toLowerCase();
      const contact = String(output["Contact"] ?? "").toLowerCase();
      const customerMail = String(output["Customer Mail"] ?? "").toLowerCase();
      const accountName = String(output["Account Name"] ?? "").toLowerCase();

      return (
        ticketId.includes(query) ||
        woOtc.includes(query) ||
        engineer.includes(query) ||
        customer.includes(query) ||
        status.includes(query) ||
        asp.includes(query) ||
        regName.includes(query) ||
        segment.includes(query) ||
        contact.includes(query) ||
        customerMail.includes(query) ||
        accountName.includes(query)
      );
    });
  }, [closedRows, selectedRegion, searchQuery, rowInPeriod]);

  const dateInputStyle: React.CSSProperties = {
    padding: "7px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    border: "1px solid var(--border-color, #d1d5db)",
    background: "var(--input-bg, #f9fafb)",
  };

  // Closures that happened on this report's day. overallClosedCount is the whole
  // ledger — a closed ticket is carried into every later report, so it answers
  // "how many have we ever closed", which is not what anyone reads this page for.
  const closedTodayCount = useMemo(
    () => closedRows.filter((row) => row.carryForward.sameDayClosedRow === true).length,
    [closedRows],
  );

  // Closed share % — follows the period (all dates = the whole ledger).
  const shareClosed = rangeActive ? filteredClosedRows.length : overallClosedCount;
  const closedPercentage =
    totalCallsCount > 0 ? ((shareClosed / totalCallsCount) * 100).toFixed(1) : "0.0";

  // A hand-typed range that matches no preset — counts then come from the generic
  // Case-Closed-Date scan below instead of the today/cycle/all-time fast paths.
  const customRange = periodPreset === "custom";

  // Per-region closed count for a custom period (ignores the region selection so every
  // region card still shows its own number for the range). Only computed for a custom
  // range; the preset periods have dedicated maps.
  const dateFilteredCountByAsp = useMemo(() => {
    const counts = new Map<string, number>();
    if (!customRange) return counts;
    for (const row of closedRows) {
      const output = (row.output ?? {}) as Record<string, unknown>;
      const iso = caseClosedIsoOf(output);
      if (!iso) continue;
      if (dateLo && iso < dateLo) continue;
      if (dateHi && iso > dateHi) continue;
      const asp = getRowAspCode(output);
      counts.set(asp, (counts.get(asp) ?? 0) + 1);
    }
    return counts;
  }, [closedRows, customRange, dateLo, dateHi]);

  // Total across all regions for the active range (the ALL card's number).
  const dateFilteredTotal = useMemo(() => {
    let sum = 0;
    for (const v of dateFilteredCountByAsp.values()) sum += v;
    return sum;
  }, [dateFilteredCountByAsp]);

  // Per-region equivalent of closedTodayCount — the same same-day rule, grouped by ASP.
  const closedTodayCountByAsp = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of closedRows) {
      if (row.carryForward.sameDayClosedRow !== true) continue;
      const asp = getRowAspCode((row.output ?? {}) as Record<string, unknown>);
      counts.set(asp, (counts.get(asp) ?? 0) + 1);
    }
    return counts;
  }, [closedRows]);


  /**
   * Raw data is stored per month, so anything narrower than whole months still reports
   * whole months. Said out loud on the card — otherwise the default "today" scope puts
   * a day's closure count next to a month's raw count and they read as a discrepancy.
   */
  const rawScopeNote = useMemo(() => {
    if (!rangeActive) return null;
    // Day precision confirmed: the count answers the exact dates picked. The
    // only caveat left is rows whose source date was junk — said out loud so a
    // low number reads as "some rows are undatable", not "data is missing".
    if (rawDayPrecise) {
      const undated = rawScoped?.undatedClosed ?? 0;
      return undated > 0
        ? `${formatNumber(undated)} closures undated — outside any date range`
        : null;
    }
    const lastDayOf = (month: string) => {
      const [y, m] = month.split("-").map(Number);
      const day = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
      return `${month}-${String(day).padStart(2, "0")}`;
    };
    const wholeMonths =
      (!monthLo || dateLo === `${monthLo}-01`) &&
      (!monthHi || dateHi === lastDayOf(monthHi));
    if (wholeMonths) return null;
    return `whole of ${formatRangeLabel(monthLo, monthHi, formatMonthKey, "all months")} — raw data is month-level`;
  }, [rangeActive, rawDayPrecise, rawScoped, monthLo, monthHi, dateLo, dateHi]);

  // Per-region closed count inside the selected bill cycle, by Case Closed Date.
  const cycleCountByAsp = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of closedRows) {
      const output = (row.output ?? {}) as Record<string, unknown>;
      const iso = caseClosedIsoOf(output);
      if (!iso || iso < billCycle.fromIso || iso > billCycle.toIso) continue;
      const asp = getRowAspCode(output);
      counts.set(asp, (counts.get(asp) ?? 0) + 1);
    }
    return counts;
  }, [closedRows, billCycle]);

  const cycleTotal = useMemo(() => {
    let sum = 0;
    for (const v of cycleCountByAsp.values()) sum += v;
    return sum;
  }, [cycleCountByAsp]);

  /**
   * The number ONE card shows — the ALL card (aspCode "") or a single region.
   *
   * A single resolver on purpose: the ALL card used to show today's closures while
   * every region card showed its all-time ledger, so the parts never summed to the
   * whole (4 vs 563 + 464 + 292 + 291 + 264). Every branch answers for the period
   * `rowInPeriod` describes — only the lookup differs.
   */
  const closedCountFor = useMemo(() => {
    return (aspCode: string, allTimeCount: number): number => {
      if (periodPreset === "today") {
        return aspCode ? closedTodayCountByAsp.get(aspCode) ?? 0 : closedTodayCount;
      }
      if (periodPreset === "cycle") {
        return aspCode ? cycleCountByAsp.get(aspCode) ?? 0 : cycleTotal;
      }
      if (periodPreset === "custom") {
        return aspCode ? dateFilteredCountByAsp.get(aspCode) ?? 0 : dateFilteredTotal;
      }
      return allTimeCount;
    };
  }, [
    periodPreset,
    dateFilteredCountByAsp,
    dateFilteredTotal,
    closedTodayCountByAsp,
    closedTodayCount,
    cycleCountByAsp,
    cycleTotal,
  ]);

  /**
   * The ledger renders a PAGE at a time.
   *
   * It used to render every filtered row, and each row is 16 cells with nested spans
   * and two buttons — roughly 30 DOM nodes. At ~1,900 closed records that is ~55,000
   * nodes built synchronously, and a <input type="date"> fires onChange for each
   * segment you type, so picking a date rebuilt the whole table several times and the
   * tab went Unresponsive. Everything else on the page (the counts, the cards, Export
   * Excel) still works off the full filtered set — only the DOM is paged.
   */
  const LEDGER_PAGE_SIZE = 100;
  const [ledgerPage, setLedgerPage] = useState(0);

  const ledgerPageCount = Math.max(
    1,
    Math.ceil(filteredClosedRows.length / LEDGER_PAGE_SIZE),
  );
  // Any filter change can shrink the list past the current page; clamp rather than
  // showing an empty table with rows that exist.
  const safeLedgerPage = Math.min(ledgerPage, ledgerPageCount - 1);
  const ledgerStart = safeLedgerPage * LEDGER_PAGE_SIZE;
  const visibleClosedRows = useMemo(
    () => filteredClosedRows.slice(ledgerStart, ledgerStart + LEDGER_PAGE_SIZE),
    [filteredClosedRows, ledgerStart],
  );

  React.useEffect(() => {
    setLedgerPage(0);
  }, [selectedRegion, dateLo, dateHi, searchQuery]);

  /**
   * Completed vs cancelled, per region and overall.
   *
   * Only "WO Closed" is a finished job — the one that gets paid for. "Closed - Canceled"
   * is an abandoned call and is counted apart from it, never with it.
   *
   * A closed row whose Flex Status was never overlaid has no closure record yet, so the
   * vendor has not told us how it ended: it is UNKNOWN, not assumed billable. Unknown is
   * taken as the remainder of the card's own total, so the three parts always add up to
   * the headline even if the ledger and the region breakdown ever drift apart.
   */
  const closedOutcomeByAsp = useMemo(() => {
    const counts = new Map<string, { closed: number; cancelled: number }>();
    for (const row of closedRows) {
      if (!rowInPeriod(row)) continue;
      const output = (row.output ?? {}) as Record<string, unknown>;
      if (!hasFlexClosureOutcome(output)) continue;
      const outcome = classifyFlexClosureOutcome(output["Flex Status"]);
      if (outcome === "other") continue;
      const asp = getRowAspCode(output);
      const entry = counts.get(asp) ?? { closed: 0, cancelled: 0 };
      entry[outcome] += 1;
      counts.set(asp, entry);
    }
    return counts;
  }, [closedRows, rowInPeriod]);

  const closedOutcomeFor = useMemo(() => {
    return (
      aspCode: string,
      total: number,
    ): { closed: number; cancelled: number; unknown: number } => {
      let closed = 0;
      let cancelled = 0;
      if (aspCode) {
        const entry = closedOutcomeByAsp.get(aspCode);
        closed = entry?.closed ?? 0;
        cancelled = entry?.cancelled ?? 0;
      } else {
        for (const entry of closedOutcomeByAsp.values()) {
          closed += entry.closed;
          cancelled += entry.cancelled;
        }
      }
      return { closed, cancelled, unknown: Math.max(0, total - closed - cancelled) };
    };
  }, [closedOutcomeByAsp]);

  // Regional stats for active selection
  const activeRegionStats = useMemo(() => {
    if (!selectedRegion || selectedRegion === "ALL") {
      return {
        closed: rangeActive ? filteredClosedRows.length : overallClosedCount,
        wip: totalActiveWipCount,
        label: "All Operational Regions",
      };
    }
    const targetUpper = selectedRegion.trim().toUpperCase();
    const match = closedRegionBreakdown.find(
      (item) => item.aspCode.toUpperCase() === targetUpper || item.regionName.toUpperCase() === targetUpper
    );
    return {
      // Any period narrower than all-dates follows the visible rows; otherwise the
      // region's all-time total.
      closed: rangeActive
        ? filteredClosedRows.length
        : match
          ? match.closedCount
          : filteredClosedRows.length,
      wip: match ? match.activeCount : 0,
      label: match ? `${match.regionName} (${match.aspCode})` : selectedRegion,
    };
  }, [selectedRegion, overallClosedCount, totalActiveWipCount, closedRegionBreakdown, filteredClosedRows.length, rangeActive]);

  // Handle Exporting Closed Calls to Excel
  const handleExportClosedCalls = () => {
    if (filteredClosedRows.length === 0) return;

    const rowsToExport = filteredClosedRows.map((r) => r.output);
    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Closed Calls");
    XLSX.writeFile(
      wb,
      `Closed_Calls_Ledger_${selectedRegion || "ALL"}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="closedCallsDashboardContainer" style={{ padding: "20px 24px", width: "100%", maxWidth: "100%", overflowX: "hidden", minWidth: 0 }}>
      {/* Top Header Bar */}
      <div
        className="closedCallsHeaderBar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-color, #e5e7eb)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                background: "#f3f4f6",
                color: "#374151",
                fontSize: "11px",
                fontWeight: "700",
                padding: "4px 10px",
                borderRadius: "20px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Ledger Workspace
            </span>
            <span
              style={{
                background: "#10b98115",
                color: "#059669",
                fontSize: "12px",
                fontWeight: "700",
                padding: "3px 10px",
                borderRadius: "12px",
                border: "1px solid #10b98130",
              }}
            >
              ✓{" "}
              {periodPreset === "custom"
                ? `${formatNumber(dateFilteredTotal)} Closed in range`
                : periodPreset === "cycle"
                  ? `${formatNumber(cycleTotal)} Closed in ${billCycle.monthLabel} cycle · ${formatNumber(overallClosedCount)} all time`
                  : `${formatNumber(closedTodayCount)} Closed today · ${formatNumber(overallClosedCount)} all time`}
            </span>
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--heading-color, #111827)", margin: "6px 0 2px 0" }}>
            Closed Calls Dashboard
          </h2>
          <p style={{ fontSize: "13px", color: "var(--muted-color, #6b7280)", margin: 0 }}>
            Dedicated ledger for reviewing completed work orders across all operational contract codes.
          </p>
        </div>

        {/* Header Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Region Select */}
          <select
            value={selectedRegion ?? "ALL"}
            onChange={(e) => setSelectedRegion(e.target.value === "ALL" ? null : e.target.value)}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #d1d5db)",
              background: "var(--card-bg, #ffffff)",
              color: "var(--text-color, #1f2937)",
              cursor: "pointer",
            }}
          >
            <option value="ALL">All Regions ({closedRegionBreakdown.length})</option>
            {closedRegionBreakdown.map((item) => (
              <option key={item.aspCode} value={item.aspCode}>
                {item.regionName} ({item.aspCode}) — {item.closedCount} Closed
              </option>
            ))}
          </select>

          {/* Export Button */}
          <button
            type="button"
            className="secondaryButton"
            onClick={handleExportClosedCalls}
            disabled={filteredClosedRows.length === 0}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: filteredClosedRows.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            <span>📥 Export Excel</span>
          </button>

          {/* Switch to Full Editable Table Button */}
          <button
            type="button"
            className="primaryButton"
            onClick={() => openRecordsWithFilter({ region: selectedRegion, closedOnly: true })}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              background: "#3b82f6",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(59, 130, 246, 0.2)",
            }}
          >
            📋 Open Records Table
          </button>

          {/* THE period filter — one range that scopes the badge, the KPI cards, the
              region cards, the Flex comparison lines and the records table below.
              Typing dates makes a custom range; the presets are the three periods the
              page is actually read for, and Bill cycle brings its own month picker. */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", marginBottom: "3px" }}>Closed from</label>
              <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={dateInputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", marginBottom: "3px" }}>Closed to</label>
              <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={dateInputStyle} />
            </div>
            <div
              style={{
                display: "inline-flex",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #e5e7eb)",
                overflow: "hidden",
              }}
            >
              {(
                [
                  { key: "today", label: "Today", title: "Calls closed today — and what Flex reported for today" },
                  {
                    key: "cycle",
                    label: "Bill cycle",
                    title: `Calls closed in one bill cycle (25th → 24th) — pick the month beside this button. Showing ${billCycle.monthLabel}: ${billCycle.label}`,
                  },
                  { key: "all", label: "All dates", title: "Every closed call in the ledger" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  title={preset.title}
                  onClick={() => {
                    if (preset.key === "today") {
                      const today = todayIsoDate();
                      setPeriodFrom(today);
                      setPeriodTo(today);
                    } else if (preset.key === "cycle") {
                      setPeriodFrom(billCycle.fromIso);
                      setPeriodTo(billCycle.toIso);
                    } else {
                      setPeriodFrom("");
                      setPeriodTo("");
                    }
                  }}
                  style={{
                    padding: "7px 12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    border: "none",
                    background: periodPreset === preset.key ? "#10b981" : "var(--card-bg, #ffffff)",
                    color: periodPreset === preset.key ? "#ffffff" : "#6b7280",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Which cycle "Bill cycle" means. The ledger spans many months, so the
                preset on its own could only ever answer for the current one. */}
            {periodPreset === "cycle" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label
                  htmlFor="bill-cycle-month"
                  style={{ fontSize: "10px", fontWeight: 600, marginBottom: "3px", color: "#6b7280" }}
                >
                  Bill cycle month
                </label>
                <select
                  id="bill-cycle-month"
                  value={billCycle.key}
                  onChange={(e) => {
                    setCycleKey(e.target.value);
                    const cycle = billCycleForKey(e.target.value);
                    setPeriodFrom(cycle.fromIso);
                    setPeriodTo(cycle.toIso);
                  }}
                  title="Each cycle runs from the 25th to the 24th and is named after the month it ends in"
                  style={{
                    ...dateInputStyle,
                    fontWeight: 600,
                    background: "var(--card-bg, #ffffff)",
                    cursor: "pointer",
                  }}
                >
                  {billCycleOptions.map((cycle) => (
                    <option key={cycle.key} value={cycle.key}>
                      {cycle.monthLabel} ({cycle.label})
                      {cycle.key === currentBillCycle.key ? " · current" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div
        className="closedCallsKpiGrid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        {/* Total Closed Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Closed Calls
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#10b981", marginTop: "4px" }}>
            {formatNumber(activeRegionStats.closed)}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Scope: {activeRegionStats.label} · {periodLabel}
          </div>
        </div>

        {/* Active Regions Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Regions Breakdown
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#3b82f6", marginTop: "4px" }}>
            {closedRegionBreakdown.filter((r) => r.closedCount > 0).length} / {closedRegionBreakdown.length}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Regions with closed calls
          </div>
        </div>

        {/* Active WIP Comparison Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Active WIP Comparison
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#f59e0b", marginTop: "4px" }}>
            {formatNumber(activeRegionStats.wip)}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Active work order calls
          </div>
        </div>

        {/* Closed Share % Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Closed Share Ratio
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#8b5cf6", marginTop: "4px" }}>
            {closedPercentage}%
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Of total operations volume
          </div>
        </div>
      </div>

      {/* Regional Closed Call Ledger Section */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "var(--heading-color, #111827)" }}>
              Regional Closed Ledger Cards
            </h3>
            <p style={{ fontSize: "12px", color: "var(--muted-color, #6b7280)", margin: "2px 0 0 0" }}>
              Click any region card below to filter closed call records to that specific operational region.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            {/* The period is chosen once, in the page header — every number on these
                cards follows it, so the parts always sum to the ALL card. */}
            {selectedRegion && selectedRegion !== "ALL" && (
              <button
                type="button"
                className="textButton"
                onClick={() => setSelectedRegion(null)}
                style={{ fontSize: "12px", fontWeight: "600", color: "#3b82f6", cursor: "pointer", background: "none", border: "none" }}
              >
                Clear Region Filter (Show All)
              </button>
            )}
          </div>
        </div>

        {/* Region Cards Grid — three per row, so the six cards read as a balanced 3 + 3
            block instead of five across with one stranded underneath.
            `calc(33.333% - 8px)` is exactly one third of the row once the two 12px gaps
            are taken out, so a wide container lays out exactly three columns; the 220px
            floor takes over on narrow screens (phones / collapsed sidebar) and the grid
            drops to two columns and then one, rather than squeezing three. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(max(220px, calc(33.333% - 8px)), 1fr))",
            gap: "12px",
          }}
        >
          {/* Total All Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedRegion(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedRegion(null); }
            }}
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              border: !selectedRegion || selectedRegion === "ALL" ? "2px solid #10b981" : "1px solid var(--border-color, #e5e7eb)",
              background: !selectedRegion || selectedRegion === "ALL" ? "#ecfdf5" : "var(--card-bg, #ffffff)",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: !selectedRegion || selectedRegion === "ALL" ? "#047857" : "#374151" }}>
              ALL REGIONS
            </div>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#10b981", margin: "4px 0" }}>
              {formatNumber(closedCountFor("", overallClosedCount))}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>
              {periodPreset === "custom"
                ? `${formatNumber(totalActiveWipCount)} active WIP`
                : periodPreset === "today"
                  ? `${formatNumber(cycleTotal)} bill cycle · ${formatNumber(overallClosedCount)} all time · ${formatNumber(totalActiveWipCount)} active WIP`
                  : periodPreset === "cycle"
                    ? `${formatNumber(closedTodayCount)} closed today · ${formatNumber(overallClosedCount)} all time · ${formatNumber(totalActiveWipCount)} active WIP`
                    : `${formatNumber(closedTodayCount)} closed today · ${formatNumber(cycleTotal)} bill cycle · ${formatNumber(totalActiveWipCount)} active WIP`}
            </div>
            {(periodPreset === "cycle" || (periodPreset !== "custom" && !isCurrentCycle)) && (
              <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>
                Bill cycle {billCycle.monthLabel} · {billCycle.label}
                {isCurrentCycle ? "" : " (past cycle)"}
              </div>
            )}
            <ClosedOutcomeSplit
              {...closedOutcomeFor("", closedCountFor("", overallClosedCount))}
            />
            <ComparisonCounts
              closure={closureOutcomeFor("")}
              raw={rawOutcomeFor("")}
              rawHint={
                [
                  rawScopeNote,
                  rawUnregioned > 0
                    ? `${formatNumber(rawUnregioned)} on no region card — raw file has no ASP`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || null
              }
              closureHint={
                closureUnmatched > 0 ? `${formatNumber(closureUnmatched)} unmatched` : null
              }
              onDrill={(kind, outcome) =>
                setDrill({ kind, outcome, aspCode: "", label: "All Regions" })
              }
            />
          </div>

          {closedRegionBreakdown.map((entry) => {
            const isSelected = selectedRegion === entry.aspCode;
            return (
              <div
                key={entry.aspCode}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRegion(entry.aspCode)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedRegion(entry.aspCode); }
                }}
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: isSelected ? "2px solid #3b82f6" : "1px solid var(--border-color, #e5e7eb)",
                  background: isSelected ? "#eff6ff" : "var(--card-bg, #ffffff)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#1d4ed8" : "#374151" }}>
                  {entry.regionName}
                </div>
                <div style={{ fontSize: "20px", fontWeight: "800", color: isSelected ? "#2563eb" : "#10b981", margin: "4px 0" }}>
                  {formatNumber(closedCountFor(entry.aspCode, entry.closedCount))}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>
                  {entry.aspCode} | {formatNumber(entry.activeCount)} WIP
                  {periodPreset === "today"
                    ? ` · ${formatNumber(cycleCountByAsp.get(entry.aspCode) ?? 0)} cycle · ${formatNumber(entry.closedCount)} all time`
                    : ""}
                  {periodPreset === "cycle"
                    ? ` · ${formatNumber(closedTodayCountByAsp.get(entry.aspCode) ?? 0)} today · ${formatNumber(entry.closedCount)} all time`
                    : ""}
                  {periodPreset === "all"
                    ? ` · ${formatNumber(closedTodayCountByAsp.get(entry.aspCode) ?? 0)} today · ${formatNumber(cycleCountByAsp.get(entry.aspCode) ?? 0)} cycle`
                    : ""}
                </div>
                <ClosedOutcomeSplit
                  {...closedOutcomeFor(
                    entry.aspCode,
                    closedCountFor(entry.aspCode, entry.closedCount),
                  )}
                />
                <ComparisonCounts
                  closure={closureOutcomeFor(entry.aspCode)}
                  raw={rawOutcomeFor(entry.aspCode)}
                  rawHint={rawScopeNote}
                  onDrill={(kind, outcome) =>
                    setDrill({ kind, outcome, aspCode: entry.aspCode, label: entry.regionName })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Flex reconciliation — "did Flex agree with us on this day?". Sits beside the
          per-card "FieldEZ data closure" / "Raw data closures" comparison lines and uses
          the same count-with-drill-down pattern. Purely informational: nothing here
          closes, reopens or edits a call. Hidden entirely without a read token. */}
      {summaryToken && (
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Flex reconciliation
              </h3>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: "2px 0 0 0" }}>
                What we closed versus what Flex reported
                {reconAsp ? ` · ${reconAsp}` : " · all regions"}
              </p>
              {/* The two real totals, spelled out. The three bucket cards are a
                  comparison table — adding them up counts both sides' disagreements
                  plus the overlap as one number, which is nobody's closed count. */}
              {recon && (
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#374151", margin: "4px 0 0 0" }}>
                  We closed {formatNumber(recon.counts.matched + recon.counts.closedHereNotInFlex)}
                  {" · "}Flex reported {formatNumber(recon.counts.matched + recon.counts.closedInFlexNotHere)}
                </p>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {(closureStatus?.lastSyncAt || closureStatus?.lastImportedAt) && (
                <span
                  title={
                    closureSyncStale
                      ? "No sync has completed for over 3 cycles — the FieldEZ worker may be down."
                      : closureNoNewData
                        ? `Sync is running; the last closure data arrived ${formatIstTime(closureStatus.lastImportedAt)} (Flex has reported nothing new since).`
                        : `Last closure import (${closureStatus.lastImportSource ?? "?"})`
                  }
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "999px",
                    border: `1px solid ${closureSyncStale ? "#fecaca" : closureNoNewData ? "#e5e7eb" : "#d1fae5"}`,
                    background: closureSyncStale ? "#fef2f2" : closureNoNewData ? "#f9fafb" : "#ecfdf5",
                    color: closureSyncStale ? "#b91c1c" : closureNoNewData ? "#4b5563" : "#047857",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(closureStatus.lastSyncSource ?? closureStatus.lastImportSource) === "AUTO"
                    ? "Auto-synced"
                    : "Imported"}{" "}
                  {formatIstTime(closureStatus.lastSyncAt ?? closureStatus.lastImportedAt)}
                  {closureSyncStale
                    ? " · stale"
                    : closureNoNewData
                      ? " · no new closures yet"
                      : ""}
                </span>
              )}
              {/* A period rather than a single day. Both bounds are inclusive, and To is
                  seeded to From so opening the page still asks about one day — the same
                  question it asked before, with the same answer. */}
              <label style={{ fontSize: "12px", color: "#6b7280", display: "flex", alignItems: "center", gap: "6px" }}>
                From
                <input
                  type="date"
                  value={reconDate}
                  max={reconToDate || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReconDate(next);
                    if (!next || !reconToDate) return;
                    // Dragging From past To would make a backwards range, which the server
                    // refuses. Carrying To along keeps it a single day instead of an error.
                    if (next > reconToDate) {
                      setReconToDate(next);
                      return;
                    }
                    // Dragging From BACKWARDS can stretch the period past the limit without
                    // To having moved at all, so it is pulled in to match.
                    const start = Date.parse(`${next}T00:00:00Z`);
                    if (Number.isNaN(start)) return;
                    const limit = new Date(start + RECON_MAX_DAYS * 86_400_000)
                      .toISOString()
                      .slice(0, 10);
                    if (reconToDate > limit) setReconToDate(limit);
                  }}
                  style={{
                    padding: "6px 8px",
                    fontSize: "12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, #e5e7eb)",
                  }}
                />
              </label>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "flex", alignItems: "center", gap: "6px" }}>
                To
                <input
                  type="date"
                  value={reconToDate}
                  min={reconDate || undefined}
                  // The picker will not offer a day past the limit, so the range cannot be
                  // made too long by accident. The server refuses one anyway — this is so
                  // nobody meets that refusal.
                  max={reconMaxToDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    // A date typed rather than picked ignores `max`, so it is clamped here
                    // too. Silently, and the hint beside the field says what the limit is.
                    setReconToDate(next && next > reconMaxToDate ? reconMaxToDate : next);
                  }}
                  style={{
                    padding: "6px 8px",
                    fontSize: "12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, #e5e7eb)",
                  }}
                />
              </label>
              {/* Said only once the period is a period. On a single day the limit is not
                  something anybody needs to be told about; the moment To is clamped, it is
                  the explanation for why it moved on its own. */}
              {reconToDate > reconDate ? (
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                  up to {RECON_MAX_DAYS} days
                </span>
              ) : null}
            </div>
          </div>

          {reconError && (
            <p style={{ fontSize: "12px", color: "#b91c1c", margin: "0 0 10px 0" }}>
              {reconError}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {RECON_BUCKETS.map((bucket) => {
              const count = recon?.counts[bucket.key] ?? 0;
              const isOpen = reconBucket === bucket.key;
              const clickable = count > 0;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  disabled={!clickable}
                  title={bucket.hint}
                  onClick={() => setReconBucket(isOpen ? null : bucket.key)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: isOpen
                      ? `2px solid ${bucket.color}`
                      : "1px solid var(--border-color, #e5e7eb)",
                    background: isOpen ? "#f9fafb" : "var(--card-bg, #ffffff)",
                    textAlign: "left",
                    cursor: clickable ? "pointer" : "default",
                    font: "inherit",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280" }}>
                    {bucket.label}
                    {clickable && <span style={{ fontSize: "9px", opacity: 0.7 }}> ▸</span>}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: bucket.color, margin: "4px 0 0 0" }}>
                    {reconLoading && !recon ? "…" : formatNumber(count)}
                  </div>
                </button>
              );
            })}
          </div>

          {reconBucket && recon && (
            <div style={{ marginTop: "14px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Ticket</th>
                    <th style={{ padding: "6px 8px" }}>Case</th>
                    <th style={{ padding: "6px 8px" }}>Region</th>
                    <th style={{ padding: "6px 8px" }}>Our status</th>
                    <th style={{ padding: "6px 8px" }}>Flex status</th>
                    <th style={{ padding: "6px 8px" }}>Closure date</th>
                    <th style={{ padding: "6px 8px" }}>Closed here</th>
                  </tr>
                </thead>
                <tbody>
                  {recon[reconBucket].map((row, index) => (
                    <tr
                      key={`${row.ticketId}-${row.caseId}-${index}`}
                      style={{ borderTop: "1px solid var(--border-color, #e5e7eb)" }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.ticketId || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.caseId || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.aspCode || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.rtplStatus || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.closureStatus || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.closureDate || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>
                        {row.hoursSinceClosedHere === null
                          ? "—"
                          : `${row.hoursSinceClosedHere}h ago`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Closed Calls Ledger Data Table Section */}
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* Table Controls Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>
              Closed Call Records Ledger ({filteredClosedRows.length})
            </h3>
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "2px 0 0 0" }}>
              Showing {filteredClosedRows.length} of {closedRows.length} total closed records
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Import Closure Dates (matches by WO ID / Case ID from the Flex Closure ASP Report) */}
            {closureImportToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <input
                  ref={closureFileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => void handleClosureFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => closureFileInputRef.current?.click()}
                  title="Adds and refreshes the closures this file lists. Closures it does not mention are left alone."
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    border: "1px solid #c7d2fe",
                    background: importing ? "#eef2ff" : "#4f46e5",
                    color: importing ? "#6366f1" : "#ffffff",
                    cursor: importing ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {importing ? "Importing…" : "⬆ Import Closure Dates"}
                </button>
                {importMessage && (
                  <span style={{ fontSize: "11px", color: "#6b7280", maxWidth: "260px", textAlign: "right" }}>
                    {importMessage}
                  </span>
                )}
              </div>
            )}

            {/* Sync Raw Data — pulls the Flex RAW closed-call rows from the raw-data
                project's API (no file upload). Feeds the "Raw data closures" card line.
                Same permissions as the closure-date import. */}
            {closureImportToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <button
                  type="button"
                  disabled={rawSyncing}
                  onClick={() => void handleSyncRawData()}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    border: "1px solid #fed7aa",
                    background: rawSyncing ? "#fff7ed" : "#ea580c",
                    color: rawSyncing ? "#ea580c" : "#ffffff",
                    cursor: rawSyncing ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rawSyncing ? "Syncing…" : "🔄 Sync Raw Data"}
                </button>
                {rawSyncMessage && (
                  <span style={{ fontSize: "11px", color: "#6b7280", maxWidth: "260px", textAlign: "right" }}>
                    {rawSyncMessage}
                  </span>
                )}
              </div>
            )}

            {/* Search Box */}
            <div style={{ width: "320px", maxWidth: "100%" }}>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Ticket ID, WO, ASP, Engineer, Status..."
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #f9fafb)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-color, #e5e7eb)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--th-bg, #f3f4f6)", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>S.No</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Ticket ID</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>ASP / Region</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>WO OTC Code</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Engineer</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer / Segment</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Name</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Mail</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Contact</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>WIP Aging</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Case Created Time</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Case Closed Date</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Status</th>
                <th style={{ padding: "10px 14px", fontWeight: "700", textAlign: "center" }}>Customer Feedback</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>RTPL Status</th>
                <th style={{ padding: "10px 14px", fontWeight: "700", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosedRows.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ padding: "32px 14px", textAlign: "center", color: "#6b7280" }}>
                    {searchQuery.trim()
                      ? `No closed call records matching "${searchQuery}"`
                      : "No closed call records available for the selected filter."}
                  </td>
                </tr>
              ) : (
                visibleClosedRows.map((row, pageIdx) => {
                  // Absolute position in the filtered set, so the S.No column keeps
                  // counting across pages instead of restarting at 1 on each one.
                  const idx = ledgerStart + pageIdx;
                  const out = (row.output ?? {}) as Record<string, unknown>;
                  const ticketId = String(out["Ticket ID"] ?? "-");
                  const rowAsp = getRowAspCode(out);
                  const rowRegionName = getRowRegionName(rowAsp);
                  const aspDisplay = rowRegionName !== "-" && rowRegionName !== rowAsp
                    ? `${rowRegionName} (${rowAsp})`
                    : rowAsp || "-";
                  const woOtc = String(out["WO OTC CODE"] ?? out["WO OTC Code"] ?? "-");
                  const engineer = String(out["Engineer"] ?? "-");
                  const customer = String(out["Customer Name"] ?? out["Customer"] ?? "-");
                  const status = String(out["RTPL status"] ?? "Closed");
                  const segment = String(out["Segment"] ?? "-");
                  const contact = String(out["Contact"] ?? "-");
                  const customerMail = String(out["Customer Mail"] ?? "-");
                  const accountName = String(out["Account Name"] ?? "-");
                  const wipAging = String(out["WIP aging"] ?? out["WIP Aging"] ?? "-");
                  const caseCreatedTime = String(out["Case Created Time"] ?? "-");
                  // Closure date comes from the imported Closure-Date Excel (matched by
                  // WO ID / Case ID), not a calculation. "-" until an import supplies it.
                  const caseClosedDate = String(out["Case Closed Date"] ?? "-");
                  // Customer Status is derived server-side from saved customer feedback.
                  const customerStatus = String(out["Customer Status"] ?? "-");

                  return (
                    <tr
                      key={row.serialNo ?? idx}
                      style={{
                        borderBottom: "1px solid var(--border-color, #f3f4f6)",
                        transition: "background 0.15s",
                      }}
                    >
                      <td style={{ padding: "10px 14px", color: "#6b7280" }}>{idx + 1}</td>
                      <td style={{ padding: "10px 14px", fontWeight: "600", color: "#1d4ed8" }}>{ticketId}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: "#f3f4f6",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                          }}
                        >
                          {aspDisplay}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{woOtc}</td>
                      <td style={{ padding: "10px 14px", fontWeight: "500" }}>{engineer}</td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        <div style={{ fontWeight: "600" }}>{customer}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                          {segment && segment !== "-" && (
                            <span style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: "4px", fontWeight: "500" }}>
                              {segment}
                            </span>
                          )}
                          {accountName && accountName !== "-" && (
                            <span>• Account: {accountName}</span>
                          )}
                          {contact && contact !== "-" && (
                            <span>• Contact: {contact}</span>
                          )}
                          {customerMail && customerMail !== "-" && (
                            <span>• Mail: {customerMail}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: "500", color: "#374151" }}>
                        {customer}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        {customerMail}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        {contact}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {wipAging !== "-" ? `${wipAging} days` : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {caseCreatedTime}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {caseClosedDate}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", maxWidth: "220px" }}>
                        {customerStatus}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {feedbackToken ? (
                          <button
                            type="button"
                            onClick={() => openFeedback(row)}
                            style={{
                              padding: "5px 10px",
                              fontSize: "12px",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #c7d2fe",
                              background: "#eef2ff",
                              color: "#4f46e5",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {customerStatus !== "-" ? "Edit feedback" : "+ Feedback"}
                          </button>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: "#ecfdf5",
                            color: "#047857",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            border: "1px solid #a7f3d0",
                          }}
                        >
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenCaseDetail) {
                              onOpenCaseDetail(row);
                            } else {
                              openRecordsWithFilter({ ticketIds: [ticketId], closedOnly: true });
                            }
                          }}
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#2563eb",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredClosedRows.length > 0 && (
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              fontSize: "12px",
              color: "#6b7280",
            }}
          >
            {ledgerPageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {(
                  [
                    { label: "‹ Prev", to: safeLedgerPage - 1, disabled: safeLedgerPage === 0 },
                    {
                      label: "Next ›",
                      to: safeLedgerPage + 1,
                      disabled: safeLedgerPage >= ledgerPageCount - 1,
                    },
                  ] as const
                ).map((control) => (
                  <button
                    key={control.label}
                    type="button"
                    disabled={control.disabled}
                    onClick={() => setLedgerPage(control.to)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      borderRadius: "6px",
                      border: "1px solid var(--border-color, #e5e7eb)",
                      background: control.disabled ? "#f9fafb" : "var(--card-bg, #ffffff)",
                      color: control.disabled ? "#d1d5db" : "#374151",
                      cursor: control.disabled ? "default" : "pointer",
                    }}
                  >
                    {control.label}
                  </button>
                ))}
                <span>
                  Page {safeLedgerPage + 1} of {formatNumber(ledgerPageCount)}
                </span>
              </div>
            )}
            <span>
              Showing {formatNumber(ledgerStart + 1)}–
              {formatNumber(ledgerStart + visibleClosedRows.length)} of{" "}
              {formatNumber(filteredClosedRows.length)} closed call records. Export Excel
              covers all of them.{" "}
              <button
                type="button"
                onClick={() => openRecordsWithFilter({ region: selectedRegion, closedOnly: true })}
                style={{ color: "#2563eb", fontWeight: "600", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Open full interactive table
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Customer Feedback modal — portaled to <body> so an ancestor with
          backdrop-filter (the glassy cards) cannot hijack its position:fixed. */}
      {feedbackRow &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          onClick={() => !fbSaving && setFeedbackRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "12px",
              padding: "24px",
              width: "440px",
              maxWidth: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 4px 0", fontSize: "17px", fontWeight: 700 }}>
              Customer Feedback
            </h3>
            <p style={{ margin: "0 0 18px 0", fontSize: "12px", color: "#6b7280" }}>
              {String(
                (feedbackRow.output as Record<string, unknown>)["Ticket ID"] ?? "",
              )}
            </p>

            {(() => {
              const selectStyle: React.CSSProperties = {
                width: "100%",
                padding: "9px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                background: "var(--input-bg, #f9fafb)",
                fontFamily: "inherit",
                color: "#111827",
              };
              return (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                      Call Status
                    </label>
                    <select
                      value={fbCallStatus}
                      onChange={(e) => setFbCallStatus(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select call status…</option>
                      {CALL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                      Customer Feedback
                    </label>
                    <select
                      value={fbFeedback}
                      onChange={(e) => setFbFeedback(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select feedback…</option>
                      {CUSTOMER_FEEDBACK_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                Remarks <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={fbRemarks}
                onChange={(e) => setFbRemarks(e.target.value)}
                rows={3}
                placeholder="Any extra notes…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "var(--input-bg, #f9fafb)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {fbError && (
              <div style={{ color: "#dc2626", fontSize: "12px", marginBottom: "12px" }}>
                {fbError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setFeedbackRow(null)}
                disabled={fbSaving}
                style={{
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveFeedback()}
                disabled={fbSaving}
                style={{
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  background: fbSaving ? "#a5b4fc" : "#4f46e5",
                  color: "#ffffff",
                  cursor: fbSaving ? "default" : "pointer",
                }}
              >
                {fbSaving ? "Saving…" : "Save feedback"}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}

      {/* Record-list drill-down for a card's Closure-import / Raw-data-closed count. */}
      {drill && summaryToken && (
        <RecordsDrillModal
          token={summaryToken}
          kind={drill.kind}
          outcome={drill.outcome}
          aspCode={drill.aspCode}
          closureFrom={dateLo}
          closureTo={dateHi}
          rawMonthFrom={monthLo}
          rawMonthTo={monthHi}
          rawDateFrom={rawDayPrecise ? dateLo : ""}
          rawDateTo={rawDayPrecise ? dateHi : ""}
          regionLabel={drill.label}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

/**
 * Portaled modal listing the individual records behind a card's "FieldEZ data closure" or
 * "Raw data closures" count, scoped to the same ASP + month the card showed. Fetches its
 * own data so opening it never blocks the cards.
 */
function RecordsDrillModal({
  token, kind, outcome, aspCode, closureFrom, closureTo, rawMonthFrom, rawMonthTo,
  rawDateFrom, rawDateTo, regionLabel, onClose,
}: Readonly<{
  token: string;
  kind: "closure" | "raw";
  /** Which half of the card's line was clicked — completions or cancellations. */
  outcome: "closed" | "cancelled";
  aspCode: string;
  /** Day-precise date bounds ("YYYY-MM-DD") used for the closure records. */
  closureFrom: string;
  closureTo: string;
  /** Month bounds ("YYYY-MM") used for the raw records when day bounds are off. */
  rawMonthFrom: string;
  rawMonthTo: string;
  /**
   * Day bounds ("YYYY-MM-DD") on the raw records' WO Closed date. Set only when
   * the card's count was confirmed day-precise, so the list always shows exactly
   * the rows the number counted.
   */
  rawDateFrom: string;
  rawDateTo: string;
  regionLabel: string;
  onClose: () => void;
}>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (kind === "closure") {
          const { getClosureDateRecords } = await import("../../../lib/closureDateApiClient");
          const res = await getClosureDateRecords(token, {
            asp: aspCode, from: closureFrom, to: closureTo, status: outcome,
          });
          if (cancelled) return;
          setRows(
            res.rows.map((r) => ({
              "WO ID": r.woId || "-",
              "Case ID": r.caseId || "-",
              // Flex closes cancellations without a closure date, so a blank here is
              // expected — the status column is what explains it.
              "Closure Date": r.closureDate || "-",
              "Flex Status": r.closureStatus || "-",
              Region: r.aspCode || "(unmatched)",
            })),
          );
          setTotal(res.total);
        } else {
          const { getFlexRawRecords } = await import("../../../lib/flexRawApiClient");
          const dayScoped = rawDateFrom !== "" || rawDateTo !== "";
          // Day bounds replace the month bounds outright — they are stricter,
          // and the month filter would additionally drop rows with a blank
          // Month cell that the day count legitimately included.
          const res = await getFlexRawRecords(token, {
            asp: aspCode,
            from: dayScoped ? "" : rawMonthFrom,
            to: dayScoped ? "" : rawMonthTo,
            dateFrom: rawDateFrom,
            dateTo: rawDateTo,
            status: outcome,
          });
          if (cancelled) return;
          setRows(
            res.rows.map((r) => ({
              Ticket: r.ticketNo || "-",
              "Case ID": r.caseId || "-",
              "Work Location": r.workLocation || "-",
              "Call Status": r.callStatus || "-",
              Closed: r.closedOn ? formatDateKey(r.closedOn) : "-",
              Month: r.month ? formatMonthKey(r.month) : "-",
            })),
          );
          setTotal(res.total);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kind, outcome, aspCode, closureFrom, closureTo, rawMonthFrom, rawMonthTo, rawDateFrom, rawDateTo]);

  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  const title =
    (kind === "closure" ? "FieldEZ data closure" : "Raw data closures") +
    (outcome === "cancelled" ? " — cancelled" : "");
  // Closure and day-scoped raw show the exact dates picked; month-scoped raw
  // shows the months the range mapped to.
  const rangeLabel =
    kind === "closure"
      ? formatRangeLabel(closureFrom, closureTo, formatDateKey, "All dates")
      : rawDateFrom || rawDateTo
        ? formatRangeLabel(rawDateFrom, rawDateTo, formatDateKey, "All dates")
        : formatRangeLabel(rawMonthFrom, rawMonthTo, formatMonthKey, "All months");
  const scope = `${regionLabel} · ${rangeLabel}`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #ffffff)", borderRadius: "12px", width: "760px",
          maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: kind === "closure" ? "#7c3aed" : "#ea580c" }}>
              {title}
            </h3>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
              {scope} · {formatNumber(total)} record{total === 1 ? "" : "s"}
              {total > rows.length && ` (showing first ${formatNumber(rows.length)})`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WO, Case ID, status…"
            style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-color, #d1d5db)", background: "var(--input-bg, #f9fafb)" }}
          />
        </div>

        <div style={{ overflow: "auto", padding: "12px 20px 20px", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280", fontSize: "13px" }}>Loading records…</div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280", fontSize: "13px" }}>
              {rows.length === 0 ? "No records for this scope." : "No records match the search."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--border-color, #e5e7eb)", position: "sticky", top: 0, background: "var(--card-bg, #ffffff)", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-color, #f0f1f4)", color: "#1f2937", whiteSpace: "nowrap" }}>
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
