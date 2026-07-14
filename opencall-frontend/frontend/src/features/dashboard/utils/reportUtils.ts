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
