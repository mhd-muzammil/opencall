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

    // 3. Filter rows based on type
    let filteredRowsForProd = regionRows;
    if (productivityFilterType === "Specific Date" && selectedProductivityValue) {
      filteredRowsForProd = regionRows.filter(r => {
        const createdTime = String(r.output["Case Created Time"] ?? "").trim();
        if (createdTime && createdTime !== MANUAL_ENTRY_REQUIRED) {
          const match = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(createdTime);
          if (match) {
            const rowDate = `${match[1]}-${match[2]}-${match[3]}`;
            return rowDate === selectedProductivityValue;
          }
        }
        return false;
      });
    } else if (productivityFilterType === "Specific Month" && selectedProductivityValue) {
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
    }

    // 4. Group by unique engineers
    const active = filteredRowsForProd.filter((r) => !r.carryForward.closedSyntheticRow);
    const closed = filteredRowsForProd.filter((r) => r.carryForward.closedSyntheticRow);

    const getUniqueEngineers = (items: typeof filteredRowsForProd) => {
      const list = items
        .map((r) => String(r.output.Engineer ?? "").trim())
        .filter((name) => name && name !== "Manual Entry Required");
      return Array.from(new Set(list));
    };

    const allEngNames = getUniqueEngineers(filteredRowsForProd);

    const list = allEngNames.map((engName) => {
      const engActive = active.filter(r => String(r.output.Engineer ?? "").trim() === engName);
      const engClosed = closed.filter(r => String(r.output.Engineer ?? "").trim() === engName);

      const firstRow = filteredRowsForProd.find(r => String(r.output.Engineer ?? "").trim() === engName);
      const regionCode = firstRow ? String(firstRow.output["Work Location"] ?? "").trim() : "";
      const regionName = ASP_CODE_REGION_MAP[regionCode as keyof typeof ASP_CODE_REGION_MAP] || regionCode || "N/A";

      const countStatus = (items: typeof engActive, keywords: string[]) => {
        return items.filter(r => {
          const s = String(r.output["RTPL status"] ?? "").trim().toLowerCase();
          return keywords.some(kw => s.includes(kw.toLowerCase()));
        }).length;
      };

      const closedCount = engClosed.length + countStatus(engActive, ["closed"]);
      const partOrderedCount = countStatus(engActive, ["part", "additional part", "part order pending"]);
      const underObservationCount = countStatus(engActive, ["observation", "crt pending", "ct validation"]);
      const cxRescheduleCount = countStatus(engActive, ["cx", "reschedule", "cust pending", "customer pending"]);

      const attendedCount = closedCount + partOrderedCount + underObservationCount;
      const assignedCount = attendedCount + cxRescheduleCount;

      return {
        name: engName,
        regionCode,
        regionName,
        assigned: assignedCount,
        attended: attendedCount,
        closed: closedCount,
        partOrdered: partOrderedCount,
        underObservation: underObservationCount,
        cxReschedule: cxRescheduleCount,
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
