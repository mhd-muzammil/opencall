// Derived KPI-metric memos extracted from app/page.tsx (Phase 5).
// Trade Open Calls now uses the shared Segment-based isTradeCase (single source of
// truth) instead of an inlined WO-OTC check.
//
// NOTE: kpiBaseRows is NOT in this hook. regionKpiMetrics/chennaiKpiMetrics depend
// on tnFilteredRows/eodBodFilteredRows (which belong to useProductivityAnalytics and
// derive from kpiBaseRows), so this hook receives those as inputs and is called after
// them. kpiBaseRows is extracted with useProductivityAnalytics (hook 6).
import { useMemo } from "react";
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import type { ReportRow } from "../types";
import {
  isWarrantyCase,
  isPrintCase,
  isTradeCase,
  countManualRequiredCells,
  isPlannedStatusValue,
  isOnsiteStatusValue,
  isCaseClosedStatusValue,
} from "../utils";

export function useKpiMetrics(params: {
  report: GeneratedReportResponse | null;
  selectedRegion: string | null;
  tnFilteredRows: ReportRow[];
  tnViewMode: "BOD" | "EOD";
  eodBodFilteredRows: ReportRow[];
  eodBodViewMode: "BOD" | "EOD";
}) {
  const {
    report,
    selectedRegion,
    tnFilteredRows,
    tnViewMode,
    eodBodFilteredRows,
    eodBodViewMode,
  } = params;

  const activeRegionName = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return "";
    const entry = report.regionBreakdown.find((r) => r.aspCode === selectedRegion);
    return entry?.regionName ?? selectedRegion;
  }, [report, selectedRegion]);

  const regionKpiMetrics = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return null;

    const rows = tnFilteredRows;
    const isBod = tnViewMode === "BOD";
    const active = isBod
      ? rows.filter((r) => r.comparison?.changeType !== "NEW" && isWarrantyCase(r))
      : rows.filter((r) => !r.carryForward.closedSyntheticRow && isWarrantyCase(r));
    const closed = isBod ? [] : rows.filter((r) => r.carryForward.closedSyntheticRow && isWarrantyCase(r));

    const getUniqueEngineers = (items: typeof rows) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };
    const uniqueEngineers = getUniqueEngineers(active);
    const engineerCount = uniqueEngineers.length;

    const getRowStatus = (r: typeof rows[number]): string => {
      return (isBod
        ? String(r.comparison?.previousRtplStatus || r.output["RTPL status"] || "")
        : String(r.output["RTPL status"] || "")
      ).trim();
    };

    const matchStatus = (
      r: typeof rows[number],
      keywords: string[],
      excludes: string[] = []
    ): boolean => {
      const s = getRowStatus(r).toLowerCase();
      if (!s || s === "manual entry required") return false;
      const matchesKeyword = keywords.some(kw => s.includes(kw.toLowerCase()));
      const matchesExclude = excludes.some(ex => s.includes(ex.toLowerCase()));
      return matchesKeyword && !matchesExclude;
    };

    const actionable = active.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"])).length;
    // Planned = Scheduled + Engineer Assigned (exact); onsite is its own bucket.
    const planned = active.filter(r => isPlannedStatusValue(getRowStatus(r))).length;
    const enggOnsite = active.filter(r => isOnsiteStatusValue(getRowStatus(r))).length;
    // Attended = a planned (Morning Scheduled/Engg Assigned) case whose Evening
    // status exists and has moved past the planning stage. Cross-column by
    // nature, so it reads Morning/Evening directly regardless of view mode.
    const attended = active.filter((r) => {
      const morning = String(r.output["RTPL status"] ?? "").trim();
      const evening = String(r.output["Evening status"] ?? "").trim();
      return (
        isPlannedStatusValue(morning) &&
        evening !== "" &&
        evening.toLowerCase() !== "manual entry required" &&
        !isPlannedStatusValue(evening)
      );
    }).length;
    const toBeSchedule = active.filter(r => matchStatus(r, ["to be scheduled", "assignment pending", "non avl", "missed to schedule"])).length;
    const cxReschedule = active.filter(r => matchStatus(r, ["cx pending", "reschedule", "cx", "cust delay", "customer delay", "customer pending"])).length;
    const sscPending = active.filter(r => matchStatus(r, ["ssc pending", "ssc"])).length;
    const elevateTech = active.filter(r => matchStatus(r, ["elevation HP Pending", "elevation Part Pending", "elevation - HP Pending", "elevation - Partner Pending", "elevate"])).length;
    const underObservation = active.filter(r => matchStatus(r, ["CRT Pending", "CT Validation Pending", "observation", "under observation", "crt"])).length;
    const toBeYank = active.filter(r => matchStatus(r, ["Need to Yank", "Yank"])).length;
    const addPartOrdered = active.filter(r => matchStatus(r, ["Additional Part", "Part Order Pending", "Parts Hold", "Part need to order"])).length;
    const toBeCancel = active.filter(r => matchStatus(r, ["Need to Cancel", "Need to Cancel Mail", "Request to Cancel"])).length;
    const newCalls = active.filter((r) => r.comparison?.changeType === "NEW").length;
    const tradeOpenCalls = isBod
      ? rows.filter((r) => r.comparison?.changeType !== "NEW" && isTradeCase(r)).length
      : rows.filter((r) => !r.carryForward.closedSyntheticRow && isTradeCase(r)).length;

    const closedCancelled = closed.filter((r) => matchStatus(r, ["cancel"])).length;

    // Closed Calls = an explicit "Case-Closed" / "WO Closed" status, plus rows
    // that closed by vanishing from the day's Flex file — MINUS the vanished
    // cancellations, which belong to "Closed cancelled" and nowhere else.
    //
    // This used to add `closed.length` wholesale, so every cancelled row was
    // counted in BOTH lines. The Excel export (buildRegionSummaryWorkbook) has
    // always subtracted them; the on-screen tile just never got the same fix,
    // which is why the two disagreed. A cancellation is not a completed close.
    const caseClosed =
      active.filter((r) => isCaseClosedStatusValue(getRowStatus(r))).length +
      closed.filter((r) => !matchStatus(r, ["cancel"])).length;

    return {
      engineerCount,
      enggPresents: engineerCount,
      openCalls: active.length,
      actionable,
      planned,
      attended,
      closedCalls: caseClosed,
      enggOnsite,
      toBeSchedule,
      cxReschedule,
      sscPending,
      elevateTech,
      underObservation,
      toBeYank,
      closedCancelled,
      addPartOrdered,
      toBeCancel,
      newCalls,
      tradeOpenCalls,
    };
  }, [report, selectedRegion, tnFilteredRows, tnViewMode]);

  const chennaiKpiMetrics = useMemo(() => {
    if (!report || !selectedRegion || selectedRegion === "ALL") return null;

    const rows = eodBodFilteredRows;
    const isBod = eodBodViewMode === "BOD";
    const active = isBod
      ? rows.filter((r) => r.comparison?.changeType !== "NEW" && isWarrantyCase(r))
      : rows.filter((r) => !r.carryForward.closedSyntheticRow && isWarrantyCase(r));
    const closed = isBod ? [] : rows.filter((r) => r.carryForward.closedSyntheticRow && isWarrantyCase(r));

    const getUniqueEngineers = (items: typeof rows) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };
    const uniqueEngineers = getUniqueEngineers(active);
    const enggCount = uniqueEngineers.length;

    const getWipAging = (r: typeof rows[number]) => {
      if (isBod) {
        return String(r.comparison?.previousWipAging || r.output["WIP aging"] || "").trim();
      }
      return String(r.output["WIP aging"] || "").trim();
    };

    const parseWipAgingValue = (value: unknown): number | null => {
      const parsed = Number(String(value ?? "").trim());
      return Number.isFinite(parsed) ? parsed : null;
    };

    const getRowStatus = (r: typeof rows[number]): string => {
      return (isBod
        ? String(r.comparison?.previousRtplStatus || r.output["RTPL status"] || "")
        : String(r.output["RTPL status"] || "")
      ).trim();
    };

    const matchStatus = (
      r: typeof rows[number],
      keywords: string[],
      excludes: string[] = []
    ): boolean => {
      const s = getRowStatus(r).toLowerCase();
      if (!s || s === "manual entry required") return false;
      const matchesKeyword = keywords.some(kw => s.includes(kw.toLowerCase()));
      const matchesExclude = excludes.some(ex => s.includes(ex.toLowerCase()));
      return matchesKeyword && !matchesExclude;
    };

    // Calculations:
    const openCalls = active.length;
    const actionable = active.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"])).length;
    const planned = active.filter(r => matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"])).length;
    const callAllocation = enggCount > 0 ? (planned / enggCount).toFixed(1) : "0.0";

    const printOpenGe2 = active.filter(r => isPrintCase(r) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;
    const printActionableGe2 = active.filter(r => isPrintCase(r) && matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;
    const printScheduledGe2 = active.filter(r => isPrintCase(r) && matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;

    const openCallsGt10 = active.filter(r => (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;
    const actionableGt10 = active.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;
    const scheduledGt10 = active.filter(r => matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;

    const mpsGt1 = active.filter(r => matchStatus(r, ["mps"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 1).length;
    const eodCloser = closed.length;
    const newCalls = active.filter(r => r.comparison?.changeType === "NEW").length;

    const csoDaysInventory = eodCloser > 0 ? (openCalls / eodCloser).toFixed(1) : "#DIV/0!";
    const engAvlInField = enggCount;
    const enggProductivity = enggCount > 0 ? (eodCloser / enggCount).toFixed(1) : "0.0";

    const missedToSchedule = active.filter(r => matchStatus(r, ["non avl", "missed to schedule", "to be scheduled", "assignment pending"])).length;
    const missedByEng = active.filter(r => matchStatus(r, ["high call", "missed by eng"])).length;
    const gTotalMissed = missedToSchedule + missedByEng;
    const pctMissed = openCalls > 0 ? Math.round((gTotalMissed / openCalls) * 100) : 0;
    const closureAdherence = (eodCloser + gTotalMissed) > 0 ? Math.round((eodCloser / (eodCloser + gTotalMissed)) * 100) : 0;

    // NAF right table columns
    const flexBackend = active.filter(r => matchStatus(r, ["flex backend", "backend"], ["hp backend"])).length;
    const ssc = active.filter(r => matchStatus(r, ["ssc"])).length;
    const hpBackend = active.filter(r => matchStatus(r, ["hp backend"])).length;
    const obsCustomer = active.filter(r => matchStatus(r, ["obs", "observation", "customer"], ["pending", "delay"])).length;
    const cuPending = active.filter(r => matchStatus(r, ["cu pending", "cust pending", "customer pending", "cust delay", "customer delay"])).length;
    const physicalClosed = active.filter(r => matchStatus(r, ["physical closed", "physically closed", "partner complete", "wo closed"], ["error"])).length;

    const totalNaf = flexBackend + ssc + hpBackend + obsCustomer + cuPending + physicalClosed;
    const sscPct = totalNaf > 0 ? Math.round((ssc / totalNaf) * 100) : 0;

    return {
      openCalls,
      actionable,
      planned,
      callAllocation,
      printOpenGe2,
      printActionableGe2,
      printScheduledGe2,
      openCallsGt10,
      actionableGt10,
      scheduledGt10,
      mpsGt1,
      eodCloser,
      newCalls,
      csoDaysInventory,
      enggCount,
      engAvlInField,
      enggProductivity,
      missedToSchedule,
      missedByEng,
      gTotalMissed,
      pctMissed,
      closureAdherence,

      // Right Table NAF
      flexBackend,
      ssc,
      hpBackend,
      obsCustomer,
      cuPending,
      physicalClosed,
      totalNaf,
      sscPct,
    };
  }, [report, selectedRegion, eodBodFilteredRows, eodBodViewMode]);

  const incompleteCellCount = useMemo(() => {
    return report ? countManualRequiredCells(report.rows) : 0;
  }, [report]);

  return {
    activeRegionName,
    regionKpiMetrics,
    chennaiKpiMetrics,
    incompleteCellCount,
  };
}
