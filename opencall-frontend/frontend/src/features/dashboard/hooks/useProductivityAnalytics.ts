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
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import { canonicalEngineerName } from "../engineerAliases";
import {
  addToProductivityCounts,
  classifyProductivityStatus,
  effectiveProductivityStatus,
  emptyProductivityBucketCounts,
  wasRowEnteredOnItsDay,
} from "../utils/engineerProductivity";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";

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
  } = params;

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

    const monthsList = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));
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

    // 3. Filter rows based on type. "Specific Date" is already day-scoped via
    // sourceReport above — the day's whole report IS the day's productivity, so
    // no Case-Created-Time filtering applies to it (an engineer's work today is
    // mostly on cases created days ago). Month and Range remain created-time
    // cohort filters.
    let filteredRowsForProd = regionRows;
    if (productivityFilterType === "Specific Month" && selectedProductivityValue) {
      filteredRowsForProd = regionRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const monthCode = match[2] ?? "";
            const year = match[3] ?? "";
            const monthIndex = parseInt(monthCode, 10) - 1;
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const rowMonth = `${monthNames[monthIndex]} ${year}`;
            return rowMonth === selectedProductivityValue;
          }
        }
        return false;
      });
    } else if (
      productivityFilterType === "Date Range" &&
      (productivityFromDate || productivityToDate)
    ) {
      // "Case Created Time" is DD-MM-YYYY (or DD/MM/YYYY); the date inputs are
      // YYYY-MM-DD. Include a row when its created date is within [from, to]
      // (each bound optional, both inclusive).
      const fromTs = productivityFromDate
        ? new Date(`${productivityFromDate}T00:00:00`).getTime()
        : null;
      const toTs = productivityToDate
        ? new Date(`${productivityToDate}T23:59:59`).getTime()
        : null;
      filteredRowsForProd = regionRows.filter((r) => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (!createdTime || createdTime === MANUAL_ENTRY_REQUIRED) return false;
        const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
        if (!match) return false;
        const rowTs = new Date(
          parseInt(match[3] ?? "0", 10),
          parseInt(match[2] ?? "1", 10) - 1,
          parseInt(match[1] ?? "1", 10),
        ).getTime();
        if (fromTs !== null && rowTs < fromTs) return false;
        if (toTs !== null && rowTs > toTs) return false;
        return true;
      });
    }

    // 4. Group by unique engineers. A row counts only when BOTH the engineer
    // and its effective status (Evening once filled, else Morning) are set;
    // either one blank and the call is ignored entirely. Each counted call
    // lands in exactly one bucket; assigned/attended are rolled up from them.
    //
    // Day views (Today / Specific Date) additionally require the row to have
    // been ENTERED on that day: engineer+status pairs merely carried forward
    // from the previous report (the "Carried" badge on the Records page) were
    // that previous day's work and already counted there.
    const isDayView =
      productivityFilterType === "Today" || productivityFilterType === "Specific Date";
    const engineerName = (r: typeof filteredRowsForProd[number]) =>
      canonicalEngineerName(String(r.output.Engineer ?? ""));

    interface EngineerAccumulator {
      casingCounts: Map<string, number>;
      regionCode: string;
      counts: ReturnType<typeof emptyProductivityBucketCounts>;
    }

    const engineersByKey = new Map<string, EngineerAccumulator>();
    for (const r of filteredRowsForProd) {
      // Resolve the raw Engineer value to its canonical name: apply manual
      // aliases ("Lava Kumar" -> "Lava") then group case-insensitively so pure
      // casing variants ("sriram"/"Sriram") merge too.
      const name = engineerName(r);
      if (!name || name === MANUAL_ENTRY_REQUIRED) continue;

      if (isDayView && !wasRowEnteredOnItsDay(r)) continue;

      const bucket = classifyProductivityStatus(effectiveProductivityStatus(r.output));
      if (!bucket) continue;

      const key = name.toLowerCase();
      let engineer = engineersByKey.get(key);
      if (!engineer) {
        engineer = {
          casingCounts: new Map(),
          regionCode: String(r.output["Work Location"] ?? "").trim(),
          counts: emptyProductivityBucketCounts(),
        };
        engineersByKey.set(key, engineer);
      }
      engineer.casingCounts.set(name, (engineer.casingCounts.get(name) ?? 0) + 1);

      const ticketId = String(r.output["Ticket ID"] ?? "").trim() || String(r.serialNo);
      addToProductivityCounts(engineer.counts, bucket, ticketId);
    }

    const list = Array.from(engineersByKey.values()).map((engineer) => {
      // Most frequent spelling wins; ties keep the first seen (Map is ordered).
      let engName = "";
      let bestCount = -1;
      for (const [casing, count] of engineer.casingCounts) {
        if (count > bestCount) {
          bestCount = count;
          engName = casing;
        }
      }

      const regionCode = engineer.regionCode;
      const regionName = ASP_CODE_REGION_MAP[regionCode as keyof typeof ASP_CODE_REGION_MAP] || regionCode || "N/A";

      return {
        name: engName,
        regionCode,
        regionName,
        assigned: engineer.counts.assigned,
        assignedTickets: engineer.counts.assignedTickets,
        attended: engineer.counts.attended,
        attendedTickets: engineer.counts.attendedTickets,
        closed: engineer.counts.closed,
        closedTickets: engineer.counts.closedTickets,
        partOrdered: engineer.counts.partOrdered,
        partOrderedTickets: engineer.counts.partOrderedTickets,
        underObservation: engineer.counts.underObservation,
        underObservationTickets: engineer.counts.underObservationTickets,
        cxReschedule: engineer.counts.cxReschedule,
        cxRescheduleTickets: engineer.counts.cxRescheduleTickets,
      };
    }).sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

    const totalAttended = list.reduce((sum, item) => sum + item.attended, 0);

    return { list, totalAttended, monthsList, datesList, todayStr };
  }, [
    report,
    selectedRegion,
    productivityFilterType,
    selectedProductivityValue,
    productivityFromDate,
    productivityToDate,
    productivityDayReport,
    historyReportDates,
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
    return "All Dates";
  }, [
    productivityFilterType,
    engineerProductivityMetrics.todayStr,
    selectedProductivityValue,
    productivityFromDate,
    productivityToDate,
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
  };
}
