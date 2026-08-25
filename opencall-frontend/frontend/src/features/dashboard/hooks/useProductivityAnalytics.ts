// Derived productivity/date-scope memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
//
// The tn/eodBod/productivity auto-select useEffect blocks remain in page.tsx and
// read the values this hook returns (e.g. regionDateMetadata, engineerProductivityMetrics).
// kpiBaseRows lives here (deferred from useKpiMetrics) because tnFilteredRows/
// eodBodFilteredRows derive from it.
import { useMemo } from "react";
import {
  hasRequestToCancelFlexStatus,
  isRecordsPageVisibleRow,
} from "../../../lib/reportDashboardAnalytics";
import type {
  GeneratedReportResponse,
  RegionEodStateResponse,
  RegionProductivityRangeEntry,
} from "../../../lib/apiClient";
import { aspCodesForRegionIdentity } from "@opencall/shared";
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import { todayIsoDate } from "../utils/dateUtils";
import {
  billCycleFor,
  billCycleForKey,
  billCyclesBetween,
  type BillCycle,
} from "../utils/billCycle";
import {
  computeEngineerProductivity,
  mergeEngineerProductivityResults,
} from "../utils/engineerProductivity";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Inclusive day bounds of a productivity view that spans more than one day. */
export interface ProductivityRangeBounds {
  from: string;
  to: string;
}

/**
 * The month dropdown's label ("July 2026") as the day range it means. A month IS
 * a range, so it goes through the same day-by-day path rather than having a
 * second, subtly different way of covering several days.
 */
function monthLabelToRange(label: string): ProductivityRangeBounds | null {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const index = MONTH_LABELS.findIndex(
    (name) => name.toLowerCase() === match[1]!.toLowerCase(),
  );
  if (index < 0) return null;
  const year = Number(match[2]);
  const month = String(index + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// "DD-MM-YYYY" (dropdown format) -> "YYYY-MM-DD" (report date format).
function dmyToIso(dmy: string): string {
  const parts = dmy.split("-");
  if (parts.length === 3 && parts[2] && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dmy;
}

export function useProductivityAnalytics(params: {
  report: GeneratedReportResponse | null;
  selectedRegion: string | null;
  selectedWoOtcCode: string | null;
  tnFilterType: string;
  selectedTnValue: string;
  eodBodFilterType: string;
  selectedEodBodValue: string;
  productivityFilterType: string;
  selectedProductivityValue: string;
  productivityFromDate?: string;
  productivityToDate?: string;
  /**
   * The selected day's final report when "Specific Date" targets a PAST day
   * (fetched from that day's history session). Null while loading, when the
   * selected day is the current report's day, or when no report exists for it.
   */
  productivityDayReport?: GeneratedReportResponse | null;
  /** Days that actually have a report (ISO dates) — drives the date dropdown. */
  historyReportDates?: readonly string[];
  /**
   * Per-region Final-EOD state for the day on display. A CLOSED region renders
   * from its frozen snapshot; the other regions stay live. Null while loading
   * or when no day-scoped view is active.
   */
  eodState?: RegionEodStateResponse | null;
  /**
   * Per-region productivity already summed day-by-day over the selected range,
   * fetched from the backend for "Date Range" and "Specific Month".
   *
   * Productivity is a day-scoped measure — assigned is that DAY's plan, attended
   * and closed are that DAY's outcomes — so a multi-day view cannot be derived
   * from the single report the browser holds. Null while loading, when the fetch
   * failed, or when the active filter covers one day.
   */
  productivityRangeRegions?: readonly RegionProductivityRangeEntry[] | null;
}) {
  const {
    report,
    selectedRegion,
    selectedWoOtcCode,
    tnFilterType,
    selectedTnValue,
    eodBodFilterType,
    selectedEodBodValue,
    productivityFilterType,
    selectedProductivityValue,
    productivityFromDate = "",
    productivityToDate = "",
    productivityDayReport = null,
    historyReportDates = [],
    eodState = null,
    productivityRangeRegions = null,
  } = params;

  /**
   * The day bounds the productivity view currently spans, or null when it is a
   * single day ("Today" / "Specific Date") or a range with no dates picked yet.
   * The caller fetches exactly these bounds, so what is fetched and what is
   * rendered can never be two different periods.
   */
  const productivityRangeBounds = useMemo((): ProductivityRangeBounds | null => {
    if (productivityFilterType === "Date Range") {
      if (!productivityFromDate || !productivityToDate) return null;
      return productivityFromDate <= productivityToDate
        ? { from: productivityFromDate, to: productivityToDate }
        : { from: productivityToDate, to: productivityFromDate };
    }
    if (productivityFilterType === "Specific Month" && selectedProductivityValue) {
      return monthLabelToRange(selectedProductivityValue);
    }
    if (productivityFilterType === "Bill Cycle" && selectedProductivityValue) {
      const cycle = billCycleForKey(selectedProductivityValue);
      return { from: cycle.fromIso, to: cycle.toIso };
    }
    return null;
  }, [
    productivityFilterType,
    productivityFromDate,
    productivityToDate,
    selectedProductivityValue,
  ]);

  /**
   * Bill cycles the productivity view can answer for, newest first: from the
   * cycle containing today back to the one containing the earliest day that has
   * a report. Offering a cycle with no reports behind it can only ever produce
   * an empty table.
   */
  const productivityBillCycles = useMemo((): BillCycle[] => {
    const today = todayIsoDate();
    const earliest = [...historyReportDates].sort()[0];
    return billCyclesBetween(earliest ?? today, today);
  }, [historyReportDates]);

  /** The cycle currently selected, for labelling. */
  const productivityBillCycle = useMemo(
    () =>
      productivityFilterType === "Bill Cycle" && selectedProductivityValue
        ? billCycleForKey(selectedProductivityValue)
        : null,
    [productivityFilterType, selectedProductivityValue],
  );

  const kpiBaseRows = useMemo(() => {
    if (!report) return [];
    const filtered = report.rows.filter((row) => {
      if (hasRequestToCancelFlexStatus(row)) return false;
      const rowRegion = String(row.output["Work Location"] ?? "").trim().toUpperCase();
      const targetRegion = String(selectedRegion ?? "").trim().toUpperCase();
      const matchRegion = selectedRegion === "ALL" || !selectedRegion || rowRegion === targetRegion;

      const rowCode = String(row.output["WO OTC CODE"] ?? "").trim().toUpperCase();
      const targetCode = String(selectedWoOtcCode ?? "").trim().toUpperCase();
      const matchCode = !selectedWoOtcCode || rowCode === targetCode;

      return matchRegion && matchCode;
    });

    const seen = new Set<string>();
    return filtered.filter((row) => {
      const ticketId = String(row.output["Ticket ID"] ?? "").trim();
      const key = (ticketId && ticketId !== MANUAL_ENTRY_REQUIRED) ? ticketId : String(row.serialNo);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [report, selectedRegion, selectedWoOtcCode]);

  const regionDateMetadata = useMemo(() => {
    if (!report) return { monthsList: [], datesList: [], todayStr: "" };

    const monthsSet = new Set<string>();
    const datesSet = new Set<string>();

    const getFormattedReportDate = (reportDateStr: string): string => {
      const parts = reportDateStr.split("-");
      if (parts.length === 3 && parts[0] && parts[1] && parts[2] && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return reportDateStr;
    };

    const todayStr = report.reportDate ? getFormattedReportDate(report.reportDate) : "";

    for (const r of kpiBaseRows) {
      const createdTime = String(r.output["Case Created Time"] ?? "").trim();
      if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
        const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
        if (match) {
          const day = match[1] ?? "";
          const monthCode = match[2] ?? "";
          const year = match[3] ?? "";

          const monthIndex = parseInt(monthCode, 10) - 1;
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const monthName = monthNames[monthIndex] ?? "Unknown";

          monthsSet.add(`${monthName} ${year}`);
          datesSet.add(`${day}-${monthCode}-${year}`);
        }
      }
    }

    const monthsList = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
    const datesList = Array.from(datesSet).sort((a, b) => {
      const parseDMY = (s: string) => {
        const p = s.split("-");
        const day = parseInt(p[0] ?? "0", 10);
        const month = parseInt(p[1] ?? "0", 10) - 1;
        const year = parseInt(p[2] ?? "0", 10);
        return new Date(year, month, day).getTime();
      };
      return parseDMY(a) - parseDMY(b);
    });

    return { monthsList, datesList, todayStr };
  }, [report, kpiBaseRows]);

  const tnFilteredRows = useMemo(() => {
    if (!report) return [];

    let rows = kpiBaseRows;

    if (tnFilterType === "Specific Date" && selectedTnValue) {
      rows = kpiBaseRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
            return rowDate === selectedTnValue;
          }
        }
        return false;
      });
    } else if (tnFilterType === "Specific Month" && selectedTnValue) {
      rows = kpiBaseRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const monthCode = match[2] ?? "";
            const year = match[3] ?? "";
            const monthIndex = parseInt(monthCode, 10) - 1;
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const rowMonth = `${monthNames[monthIndex]} ${year}`;
            return rowMonth === selectedTnValue;
          }
        }
        return false;
      });
    }

    return rows;
  }, [report, kpiBaseRows, tnFilterType, selectedTnValue, regionDateMetadata]);

  const tnDateLabel = useMemo(() => {
    if (tnFilterType === "Today") {
      return `Today (${regionDateMetadata.todayStr || ""})`;
    }
    if (tnFilterType === "Specific Date") {
      return selectedTnValue || "Specific Date";
    }
    if (tnFilterType === "Specific Month") {
      return selectedTnValue || "Specific Month";
    }
    return "All Dates";
  }, [tnFilterType, regionDateMetadata.todayStr, selectedTnValue]);

  const eodBodFilteredRows = useMemo(() => {
    if (!report) return [];

    let rows = kpiBaseRows;

    if (eodBodFilterType === "Specific Date" && selectedEodBodValue) {
      rows = kpiBaseRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
            return rowDate === selectedEodBodValue;
          }
        }
        return false;
      });
    } else if (eodBodFilterType === "Specific Month" && selectedEodBodValue) {
      rows = kpiBaseRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const monthCode = match[2] ?? "";
            const year = match[3] ?? "";
            const monthIndex = parseInt(monthCode, 10) - 1;
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const rowMonth = `${monthNames[monthIndex]} ${year}`;
            return rowMonth === selectedEodBodValue;
          }
        }
        return false;
      });
    }

    return rows;
  }, [report, kpiBaseRows, eodBodFilterType, selectedEodBodValue, regionDateMetadata]);

  const eodBodDateLabel = useMemo(() => {
    if (eodBodFilterType === "Today") {
      return `Today (${regionDateMetadata.todayStr || ""})`;
    }
    if (eodBodFilterType === "Specific Date") {
      return selectedEodBodValue || "Specific Date";
    }
    if (eodBodFilterType === "Specific Month") {
      return selectedEodBodValue || "Specific Month";
    }
    return "All Dates";
  }, [eodBodFilterType, regionDateMetadata.todayStr, selectedEodBodValue]);

  const engineerProductivityMetrics = useMemo(() => {
    if (!report) return { list: [], totalAttended: 0, monthsList: [], datesList: [], todayStr: "" };

    // "Specific Date" selects a DAY'S REPORT, not a case-created-time cohort:
    // the current report when its own day is picked, or the fetched final
    // report of a past day. While that fetch is in flight (or no report exists
    // for the day) there is no matching source and the table is empty.
    const selectedDayIso =
      productivityFilterType === "Specific Date" && selectedProductivityValue
        ? dmyToIso(selectedProductivityValue)
        : null;
    const sourceReport =
      selectedDayIso && productivityDayReport?.reportDate === selectedDayIso
        ? productivityDayReport
        : report;

    // 1. Productivity is a day-by-day view: it reads the same rows the Records
    // page shows for that day (open calls plus same-day closures; older
    // closures and Request-to-Cancel rows are out), then filters by
    // selectedRegion.
    let regionRows = sourceReport.rows.filter(isRecordsPageVisibleRow);
    if (selectedDayIso && sourceReport.reportDate !== selectedDayIso) {
      regionRows = [];
    }
    if (selectedRegion && selectedRegion !== "ALL") {
      regionRows = regionRows.filter(r => String(r.output["Work Location"] ?? "").trim().toUpperCase() === selectedRegion.trim().toUpperCase());
    }

    // 1b. Deduplicate rows by Ticket ID to prevent duplicate engineer productivity counts
    const seen = new Set<string>();
    regionRows = regionRows.filter((row) => {
      const ticketId = String(row.output["Ticket ID"] ?? "").trim();
      const key = (ticketId && ticketId !== MANUAL_ENTRY_REQUIRED) ? ticketId : String(row.serialNo);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 2. Identify all unique months and dates in these rows
    const monthsSet = new Set<string>();
    const datesSet = new Set<string>();

    const getFormattedReportDate = (reportDateStr: string): string => {
      const parts = reportDateStr.split("-");
      if (parts.length === 3 && parts[0] && parts[1] && parts[2] && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return reportDateStr;
    };

    const todayStr = report.reportDate ? getFormattedReportDate(report.reportDate) : "";

    for (const r of regionRows) {
      const createdTime = String(r.output["Case Created Time"] ?? "").trim();
      if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
        const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
        if (match) {
          const day = match[1] ?? "";
          const monthCode = match[2] ?? "";
          const year = match[3] ?? "";

          const monthIndex = parseInt(monthCode, 10) - 1;
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const monthName = monthNames[monthIndex] ?? "Unknown";

          monthsSet.add(`${monthName} ${year}`);
          datesSet.add(`${day}-${monthCode}-${year}`);
        }
      }
    }

    const parseDMY = (s: string) => {
      const p = s.split("-");
      const day = parseInt(p[0] ?? "0", 10);
      const month = parseInt(p[1] ?? "0", 10) - 1;
      const year = parseInt(p[2] ?? "0", 10);
      return new Date(year, month, day).getTime();
    };
    // The Specific Date dropdown lists days that actually HAVE a report
    // (day-by-day flow), not case-creation dates. Case-creation dates remain
    // the fallback when no history has loaded yet.
    const reportDays = Array.from(
      new Set(historyReportDates.map((iso) => getFormattedReportDate(iso)).filter(Boolean)),
    );
    const datesList = (reportDays.length > 0 ? reportDays : Array.from(datesSet)).sort(
      (a, b) => parseDMY(a) - parseDMY(b),
    );

    // The Specific Month dropdown lists months that actually HAVE reports, for
    // the same reason: a month now means "that month's working days summed", so
    // offering a month with no report can only produce an empty table. Sorted
    // chronologically — these labels do not sort alphabetically ("April" before
    // "February"). Case-creation months stay the fallback before history loads.
    const reportMonths = Array.from(
      new Set(
        reportDays
          .map((dmy) => {
            const parts = dmy.split("-");
            const monthIndex = parseInt(parts[1] ?? "0", 10) - 1;
            const label = MONTH_LABELS[monthIndex];
            return label ? `${label} ${parts[2]}` : "";
          })
          .filter(Boolean),
      ),
    );
    const monthsList = (
      reportMonths.length > 0 ? reportMonths : Array.from(monthsSet)
    ).sort((a, b) =>
      (monthLabelToRange(a)?.from ?? a).localeCompare(monthLabelToRange(b)?.from ?? b),
    );

    // 3. A multi-day view is the days ADDED UP, and only the backend can add
    // them: each day's productivity is computed from that day's own report, and
    // the browser holds exactly one. "Date Range" and "Specific Month" therefore
    // render the fetched range result and return here.
    //
    // They used to filter the CURRENT report's rows by Case Created Time, which
    // answered a different question — "today's productivity on the cases created
    // in that window" — so a month-long range showed a single day's work under a
    // month's label. Nothing about a range is derivable from these rows.
    if (productivityRangeBounds) {
      if (!productivityRangeRegions) {
        // Still loading, or the fetch failed. An empty table is honest; a day's
        // numbers wearing a month's label is not.
        return { list: [], totalAttended: 0, monthsList, datesList, todayStr };
      }
      const targetAspCode =
        selectedRegion && selectedRegion !== "ALL"
          ? selectedRegion.trim().toUpperCase()
          : null;
      const inScope = productivityRangeRegions.filter(
        (entry) =>
          !targetAspCode ||
          aspCodesForRegionIdentity(entry.regionCode, entry.regionName).has(
            targetAspCode,
          ),
      );
      const ranged = mergeEngineerProductivityResults(
        inScope.map((entry) => entry.productivity),
      );
      return {
        list: ranged.list,
        totalAttended: ranged.totalAttended,
        monthsList,
        datesList,
        todayStr,
      };
    }

    // "Specific Date" is already day-scoped via sourceReport above — the day's
    // whole report IS the day's productivity, so no Case-Created-Time filtering
    // applies to it (an engineer's work today is mostly on cases created days
    // ago).
    const filteredRowsForProd = regionRows;

    // 4. Compute per-engineer buckets via the shared day-scoped calculation —
    // the SAME function the backend Final-EOD freeze runs, so live and frozen
    // numbers can never diverge. Assigned = the day's plan (still-Scheduled
    // with an engineer + worked today); outcomes come from the Evening (today)
    // status or a same-day closure ONLY — the carried Morning status never
    // feeds an outcome, so stale carried statuses can't inflate Attended.
    //
    // Per-region Final EOD overlay: a CLOSED region renders from its frozen
    // snapshot and its live rows are excluded, so edits made after the close
    // no longer move that region's day. Other regions stay live. The overlay
    // only applies when the EOD state is for the day on display. Multi-day views
    // never reach here — they returned above with their own frozen/live mix
    // resolved per day by the backend.
    const overlayActive =
      !!eodState && eodState.workingDate === sourceReport.reportDate;

    const frozenRegions = overlayActive && eodState
      ? eodState.regions.filter(
          (region) => region.status === "CLOSED" && region.snapshot !== null,
        )
      : [];
    // Rows carry ASP work-location codes ("ASPS01511") while EOD entries carry
    // region codes ("HOS") — translate via the shared mapping, or the exclusion
    // never matches and a closed region is counted TWICE (frozen + live).
    const frozenAspCodes = new Set(
      frozenRegions.flatMap((region) => [
        ...aspCodesForRegionIdentity(region.regionCode, region.regionName),
      ]),
    );

    const liveRows = frozenAspCodes.size
      ? filteredRowsForProd.filter(
          (row) =>
            !frozenAspCodes.has(
              String(row.output["Work Location"] ?? "").trim().toUpperCase(),
            ),
        )
      : filteredRowsForProd;

    const liveResult = computeEngineerProductivity(liveRows);

    // Frozen snapshots respect the region filter the live rows already had.
    // The region dropdown sends an ASP work-location code ("ASPS01465"), while a
    // frozen region carries its region code ("SAL") and name ("SALEM") — compare
    // through the shared identity translation (the SAME one frozenAspCodes uses
    // just above), not a raw code-vs-code equality. Without it a specific-region
    // view silently drops its frozen snapshot and shows "no records" for any
    // Final-EOD-closed past day (e.g. yesterday), even though "All Regions" works.
    const targetAspCode =
      selectedRegion && selectedRegion !== "ALL"
        ? selectedRegion.trim().toUpperCase()
        : null;
    const snapshotResults = frozenRegions
      .filter(
        (region) =>
          !targetAspCode ||
          aspCodesForRegionIdentity(region.regionCode, region.regionName).has(
            targetAspCode,
          ),
      )
      .flatMap((region) => (region.snapshot ? [region.snapshot] : []));

    const { list, totalAttended } = mergeEngineerProductivityResults([
      liveResult,
      ...snapshotResults,
    ]);

    return { list, totalAttended, monthsList, datesList, todayStr };
  }, [
    report,
    selectedRegion,
    productivityFilterType,
    selectedProductivityValue,
    productivityRangeBounds,
    productivityRangeRegions,
    productivityDayReport,
    historyReportDates,
    eodState,
  ]);

  const productivityDateLabel = useMemo(() => {
    if (productivityFilterType === "Today") {
      return `Today (${engineerProductivityMetrics.todayStr || ""})`;
    }
    if (productivityFilterType === "Specific Date") {
      return selectedProductivityValue || "Specific Date";
    }
    if (productivityFilterType === "Specific Month") {
      return selectedProductivityValue || "Specific Month";
    }
    if (productivityFilterType === "Date Range") {
      if (productivityFromDate || productivityToDate) {
        return `${productivityFromDate || "…"} → ${productivityToDate || "…"}`;
      }
      return "Date Range";
    }
    if (productivityFilterType === "Bill Cycle") {
      return productivityBillCycle
        ? `${productivityBillCycle.monthLabel} bill cycle (${productivityBillCycle.label})`
        : "Bill Cycle";
    }
    return "All Dates";
  }, [
    productivityFilterType,
    engineerProductivityMetrics.todayStr,
    selectedProductivityValue,
    productivityFromDate,
    productivityToDate,
    productivityBillCycle,
  ]);

  return {
    kpiBaseRows,
    regionDateMetadata,
    tnFilteredRows,
    tnDateLabel,
    eodBodFilteredRows,
    eodBodDateLabel,
    engineerProductivityMetrics,
    productivityDateLabel,
    productivityRangeBounds,
    productivityBillCycles,
    productivityBillCycle,
  };
}
