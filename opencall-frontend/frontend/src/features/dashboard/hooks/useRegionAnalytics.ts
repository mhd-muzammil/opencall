// Derived region-analytics memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
import { useMemo } from "react";
import { buildOverallWoOtcBreakdown } from "../../../lib/reportDashboardAnalytics";
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import type { ReportRow } from "../types";
import { calculateRegionStats } from "../utils";

export function useRegionAnalytics(params: {
  activeRows: ReportRow[];
  report: GeneratedReportResponse | null;
}) {
  const { activeRows, report } = params;

  const activeRegionBreakdown = useMemo(() => {
    if (!report) return [];

    const regionMetadata = new Map(
      report.regionBreakdown.map((entry) => [
        entry.aspCode,
        {
          aspCode: entry.aspCode,
          regionName: entry.regionName,
          closedCount: entry.closedCount,
        },
      ]),
    );

    const rowsByRegion = new Map<string, GeneratedReportResponse["rows"][number][]>();
    for (const row of activeRows) {
      const aspCode = String(row.output["Work Location"] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      let list = rowsByRegion.get(aspCode);
      if (!list) {
        list = [];
        rowsByRegion.set(aspCode, list);
      }
      list.push(row);
    }

    return Array.from(rowsByRegion.entries())
      .map(([aspCode, rows]) => {
        const metadata = regionMetadata.get(aspCode);
        const stats = calculateRegionStats(rows);

        return {
          aspCode,
          regionName: metadata?.regionName ?? "Unknown Region",
          closedCount: metadata?.closedCount ?? 0,
          ...stats,
        };
      })
      .sort((a, b) => b.count - a.count || a.regionName.localeCompare(b.regionName));
  }, [activeRows, report]);

  const caseTypeRegionBreakdown = useMemo(() => {
    if (!report) return [];

    return activeRegionBreakdown.map((entry) => {
      return {
        aspCode: entry.aspCode,
        regionName: entry.regionName,
        ciss: entry.cissCount,
        pc: entry.pcCount,
        print: entry.printCount,
        printInstallation: entry.installCount,
        printFix: entry.printCount - entry.installCount,
        rca: entry.rcaCount,
        trade: entry.tradeCount,
        consumer: entry.consumerCount,
        commercial: entry.commercialCount,
        warranty: entry.warrantyCount,
        nonWarranty: entry.tradeCount,
      };
    });
  }, [activeRegionBreakdown, report]);

  const overallStats = useMemo(() => {
    return calculateRegionStats(activeRows);
  }, [activeRows]);

  const overallWoOtcBreakdown = useMemo(() => {
    if (!report) return [];
    return buildOverallWoOtcBreakdown(activeRegionBreakdown);
  }, [activeRegionBreakdown, report]);

  const overallClosedCount = useMemo(() => {
    if (!report) return 0;
    return report.regionBreakdown.reduce(
      (total, entry) => total + (entry.closedCount ?? 0),
      0,
    );
  }, [report]);

  const closedRegionBreakdown = useMemo(() => {
    if (!report) return [];

    return report.regionBreakdown
      .map((entry) => ({
        aspCode: entry.aspCode,
        regionName: entry.regionName,
        closedCount: entry.closedCount ?? 0,
        activeCount: entry.count,
      }))
      .filter((entry) => entry.closedCount > 0)
      .sort((a, b) => b.closedCount - a.closedCount);
  }, [report]);

  return {
    activeRegionBreakdown,
    caseTypeRegionBreakdown,
    overallStats,
    overallWoOtcBreakdown,
    overallClosedCount,
    closedRegionBreakdown,
  };
}
