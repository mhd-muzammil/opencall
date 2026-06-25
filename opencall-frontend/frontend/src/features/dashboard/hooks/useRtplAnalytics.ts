// Derived RTPL analytics memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
import { useMemo } from "react";
import {
  ALL_REGIONS_FILTER,
  filterRowsByRegion,
  buildFlexOperationalAnalytics,
  buildRtplTimeCards,
  type RtplTimeCardId,
} from "../../../lib/reportDashboardAnalytics";
import type { GeneratedReportResponse, RtplStatusChange } from "../../../lib/apiClient";
import type { ReportRow, RtplCaseScope } from "../types";
import { RTPL_CASE_SCOPE_OPTIONS } from "../constants";
import { isWarrantyCase, isTradeCase } from "../utils";

export function useRtplAnalytics(params: {
  activeRows: ReportRow[];
  selectedRtplCaseScope: RtplCaseScope;
  selectedRtplRegion: string;
  activeRegionBreakdown: Array<{ aspCode: string; regionName: string }>;
  report: GeneratedReportResponse | null;
  rtplStatusChanges: RtplStatusChange[];
  selectedRtplTimeCardId: RtplTimeCardId;
  bodFixedTime: string | null;
}) {
  const {
    activeRows,
    selectedRtplCaseScope,
    selectedRtplRegion,
    activeRegionBreakdown,
    report,
    rtplStatusChanges,
    selectedRtplTimeCardId,
    bodFixedTime,
  } = params;

  const rtplRowsForSelectedScope = useMemo(() => {
    switch (selectedRtplCaseScope) {
      case "warranty":
        return activeRows.filter(isWarrantyCase);
      case "trade":
        return activeRows.filter(isTradeCase);
      case "overall":
      default:
        return activeRows;
    }
  }, [activeRows, selectedRtplCaseScope]);

  const rtplRowsForSelectedRegion = useMemo(
    () => filterRowsByRegion(activeRows, selectedRtplRegion),
    [activeRows, selectedRtplRegion],
  );

  const rtplCaseScopeOptions = useMemo(
    () =>
      RTPL_CASE_SCOPE_OPTIONS.map((option) => {
        const count =
          option.value === "warranty"
            ? rtplRowsForSelectedRegion.filter(isWarrantyCase).length
            : option.value === "trade"
              ? rtplRowsForSelectedRegion.filter(isTradeCase).length
              : rtplRowsForSelectedRegion.length;

        return { ...option, count };
      }),
    [rtplRowsForSelectedRegion],
  );

  const rtplRegionOptions = useMemo(() => {
    if (!report) return [];

    return [
      { value: ALL_REGIONS_FILTER, label: "All", count: rtplRowsForSelectedScope.length },
      ...activeRegionBreakdown.map((entry) => {
        const scopedCount = rtplRowsForSelectedScope.filter(
          (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === entry.aspCode.toUpperCase(),
        ).length;

        return {
          value: entry.aspCode,
          label: entry.regionName,
          count: scopedCount,
        };
      }),
    ];
  }, [activeRegionBreakdown, report, rtplRowsForSelectedScope]);

  const rtplAnalyticsRows = useMemo(() => {
    if (!report) return [];
    return filterRowsByRegion(rtplRowsForSelectedScope, selectedRtplRegion);
  }, [report, rtplRowsForSelectedScope, selectedRtplRegion]);

  const flexStatusMetrics = useMemo(
    () => buildFlexOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  const visibleRtplStatusChanges = useMemo(() => {
    const scopedTicketIds = new Set(
      rtplAnalyticsRows
        .map((row) => String(row.output["Ticket ID"] ?? "").trim())
        .filter(Boolean),
    );

    return rtplStatusChanges.filter((change) => {
      const matchesRegion =
        selectedRtplRegion === ALL_REGIONS_FILTER ||
        change.workLocation?.trim().toUpperCase() === selectedRtplRegion;
      const matchesScope =
        selectedRtplCaseScope === "overall" ||
        scopedTicketIds.has(change.ticketId.trim());

      const isAfterBodFix =
        !bodFixedTime ||
        (change.changedAt &&
          new Date(change.changedAt).getTime() > new Date(bodFixedTime).getTime());

      return matchesRegion && matchesScope && isAfterBodFix;
    });
  }, [rtplAnalyticsRows, rtplStatusChanges, selectedRtplCaseScope, selectedRtplRegion, bodFixedTime]);

  const rtplTimeCards = useMemo(
    () => buildRtplTimeCards(rtplAnalyticsRows, visibleRtplStatusChanges),
    [rtplAnalyticsRows, visibleRtplStatusChanges],
  );

  const selectedRtplTimeCard = useMemo(
    () =>
      rtplTimeCards.find((card) => card.id === selectedRtplTimeCardId) ??
      rtplTimeCards[0] ??
      null,
    [rtplTimeCards, selectedRtplTimeCardId],
  );

  return {
    rtplRowsForSelectedScope,
    rtplRowsForSelectedRegion,
    rtplCaseScopeOptions,
    rtplRegionOptions,
    rtplAnalyticsRows,
    flexStatusMetrics,
    visibleRtplStatusChanges,
    rtplTimeCards,
    selectedRtplTimeCard,
  };
}
