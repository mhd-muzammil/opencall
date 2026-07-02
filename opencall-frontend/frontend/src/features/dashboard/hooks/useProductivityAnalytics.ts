// Derived productivity/date-scope memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
//
// The tn/eodBod/productivity auto-select useEffect blocks remain in page.tsx and
// read the values this hook returns (e.g. regionDateMetadata, engineerProductivityMetrics).
// kpiBaseRows lives here (deferred from useKpiMetrics) because tnFilteredRows/
// eodBodFilteredRows derive from it.
import { useMemo } from "react";
import { hasRequestToCancelFlexStatus } from "../../../lib/reportDashboardAnalytics";
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";

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

    // 1. Filter rows by selectedRegion
    let regionRows = report.rows;
    if (selectedRegion && selectedRegion !== "ALL") {
      regionRows = report.rows.filter(r => String(r.output["Work Location"] ?? "").trim().toUpperCase() === selectedRegion.trim().toUpperCase());
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

    // 2. This report is a single day's snapshot keyed to its report date, so
    // the date/month pickers offer only that report's own date and month.
    // Selecting either shows the whole report — there is no other day in it.
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const getFormattedReportDate = (reportDateStr: string): string => {
      const parts = reportDateStr.split("-");
      if (parts.length === 3 && parts[0] && parts[1] && parts[2] && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return reportDateStr;
    };

    const todayStr = report.reportDate ? getFormattedReportDate(report.reportDate) : "";

    const reportMonth = (() => {
      const parts = todayStr.split("-");
      const monthCode = parts[1] ?? "";
      const year = parts[2] ?? "";
      const monthIndex = parseInt(monthCode, 10) - 1;
      const monthName = monthNames[monthIndex];
      return monthName && year ? `${monthName} ${year}` : "";
    })();

    const datesList = todayStr ? [todayStr] : [];
    const monthsList = reportMonth ? [reportMonth] : [];

    // 3. Filter rows based on type. The whole report belongs to the report's
    // day, so "Today"/"All Dates" show everything; "Specific Date" shows the
    // full report when the picked date is the report's date (otherwise nothing),
    // and "Specific Month" the same for the report's month. This keeps
    // "Today" and "Specific Date = <report date>" consistent.
    let filteredRowsForProd = regionRows;
    if (productivityFilterType === "Specific Date") {
      filteredRowsForProd = selectedProductivityValue === todayStr ? regionRows : [];
    } else if (productivityFilterType === "Specific Month") {
      filteredRowsForProd = selectedProductivityValue === reportMonth ? regionRows : [];
    }

    // 4. Group by unique engineers
    const active = filteredRowsForProd.filter((r) => !r.carryForward.closedSyntheticRow);
    const closed = filteredRowsForProd.filter((r) => r.carryForward.closedSyntheticRow);

    const engineerName = (r: typeof filteredRowsForProd[number]) =>
      String(r.output.Engineer ?? "").trim();

    // Group engineers case-insensitively so different casings of the same name
    // (e.g. "sriram" and "Sriram") collapse into one row. Each key tracks how
    // often every original spelling appears so the most common one is shown.
    const casingCountsByKey = new Map<string, Map<string, number>>();
    for (const r of filteredRowsForProd) {
      const name = engineerName(r);
      if (!name || name === "Manual Entry Required") continue;
      const key = name.toLowerCase();
      let casingCounts = casingCountsByKey.get(key);
      if (!casingCounts) {
        casingCounts = new Map();
        casingCountsByKey.set(key, casingCounts);
      }
      casingCounts.set(name, (casingCounts.get(name) ?? 0) + 1);
    }

    const list = Array.from(casingCountsByKey.entries()).map(([engKey, casingCounts]) => {
      // Most frequent spelling wins; ties keep the first seen (Map is ordered).
      let engName = "";
      let bestCount = -1;
      for (const [casing, count] of casingCounts) {
        if (count > bestCount) {
          bestCount = count;
          engName = casing;
        }
      }

      const engActive = active.filter(r => engineerName(r).toLowerCase() === engKey);
      const engClosed = closed.filter(r => engineerName(r).toLowerCase() === engKey);

      const firstRow = filteredRowsForProd.find(r => engineerName(r).toLowerCase() === engKey);
      const regionCode = firstRow ? String(firstRow.output["Work Location"] ?? "").trim() : "";
      const regionName = ASP_CODE_REGION_MAP[regionCode as keyof typeof ASP_CODE_REGION_MAP] || regionCode || "N/A";

      const matchStatus = (items: typeof engActive, keywords: string[]) => {
        return items.filter(r => {
          const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
          return keywords.some(kw => s.includes(kw.toLowerCase()));
        });
      };

      // Ticket IDs behind each count, so the dashboard cells can drill into the
      // records table showing exactly those cases. Empty/placeholder ids are
      // dropped so they never create a filter that matches nothing.
      const ticketsOf = (rows: typeof engActive) =>
        rows
          .map(r => String(r.output["Ticket ID"] ?? "").trim())
          .filter(id => id && id !== MANUAL_ENTRY_REQUIRED);

      // Closed calls are a standalone "completed" credit — they are NOT folded
      // into Attended/Assigned, so those reflect only still-open workload.
      const closedRows = [...engClosed, ...matchStatus(engActive, ["closed"])];
      const partOrderedRows = matchStatus(engActive, ["part", "additional part", "part order pending"]);
      const underObservationRows = matchStatus(engActive, ["observation", "crt pending", "ct validation"]);
      const cxRescheduleRows = matchStatus(engActive, ["cx", "reschedule", "cust pending", "customer pending"]);

      // Attended = open work the engineer has progressed (excludes CX reschedule,
      // which is customer-side). Assigned = full open workload (adds CX).
      const attendedRows = [...partOrderedRows, ...underObservationRows];
      const assignedRows = [...attendedRows, ...cxRescheduleRows];

      return {
        name: engName,
        regionCode,
        regionName,
        // Every ticket for this engineer (active + closed), so clicking the
        // name drills in case-insensitively rather than by exact-case name.
        allTickets: ticketsOf([...engActive, ...engClosed]),
        assigned: assignedRows.length,
        assignedTickets: ticketsOf(assignedRows),
        attended: attendedRows.length,
        attendedTickets: ticketsOf(attendedRows),
        closed: closedRows.length,
        closedTickets: ticketsOf(closedRows),
        partOrdered: partOrderedRows.length,
        partOrderedTickets: ticketsOf(partOrderedRows),
        underObservation: underObservationRows.length,
        underObservationTickets: ticketsOf(underObservationRows),
        cxReschedule: cxRescheduleRows.length,
        cxRescheduleTickets: ticketsOf(cxRescheduleRows),
      };
    }).sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

    const totalAttended = list.reduce((sum, item) => sum + item.attended, 0);

    return { list, totalAttended, monthsList, datesList, todayStr };
  }, [report, selectedRegion, productivityFilterType, selectedProductivityValue]);

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
    return "All Dates";
  }, [productivityFilterType, engineerProductivityMetrics.todayStr, selectedProductivityValue]);

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
