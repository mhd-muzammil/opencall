// What each source can actually answer for, in the period the reader picked.
//
// The three closed counts on this page come from three systems with three different
// granularities, so they will not agree. Every one of these tags is derived from the live
// response — never hard-coded — because the whole point is that a reader can tell a real
// discrepancy from two sources answering different questions.
import { formatMonthKey } from "../../utils/billCycle";
import { formatRangeLabel } from "../../utils/closedCallsPeriod";
import type { ClosedCallsPeriodPreset } from "../../utils/closedCallsPeriod";
import type { CoverageTag } from "./types";

/** OUR closed rows: the report-day rule for today, Case Closed Date otherwise. */
export function oursCoverage(preset: ClosedCallsPeriodPreset): CoverageTag {
  if (preset === "today") {
    return { label: "report day", tone: "plain", note: "same-day closed rows" };
  }
  if (preset === "all") {
    return {
      label: "all time",
      tone: "plain",
      note: "ledger accumulates — never pruned",
    };
  }
  return { label: "day-precise", tone: "plain", note: "Case Closed Date in range" };
}

/**
 * FieldEZ: the summary endpoint filters on `closed_on` day-precisely whenever a range is
 * sent, so a range is always answered exactly. Without one it is the all-dates rollup.
 */
export function fieldezCoverage(preset: ClosedCallsPeriodPreset): CoverageTag {
  if (preset === "all") {
    return { label: "all dates summary", tone: "plain", note: "" };
  }
  return {
    label: "day-precise",
    tone: "plain",
    note: "closure-dates/summary from–to",
  };
}

/**
 * Raw: stored per month, and only day-precise once the backend CONFIRMS it
 * (`dayPrecise: true`, which needs migration 056). Treating an unconfirmed response as
 * day-filtered would show a whole month's closures as one day's, so the amber tag and the
 * "whole of …" note are the honest fallback rather than a cosmetic caveat.
 */
export function rawCoverage(input: {
  preset: ClosedCallsPeriodPreset;
  dayPrecise: boolean;
  monthLo: string;
  monthHi: string;
}): CoverageTag {
  if (input.preset === "all") {
    return { label: "all months", tone: "plain", note: "" };
  }
  if (input.dayPrecise) {
    return { label: "day-precise", tone: "plain", note: "WO Closed date in range" };
  }
  const months = formatRangeLabel(
    input.monthLo,
    input.monthHi,
    formatMonthKey,
    "all months",
  );
  return {
    label: "month-level",
    tone: "warn",
    note: `whole of ${months} — raw data is not day-precise`,
  };
}
