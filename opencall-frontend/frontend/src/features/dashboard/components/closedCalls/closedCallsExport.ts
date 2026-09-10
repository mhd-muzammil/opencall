// What a Closed Calls export says about itself.
//
// The workbook used to be a bare dump of the filtered rows called
// `Closed_Calls_Ledger_ALL_2026-09-10.xlsx` — and that date is the day you pressed the
// button, not the period. Open the file a week later and there is nothing in it, or on
// it, that says whether you are looking at one day, one bill cycle, or the whole ledger;
// 1,185 rows could be any of them. A filtered export whose filter is invisible is worse
// than no export, because it gets mailed on.
//
// So: the period goes in the FILENAME, and everything else — region, search, the counts
// as they stood on screen — goes in a Scope sheet in front of the data. Pure functions,
// so both can be pinned by tests rather than eyeballed in Excel.
import { formatDateKey, type ClosedCallsPeriodPreset } from "../../utils/closedCallsPeriod";
import type { ClosureOutcome } from "../closureOutcome";
import type { OursOutcome } from "./types";

export interface ClosedCallsExportScope {
  preset: ClosedCallsPeriodPreset;
  /** Normalised period bounds; "" either side means unbounded. */
  dateLo: string;
  dateHi: string;
  /** "Aug 2026 cycle (25 Jul – 24 Aug)" — only meaningful for the cycle preset. */
  cycleLabel: string;
  /** "All regions", or the region's own name. */
  regionLabel: string;
  /** ASP code, or "" for every region. */
  aspCode: string;
  /** The ledger search in force, which the export honours. "" when none. */
  search: string;
  /** How many rows the file actually holds. */
  rowCount: number;
  ours: OursOutcome;
  /** null when that source has never been imported. */
  fieldez: ClosureOutcome | null;
  raw: ClosureOutcome | null;
  generatedAt: Date;
}

/** "2026-09-10T14:32:00Z" -> "10-09-2026 20:02 IST". */
export function formatIstStamp(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} IST`;
}

/** ISO day, or the ISO date of `generatedAt` in IST when the bound is missing. */
function istDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The period, in words, exactly as the page states it.
 *
 * "Today" says the report-day rule out loud, because that period is NOT a date filter —
 * it is the calls this report closed, which still includes a closure Flex back-dated.
 */
export function describeExportPeriod(scope: ClosedCallsExportScope): string {
  if (scope.preset === "all") return "All dates — the whole ledger (never pruned)";
  if (scope.preset === "today") {
    return `Today (${formatDateKey(scope.dateLo)}) — closed on this report's day`;
  }
  if (scope.preset === "cycle") return `Bill cycle ${scope.cycleLabel}`;
  if (scope.dateLo && scope.dateHi) {
    return scope.dateLo === scope.dateHi
      ? `${formatDateKey(scope.dateLo)} — by Case Closed Date`
      : `${formatDateKey(scope.dateLo)} to ${formatDateKey(scope.dateHi)} — by Case Closed Date`;
  }
  if (scope.dateLo) return `${formatDateKey(scope.dateLo)} onwards — by Case Closed Date`;
  return `Up to ${formatDateKey(scope.dateHi)} — by Case Closed Date`;
}

/** The period as a filename fragment: sortable, and never the day you pressed the button. */
function periodSlug(scope: ClosedCallsExportScope): string {
  if (scope.preset === "all") return "all-dates";
  if (scope.preset === "today") return `today_${scope.dateLo || istDay(scope.generatedAt)}`;
  if (scope.dateLo && scope.dateHi) {
    return scope.dateLo === scope.dateHi
      ? scope.dateLo
      : `${scope.dateLo}_to_${scope.dateHi}`;
  }
  if (scope.dateLo) return `from_${scope.dateLo}`;
  if (scope.dateHi) return `upto_${scope.dateHi}`;
  return "all-dates";
}

/**
 * The workbook's name.
 *
 * `Closed_Calls_ALL_2026-07-25_to_2026-08-24.xlsx` rather than the old
 * `Closed_Calls_Ledger_ALL_<today>.xlsx`, whose date told you when it was downloaded and
 * nothing about what was in it. A search is marked in the name too — a filtered file that
 * looks like a full one is the version that gets forwarded to someone.
 */
export function closedCallsExportFilename(scope: ClosedCallsExportScope): string {
  const region = scope.aspCode ? scope.aspCode.toUpperCase() : "ALL";
  const filtered = scope.search.trim() ? "_filtered" : "";
  return `Closed_Calls_${region}_${periodSlug(scope)}${filtered}.xlsx`;
}

type Cell = string | number;

/**
 * The Scope sheet: what this file covers, and the counts as the page showed them.
 *
 * A sheet of its own rather than rows above the table, so a filter or a pivot over the
 * data sheet still starts at the header row.
 */
export function closedCallsScopeSheet(scope: ClosedCallsExportScope): Cell[][] {
  const rows: Cell[][] = [
    ["Closed Calls export"],
    [],
    ["Generated", formatIstStamp(scope.generatedAt)],
    ["Period", describeExportPeriod(scope)],
    ["Region", scope.aspCode ? `${scope.regionLabel} (${scope.aspCode})` : scope.regionLabel],
    ["Search filter", scope.search.trim() || "(none)"],
    ["Rows in this file", scope.rowCount],
    [],
    ["Counts on screen when this was exported"],
    ["Our closed count — completed", scope.ours.closed],
    ["Our closed count — cancelled", scope.ours.cancelled],
    ["Our closed count — no Flex outcome yet", scope.ours.unknown],
    ["Completed with no engineer in our CRM", scope.ours.closedWithoutEngineer],
  ];

  // Only stated when the source has actually been imported: a zero here would read as
  // "the vendor reported nothing", which is a different claim from "we never asked".
  rows.push(
    scope.fieldez
      ? ["FieldEZ data closure — completed", scope.fieldez.closed]
      : ["FieldEZ data closure", "not imported"],
  );
  if (scope.fieldez?.hasSplit) {
    rows.push(["FieldEZ data closure — cancelled", scope.fieldez.cancelled]);
  }
  rows.push(
    scope.raw
      ? ["Raw data closures — completed", scope.raw.closed]
      : ["Raw data closures", "not synced"],
  );

  rows.push(
    [],
    [
      "Note",
      "The data sheet holds every closed ROW in this period — completions, cancellations " +
        "and the ones Flex has not reported on. It is not the completed count above.",
    ],
  );

  return rows;
}
