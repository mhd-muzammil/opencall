// Pure report/row utilities extracted from app/page.tsx (Phase 3).
// Moved verbatim — no behavior changes.
import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { MANUAL_ENTRY_REQUIRED, MANUAL_FIELD_LABELS } from "../constants";
import type { ReportRow, SourceKey, ManualCarryForwardField } from "../types";
import type { WipAgingSortDirection } from "../../../lib/columnFilter";
import type { UploadBatch } from "../../../lib/apiClient";

export function parseWipAgingValue(value: unknown): number | null {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortRowsByWipAging(
  rows: readonly ReportRow[],
  direction: WipAgingSortDirection | null,
): ReportRow[] {
  if (!direction) {
    return [...rows];
  }

  return [...rows].sort((a, b) => {
    const aValue = parseWipAgingValue(a.output["WIP aging"]);
    const bValue = parseWipAgingValue(b.output["WIP aging"]);

    if (aValue !== null && bValue !== null) {
      return direction === "lowToHigh" ? aValue - bValue : bValue - aValue;
    }

    if (aValue !== null) return -1;
    if (bValue !== null) return 1;

    return a.serialNo - b.serialNo;
  });
}

export function tableColumnClassName(column: string): string {
  return `reportColumn reportColumn-${column
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatRtplStatusValue(value: string | null | undefined): string {
  const cleanValue = value?.trim();
  return cleanValue ? cleanValue : "blank";
}

export function formatComparisonValue(value: string | null): string {
  return value === null || value.trim() === "" ? "blank" : value;
}

// Only these three client-facing columns count toward "Manual entries pending".
// They're the fields the client needs filled before a record is usable; other
// placeholder cells (Engineer, Remarks, etc.) are not surfaced in this metric.
const MANUAL_PENDING_COLUMNS = ["Segment", "RTPL status", "Location"] as const;

export function countManualRequiredCells(rows: readonly ReportRow[]): number {
  return rows.reduce((count, row) => {
    const missingCount = MANUAL_PENDING_COLUMNS.filter((column) => {
      const value = String(row.output[column] ?? "").trim();
      return value === "" || value === MANUAL_ENTRY_REQUIRED;
    }).length;
    return count + missingCount;
  }, 0);
}

/**
 * Actionable = calls the team can act on right now: status "Scheduled" or
 * "To Be Scheduled" (exact match, tolerant of casing/punctuation). The single
 * definition behind the overview KPI tile, the BOD/EOD "Actionable Calls" rows
 * (in-app and Excel) and the RTPL Hours Status card.
 */
export function isActionableStatusValue(status: unknown): boolean {
  const s = String(status ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return s === "scheduled" || s === "to be scheduled";
}

function normalizeStatusValue(status: unknown): string {
  return String(status ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Planned = the day's booked visits: status "Scheduled" or an
 * engineer-assigned variant (exact match). Deliberately NOT "To be Scheduled"
 * (that's its own row/bucket) and NOT onsite (see isOnsiteStatusValue).
 * Single definition behind the BOD/EOD and TN VIEW "Planned Calls" rows.
 */
export function isPlannedStatusValue(status: unknown): boolean {
  const s = normalizeStatusValue(status);
  return (
    s === "scheduled" ||
    s === "engg assigned" ||
    s === "eng assigned" ||
    s === "engineer assigned"
  );
}

/**
 * Engg onsite = the engineer is physically at the customer: any status
 * containing "onsite". Assigned/scheduled no longer count here — a booking is
 * Planned, not onsite.
 */
export function isOnsiteStatusValue(status: unknown): boolean {
  return normalizeStatusValue(status).includes("onsite");
}

/**
 * Closed = an explicit closure status ("Case-Closed" / "WO Closed" and manual
 * variants). Matches the shared engineer-productivity CLOSED vocabulary.
 * Deliberately not "Closed-cancellation" / "Need to Close" — an intent to
 * close is not a completed close.
 */
export function isCaseClosedStatusValue(status: unknown): boolean {
  const s = normalizeStatusValue(status);
  return s.includes("case close") || s.includes("wo close");
}

/** The vendor's verdict on a work order it has closed. */
export type FlexClosureOutcome = "closed" | "cancelled" | "other";

/**
 * Classifies the Flex Closure ASP Report's own status. Only "WO Closed" is a completed
 * job — the one that gets paid for; "Closed - Canceled" is an abandoned call and must
 * never be counted with it.
 *
 * ORDER MATTERS: the literal "Closed - Canceled" contains BOTH words, so CANCEL is
 * tested first. Mirrors the backend's `classifyClosureStatus`
 * (services/closureDates/closureStatusClassify.ts) — the two must agree.
 */
export function classifyFlexClosureOutcome(status: unknown): FlexClosureOutcome {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("CANCEL")) return "cancelled";
  if (s.includes("CLOSE")) return "closed";
  return "other";
}

/**
 * True when the serve-time closure overlay rewrote this row's Flex Status, i.e. Flex
 * has actually told us how the call ended. The overlay parks the vendor's WIP value in
 * "Flex Status (WIP)" whenever it fires, so the key's PRESENCE is the marker — its
 * value may legitimately be the empty string.
 *
 * Without it, "Flex Status" is just the WIP status and says nothing about the outcome.
 */
export function hasFlexClosureOutcome(output: Record<string, unknown>): boolean {
  return "Flex Status (WIP)" in output;
}

/**
 * Whether a CLOSED row was a cancellation rather than a completed job — the test
 * behind "Closed Calls" vs "Closed cancelled" everywhere they are reported.
 *
 * Flex decides once it has reported the closure: only "WO Closed" is billable. This
 * used to test OUR OWN status column for the word "cancel", which misses every call
 * Flex cancelled while our column said something else — a row reading Customer
 * Pending in both Morning and Evening, with a Flex Status of "Closed - Canceled",
 * was counted as a completed closure.
 *
 * Until Flex reports, our column is the only signal there is, so the keyword test
 * stays as the fallback rather than being dropped.
 *
 * `ownStatus` is whichever column the caller reads — Morning for BOD, Evening for EOD.
 */
export function isCancelledClosure(
  output: Record<string, unknown>,
  ownStatus: unknown,
): boolean {
  if (hasFlexClosureOutcome(output)) {
    return classifyFlexClosureOutcome(output["Flex Status"]) === "cancelled";
  }
  return normalizeStatusValue(ownStatus).includes("cancel");
}

export function normalizeRecordSearchValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function rowMatchesRecordSearch(row: ReportRow, query: string): boolean {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const searchableText = [
    row.serialNo,
    row.comparison?.changeType,
    ...DAILY_CALL_PLAN_COLUMNS.flatMap((column) => [
      column,
      row.output[column],
    ]),
    ...row.carryForward.carriedForwardFields,
    ...row.carryForward.manualFieldsMissing,
  ]
    .map(normalizeRecordSearchValue)
    .join(" ");

  return terms.every((term) => searchableText.includes(term));
}

// Region predicate shared by the scoped records table and the search base.
// A records search must escape the active category/OTC scope but still respect
// the selected region, so both row sets need to agree on what "matches the
// selected region" means. Semantics mirror the original inline check in
// useRecordRowSets.regionFilteredRows: null/"ALL" match everything.
export function rowMatchesRegionFilter(
  row: ReportRow,
  selectedRegion: string | null,
): boolean {
  if (!selectedRegion || selectedRegion === "ALL") {
    return true;
  }
  const rowRegion = String(row.output["Work Location"] ?? "").trim().toUpperCase();
  const targetRegion = selectedRegion.trim().toUpperCase();
  return rowRegion === targetRegion;
}

// Picks the base row set for the records table. With no search the table shows
// only the scoped rows (category chip + region + WO OTC code). While a search is
// active the base widens to searchScopeRows (all Records rows matching the region
// only) so a search can surface cases outside the active category/OTC scope.
export function selectRecordSearchBaseRows<T>(
  recordsSearchQuery: string,
  regionFilteredRows: readonly T[],
  searchScopeRows: readonly T[],
): readonly T[] {
  return recordsSearchQuery.trim() === "" ? regionFilteredRows : searchScopeRows;
}

export function batchIdBySource(
  batches: readonly UploadBatch[],
  sourceType: SourceKey,
): string {
  return batches.find((batch) => batch.sourceType === sourceType)?.id ?? "";
}

export function formatFieldList(fields: readonly string[]): string {
  if (fields.length === 0) {
    return "None";
  }

  return fields
    .map((field) => MANUAL_FIELD_LABELS[field as ManualCarryForwardField] ?? field)
    .join(", ");
}
