// The Closed Calls period — the one filter every number on that page answers for.
//
// Lifted out of ClosedCallsDashboardView so the SIDEBAR BADGE can read the same period
// without redefining it. The badge used to show `overallClosedCount`, the all-time ledger,
// which only ever grows and answered a question nobody was asking; showing the period
// count instead means the badge and the page must agree about what "the period" is, and
// two copies of `rowInPeriod` would drift the first time either was touched.
//
// Nothing here changes what a period MEANS. The preset rules, the today/Case-Closed-Date
// split and the bill cycle are the same ones the page has always used.
import { useCallback, useMemo } from "react";
import type { ReportRow } from "../types";
import { useSessionPersistedState } from "../../../lib/useSessionPersistedState";
import { todayIsoDate } from "./dateUtils";
import {
  billCycleFor,
  billCycleForKey,
  prevMonthKey,
  type BillCycle,
} from "./billCycle";

/** sessionStorage keys. Per-tab: the filter follows you around the app, not across days. */
export const CLOSED_CALLS_PERIOD_KEYS = {
  from: "closedCalls.periodFrom",
  to: "closedCalls.periodTo",
  cycle: "closedCalls.cycleKey",
} as const;

/**
 * Which of the four periods the current bounds describe. DERIVED, never stored — the
 * bounds are the truth, so a preset can never claim a range it does not actually cover.
 */
export type ClosedCallsPeriodPreset = "today" | "cycle" | "custom" | "all";

const MONTH_KEY = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

/** The row's Case Closed Date as YYYY-MM-DD, or null when absent/unparseable. */
export function caseClosedIsoOf(output: Record<string, unknown>): string | null {
  const raw = String(output["Case Closed Date"] ?? "").trim();
  const dmy = DMY_DATE.exec(raw);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/** "2026-06-05" -> "05-06-2026". */
export function formatDateKey(key: string): string {
  const match = ISO_DATE.exec(key);
  return match ? `${key.slice(8, 10)}-${key.slice(5, 7)}-${key.slice(0, 4)}` : key;
}

/** Human label for a from/to range: "05-06-2026 → 20-08-2026", "onwards", "up to", … */
export function formatRangeLabel(
  lo: string,
  hi: string,
  fmt: (value: string) => string,
  allLabel: string,
): string {
  if (!lo && !hi) return allLabel;
  if (lo && hi) return lo === hi ? fmt(lo) : `${fmt(lo)} → ${fmt(hi)}`;
  return lo ? `${fmt(lo)} onwards` : `up to ${fmt(hi)}`;
}

/** A reversed From/To is swapped, so the order the two dates were picked in never matters. */
export function normalizePeriodBounds(
  from: string,
  to: string,
): readonly [string, string] {
  if (from && to && from > to) return [to, from];
  return [from, to];
}

/** The cycle a stored key names, falling back to today's cycle for a missing/garbage key. */
export function billCycleForStoredKey(key: string, fallback: BillCycle): BillCycle {
  return MONTH_KEY.test(key) ? billCycleForKey(key) : fallback;
}

export function periodPresetOf(
  dateLo: string,
  dateHi: string,
  billCycle: BillCycle,
  today: string,
): ClosedCallsPeriodPreset {
  if (!dateLo && !dateHi) return "all";
  if (dateLo === today && dateHi === today) return "today";
  if (dateLo === billCycle.fromIso && dateHi === billCycle.toIso) return "cycle";
  return "custom";
}

/**
 * Whether a closed row falls inside the period — THE page-wide predicate.
 *
 * "Today" keeps the report-day rule (`sameDayClosedRow`) rather than comparing Case Closed
 * Date strings: it is the rule the "closed today" headline has always used, and it still
 * counts a closure Flex reported late with a back-dated Case Closed Date. Every other
 * period goes by Case Closed Date, and a row without one is excluded rather than guessed.
 */
export function makeRowInPeriod(
  preset: ClosedCallsPeriodPreset,
  dateLo: string,
  dateHi: string,
): (row: ReportRow) => boolean {
  const rangeActive = Boolean(dateLo || dateHi);
  return (row: ReportRow): boolean => {
    if (!rangeActive) return true;
    if (preset === "today") return row.carryForward.sameDayClosedRow === true;
    const iso = caseClosedIsoOf((row.output ?? {}) as Record<string, unknown>);
    if (!iso) return false;
    if (dateLo && iso < dateLo) return false;
    if (dateHi && iso > dateHi) return false;
    return true;
  };
}

/**
 * The ALL-regions closed count for a period, mirroring `closedCountFor("", …)` exactly.
 *
 * "All dates" answers with the backend's own ledger total rather than the row count, which
 * is what the page has always shown; every other preset counts the rows the predicate
 * admits. Kept here so the badge cannot drift from the card.
 */
export function closedCountForPeriod(input: {
  rows: readonly ReportRow[];
  preset: ClosedCallsPeriodPreset;
  rowInPeriod: (row: ReportRow) => boolean;
  allTimeCount: number;
}): number {
  if (input.preset === "all") return input.allTimeCount;
  let count = 0;
  for (const row of input.rows) if (input.rowInPeriod(row)) count += 1;
  return count;
}

/**
 * The cycles the picker offers: every one from the current cycle back to the oldest
 * closure the page can count, so a month with data is never missing from the list.
 *
 * Capped at two years, and at six cycles while nothing has loaded yet. A FUTURE-dated Case
 * Closed Date (they happen) would otherwise leave the current cycle as the only option, so
 * a floor later than today is ignored in favour of the six-cycle default.
 */
export function buildBillCycleOptions(input: {
  /** Every closed row, for the earliest Case Closed Date. */
  rows: readonly ReportRow[];
  /** Months the imported sources have data for ("YYYY-MM"). */
  months: readonly string[];
  currentCycleKey: string;
}): BillCycle[] {
  let earliestIso: string | null = null;
  for (const row of input.rows) {
    const iso = caseClosedIsoOf((row.output ?? {}) as Record<string, unknown>);
    if (!iso) continue;
    if (earliestIso === null || iso < earliestIso) earliestIso = iso;
  }

  const earliestMonth = [...input.months].sort()[0];
  const earliestKeys = [
    earliestIso ? billCycleFor(earliestIso).key : null,
    earliestMonth ? billCycleFor(`${earliestMonth}-01`).key : null,
  ].filter((key): key is string => key !== null);
  const earliestKey = earliestKeys.length ? earliestKeys.sort()[0] ?? null : null;
  const floorKey =
    earliestKey && earliestKey < input.currentCycleKey ? earliestKey : null;

  const options: BillCycle[] = [];
  let key = input.currentCycleKey;
  for (let index = 0; index < 24; index += 1) {
    options.push(billCycleForKey(key));
    if (floorKey ? key <= floorKey : index >= 5) break;
    key = prevMonthKey(key);
  }
  return options;
}

export interface ClosedCallsPeriod {
  periodFrom: string;
  setPeriodFrom: (value: string) => void;
  periodTo: string;
  setPeriodTo: (value: string) => void;
  cycleKey: string;
  setCycleKey: (value: string) => void;
  /** Normalised bounds ("" = unbounded end). */
  dateLo: string;
  dateHi: string;
  rangeActive: boolean;
  /** The bill cycle today falls in. */
  currentBillCycle: BillCycle;
  /** The bill cycle the picker is pointing at. */
  billCycle: BillCycle;
  isCurrentCycle: boolean;
  periodPreset: ClosedCallsPeriodPreset;
  rowInPeriod: (row: ReportRow) => boolean;
  /** Sets the bounds for a preset. "custom" leaves them alone — it only opens the inputs. */
  applyPreset: (preset: ClosedCallsPeriodPreset) => void;
  /** Moves the picker AND the bounds to another cycle. */
  selectCycle: (key: string) => void;
}

/**
 * The period, its persistence and everything derived from it.
 *
 * Two consumers on purpose: the Closed Calls page and the sidebar badge that summarises
 * it. Both mount inside the same tab, so both read the same sessionStorage values and
 * therefore the same period.
 */
export function useClosedCallsPeriod(): ClosedCallsPeriod {
  const [periodFrom, setPeriodFrom] = useSessionPersistedState(
    CLOSED_CALLS_PERIOD_KEYS.from,
    todayIsoDate,
  );
  const [periodTo, setPeriodTo] = useSessionPersistedState(
    CLOSED_CALLS_PERIOD_KEYS.to,
    todayIsoDate,
  );

  const currentBillCycle = useMemo(() => billCycleFor(todayIsoDate()), []);

  const [cycleKey, setCycleKey] = useSessionPersistedState(
    CLOSED_CALLS_PERIOD_KEYS.cycle,
    () => currentBillCycle.key,
  );

  const billCycle = useMemo(
    () => billCycleForStoredKey(cycleKey, currentBillCycle),
    [cycleKey, currentBillCycle],
  );

  const [dateLo, dateHi] = useMemo(
    () => normalizePeriodBounds(periodFrom, periodTo),
    [periodFrom, periodTo],
  );

  const periodPreset = useMemo(
    () => periodPresetOf(dateLo, dateHi, billCycle, todayIsoDate()),
    [dateLo, dateHi, billCycle],
  );

  const rowInPeriod = useMemo(
    () => makeRowInPeriod(periodPreset, dateLo, dateHi),
    [periodPreset, dateLo, dateHi],
  );

  const applyPreset = useCallback(
    (preset: ClosedCallsPeriodPreset) => {
      if (preset === "today") {
        const today = todayIsoDate();
        setPeriodFrom(today);
        setPeriodTo(today);
        return;
      }
      if (preset === "cycle") {
        setPeriodFrom(billCycle.fromIso);
        setPeriodTo(billCycle.toIso);
        return;
      }
      if (preset === "all") {
        setPeriodFrom("");
        setPeriodTo("");
      }
      // "custom" keeps whatever bounds are set — the segment only reveals the inputs.
    },
    [billCycle, setPeriodFrom, setPeriodTo],
  );

  const selectCycle = useCallback(
    (key: string) => {
      setCycleKey(key);
      const cycle = billCycleForStoredKey(key, currentBillCycle);
      setPeriodFrom(cycle.fromIso);
      setPeriodTo(cycle.toIso);
    },
    [currentBillCycle, setCycleKey, setPeriodFrom, setPeriodTo],
  );

  return {
    periodFrom,
    setPeriodFrom,
    periodTo,
    setPeriodTo,
    cycleKey,
    setCycleKey,
    dateLo,
    dateHi,
    rangeActive: Boolean(dateLo || dateHi),
    currentBillCycle,
    billCycle,
    isCurrentCycle: billCycle.key === currentBillCycle.key,
    periodPreset,
    rowInPeriod,
    applyPreset,
    selectCycle,
  };
}
