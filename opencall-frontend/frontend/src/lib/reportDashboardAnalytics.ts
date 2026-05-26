import type { GeneratedReportResponse } from "./apiClient";

export const ALL_REGIONS_FILTER = "ALL";

export interface RtplStatusMetric {
  status: string;
  count: number;
}

export interface WoOtcBreakdownEntry {
  code: string;
  count: number;
}

type ReportRow = GeneratedReportResponse["rows"][number];

function cleanedString(value: unknown): string {
  return String(value ?? "").trim();
}

function isManualEntryRequired(value: unknown): boolean {
  return cleanedString(value).toLowerCase() === "manual entry required";
}

function rtplStatusForAnalytics(row: ReportRow): string {
  const currentStatus = cleanedString(row.output["RTPL status"]);

  if (currentStatus && !isManualEntryRequired(currentStatus)) {
    return currentStatus;
  }

  const previousStatus = cleanedString(row.comparison?.previousRtplStatus);
  return previousStatus || currentStatus;
}

function normalizeFlexStatus(value: unknown): string {
  return cleanedString(value).replace(/\s+/g, " ").toLowerCase();
}

export function isRequestToCancelFlexStatus(value: unknown): boolean {
  return normalizeFlexStatus(value) === "request to cancel";
}

export function hasRequestToCancelFlexStatus(row: ReportRow): boolean {
  return (
    isRequestToCancelFlexStatus(row.output["Flex Status"]) ||
    isRequestToCancelFlexStatus(row.comparison?.previousFlexStatus)
  );
}

export function isTodayCallPlanVisibleRow(row: ReportRow): boolean {
  return (
    !row.carryForward.closedSyntheticRow &&
    !hasRequestToCancelFlexStatus(row)
  );
}

export function buildOverallWoOtcBreakdown(
  regionBreakdown: GeneratedReportResponse["regionBreakdown"],
): WoOtcBreakdownEntry[] {
  const counts = new Map<string, number>();

  for (const entry of regionBreakdown) {
    for (const wo of entry.woOtcCodeBreakdown ?? []) {
      counts.set(wo.code, (counts.get(wo.code) ?? 0) + wo.count);
    }
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function filterRowsByRegion(
  rows: readonly ReportRow[],
  regionFilter: string | null | undefined,
): ReportRow[] {
  if (!regionFilter || regionFilter === ALL_REGIONS_FILTER) {
    return [...rows];
  }

  return rows.filter((row) => row.output["Work Location"] === regionFilter);
}

export function buildRtplOperationalAnalytics(
  rows: readonly ReportRow[],
): RtplStatusMetric[] {
  return buildStatusAnalytics(rows, rtplStatusForAnalytics);
}

export function buildFlexOperationalAnalytics(
  rows: readonly ReportRow[],
): RtplStatusMetric[] {
  return buildStatusAnalytics(rows, (row) => row.output["Flex Status"]);
}

function buildStatusAnalytics(
  rows: readonly ReportRow[],
  getStatus: (row: ReportRow) => unknown,
): RtplStatusMetric[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const status = cleanedString(getStatus(row));

    if (!status) {
      continue;
    }

    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export function reportWithRows(
  report: GeneratedReportResponse,
  rows: readonly ReportRow[],
): GeneratedReportResponse {
  return {
    ...report,
    totalRows: rows.length,
    rows: [...rows],
  };
}
