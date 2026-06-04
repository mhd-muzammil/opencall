import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import type { GeneratedReportResponse } from "./apiClient";
import {
  hasRequestToCancelFlexStatus,
  isTodayCallPlanVisibleRow,
} from "./reportDashboardAnalytics";
import * as XLSX from "xlsx";

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";

const MANUAL_FIELD_LABELS: Record<string, string> = {
  rtpl_status: "RTPL status",
  segment: "Segment",
  engineer: "Engineer",
  location: "Location",
  customer_mail: "Customer Mail",
  rca: "RCA",
};

export const EXPORT_METADATA_COLUMNS = [
  "Change Type",
  "Change Summary",
  "Carry Forward Status",
  "Carried Forward Fields",
  "Manual Fields Completed",
  "Manual Fields Missing",
  "Manual Entry Required Fields",
  "Closed Synthetic Row",
] as const;

export const STANDARD_EXPORT_COLUMNS = [...DAILY_CALL_PLAN_COLUMNS] as const;

type ExportCellValue = string | number | boolean;

function formatFieldList(fields: readonly string[]): string {
  return fields
    .map((field) => MANUAL_FIELD_LABELS[field] ?? field)
    .join("; ");
}

function exportChangeType(
  row: GeneratedReportResponse["rows"][number],
): string {
  return row.comparison?.changeType ?? row.carryForward.changeType ?? "";
}

function exportCarryForwardStatus(
  row: GeneratedReportResponse["rows"][number],
): string {
  if (row.carryForward.closedSyntheticRow) {
    return "CLOSED";
  }

  if (row.carryForward.carriedForwardFields.length > 0) {
    return "CARRIED";
  }

  if (row.carryForward.changeType === "NEW_WORK_ORDER") {
    return "NEW_WORK_ORDER";
  }

  if (row.carryForward.manualFieldsMissing.length > 0) {
    return "MANUAL_ENTRY_REQUIRED";
  }

  return row.carryForward.manualFieldsCompleted ? "COMPLETE" : "";
}

function manualEntryRequiredColumns(
  row: GeneratedReportResponse["rows"][number],
): string {
  const columns = DAILY_CALL_PLAN_COLUMNS.filter(
    (column) => row.output[column] === MANUAL_ENTRY_REQUIRED,
  );

  return columns.join("; ");
}

export function mapRowToStandardExport(
  row: GeneratedReportResponse["rows"][number],
): ExportCellValue[] {
  return STANDARD_EXPORT_COLUMNS.map((col) => {
    const value = row.output[col];

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }

    if (!row.carryForward.closedSyntheticRow) {
      return "";
    }

    if (col === "S.no") {
      return row.serialNo;
    }

    if (col === "Flex Status") {
      return row.comparison?.previousFlexStatus ?? "CLOSED";
    }

    if (col === "RTPL status") {
      return row.comparison?.previousRtplStatus ?? "CLOSED";
    }

    if (col === "WIP aging") {
      return row.comparison?.previousWipAging ?? "";
    }

    return "";
  });
}

export function buildReportExportMatrix(
  report: GeneratedReportResponse,
): ExportCellValue[][] {
  const headers = [...STANDARD_EXPORT_COLUMNS];
  const data: ExportCellValue[][] = [headers];

  for (const row of report.rows.filter((item) => !hasRequestToCancelFlexStatus(item))) {
    data.push(mapRowToStandardExport(row));
  }

  return data;
}

function buildReportExportMatrixForRows(
  rows: readonly GeneratedReportResponse["rows"][number][],
): ExportCellValue[][] {
  return [
    [...STANDARD_EXPORT_COLUMNS],
    ...rows.map(mapRowToStandardExport),
  ];
}

export function buildWorkbookExportMatrices(report: GeneratedReportResponse): {
  todayCallPlan: ExportCellValue[][];
  closure: ExportCellValue[][];
} {
  const activeRows = report.rows.filter(isTodayCallPlanVisibleRow);
  const closedRows = report.rows.filter(
    (row) =>
      row.carryForward.closedSyntheticRow &&
      !hasRequestToCancelFlexStatus(row),
  );

  return {
    todayCallPlan: buildReportExportMatrixForRows(activeRows),
    closure: buildReportExportMatrixForRows(closedRows),
  };
}

export function downloadReportAsExcel(report: GeneratedReportResponse): void {
  const data = buildReportExportMatrix(report);
  const escapeCSV = (
    value: string | number | boolean | null | undefined,
  ): string => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];
  for (const row of data) {
    csvRows.push(row.map(escapeCSV).join(","));
  }

  const csvContent = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const date = report.reportDate || new Date().toISOString().split("T")[0];
  link.download = `Daily_Call_Plan_${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadReportAsXlsx(report: GeneratedReportResponse): void {
  const { todayCallPlan, closure } = buildWorkbookExportMatrices(report);
  const headers = todayCallPlan[0] ?? [];

  const wb = XLSX.utils.book_new();
  const todayCallPlanSheet = XLSX.utils.aoa_to_sheet(todayCallPlan);
  const closureSheet = XLSX.utils.aoa_to_sheet(closure);

  // Auto-size columns slightly
  todayCallPlanSheet["!cols"] = headers.map(() => ({ wch: 20 }));
  closureSheet["!cols"] = headers.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, todayCallPlanSheet, "Today Call Plan");
  XLSX.utils.book_append_sheet(wb, closureSheet, "closure");

  const date = report.reportDate || new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Daily_Call_Plan_${date}.xlsx`);
}

export function downloadRegionSummaryExcel(
  regionName: string,
  reportDate: string,
  rows: readonly GeneratedReportResponse["rows"][number][],
  isChennaiStyle?: boolean,
  isBod?: boolean,
): void {
  const isChennai = isChennaiStyle !== undefined ? isChennaiStyle : regionName.toLowerCase().includes("chennai");

  const formatDisplayDateOnly = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    const day = date.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    
    let suffix = "th";
    if (day === 1 || day === 21 || day === 31) suffix = "st";
    else if (day === 2 || day === 22) suffix = "nd";
    else if (day === 3 || day === 23) suffix = "rd";
    
    return `${day}${suffix} ${month}`;
  };

  const getDayOfWeek = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "Wednesday";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()] ?? "Wednesday";
  };

  const getWipAging = (r: GeneratedReportResponse["rows"][number]): string => {
    if (isBod) {
      return String(r.comparison?.previousWipAging || r.output["WIP aging"] || "").trim();
    }
    return String(r.output["WIP aging"] || "").trim();
  };

  // 1. Calculate the counts
  const activeRows = isBod
    ? rows.filter((r) => r.comparison?.changeType !== "NEW")
    : rows.filter((r) => !r.carryForward.closedSyntheticRow);
  const closedRows = isBod ? [] : rows.filter((r) => r.carryForward.closedSyntheticRow);

  // Engineers list
  const getUniqueEngineers = (items: typeof rows) => {
    const list = items
      .map((r) => String(r.output.Engineer ?? "").trim())
      .filter((name) => name && name !== "Manual Entry Required");
    return Array.from(new Set(list));
  };
  const uniqueEngineers = getUniqueEngineers(activeRows);
  const engineerCount = uniqueEngineers.length;

  const matchStatus = (
    r: GeneratedReportResponse["rows"][number],
    keywords: string[],
    excludes: string[] = []
  ): boolean => {
    const statuses = [
      String(r.output["RTPL status"] || "").trim().toLowerCase(),
      String(r.output["HP Owner Status"] || "").trim().toLowerCase(),
      String(r.output["Flex Status"] || "").trim().toLowerCase(),
      ...(isBod ? [
        String(r.comparison?.previousRtplStatus || "").trim().toLowerCase(),
        String(r.comparison?.previousFlexStatus || "").trim().toLowerCase()
      ] : [])
    ];

    return statuses.some(s => {
      if (!s || s === "manual entry required") return false;
      const matchesKeyword = keywords.some(kw => s.includes(kw.toLowerCase()));
      const matchesExclude = excludes.some(ex => s.includes(ex.toLowerCase()));
      return matchesKeyword && !matchesExclude;
    });
  };

  const parseWipAgingValue = (value: unknown): number | null => {
    const parsed = Number(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isPrintCase = (r: GeneratedReportResponse["rows"][number]): boolean => {
    const segment = String(r.output.Segment ?? "").trim().toLowerCase();
    const prodLine = String(r.output["Product Line Name"] ?? "").trim().toLowerCase();
    const woOtcCode = String(r.output["WO OTC CODE"] ?? "").trim().toUpperCase();
    return segment === "print" || prodLine.includes("print") || woOtcCode.startsWith("05F");
  };

  let aoaData: (string | number)[][];
  let merges: XLSX.Range[] = [];
  let colWidths: { wch: number }[] = [];

  if (isChennai) {
    const openCalls = activeRows.length;
    const actionable = activeRows.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"])).length;
    const planned = activeRows.filter(r => matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"])).length;
    const callAllocation = engineerCount > 0 ? (planned / engineerCount).toFixed(1) : "0.0";
    
    const printOpenGe2 = activeRows.filter(r => isPrintCase(r) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;
    const printActionableGe2 = activeRows.filter(r => isPrintCase(r) && matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;
    const printScheduledGe2 = activeRows.filter(r => isPrintCase(r) && matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) >= 2).length;
    
    const openCallsGt10 = activeRows.filter(r => (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;
    const actionableGt10 = activeRows.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;
    const scheduledGt10 = activeRows.filter(r => matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 10).length;
    
    const mpsGt1 = activeRows.filter(r => matchStatus(r, ["mps"]) && (parseWipAgingValue(getWipAging(r)) ?? 0) > 1).length;
    const eodCloser = closedRows.length;
    const newCalls = activeRows.filter(r => r.comparison?.changeType === "NEW").length;
    
    const csoDaysInventory = eodCloser > 0 ? (openCalls / eodCloser).toFixed(1) : "#DIV/0!";
    const engAvlInField = engineerCount;
    const enggProductivity = engineerCount > 0 ? (eodCloser / engineerCount).toFixed(1) : "0.0";
    
    const missedToSchedule = activeRows.filter(r => matchStatus(r, ["non avl", "missed to schedule", "to be scheduled", "assignment pending"])).length;
    const missedByEng = activeRows.filter(r => matchStatus(r, ["high call", "missed by eng"])).length;
    const gTotalMissed = missedToSchedule + missedByEng;
    const pctMissed = openCalls > 0 ? Math.round((gTotalMissed / openCalls) * 100) : 0;
    const closureAdherence = (eodCloser + gTotalMissed) > 0 ? Math.round((eodCloser / (eodCloser + gTotalMissed)) * 100) : 0;
    
    // NAF
    const flexBackend = activeRows.filter(r => matchStatus(r, ["flex backend", "backend"], ["hp backend"])).length;
    const ssc = activeRows.filter(r => matchStatus(r, ["ssc"])).length;
    const hpBackend = activeRows.filter(r => matchStatus(r, ["hp backend"])).length;
    const obsCustomer = activeRows.filter(r => matchStatus(r, ["obs", "observation", "customer"], ["pending", "delay"])).length;
    const cuPending = activeRows.filter(r => matchStatus(r, ["cu pending", "cust pending", "customer pending", "cust delay", "customer delay"])).length;
    const physicalClosed = activeRows.filter(r => matchStatus(r, ["physical closed", "physically closed", "partner complete", "wo closed"], ["error"])).length;
    
    const totalNaf = flexBackend + ssc + hpBackend + obsCustomer + cuPending + physicalClosed;
    const sscPct = totalNaf > 0 ? Math.round((ssc / totalNaf) * 100) : 0;
 
    aoaData = [
      ["CHENNAI DASHBOARD", "", getDayOfWeek(reportDate) + " / " + formatDisplayDateOnly(reportDate), "", "Date", formatDisplayDateOnly(reportDate)],
      ["S.No", "Description", "Count", "", "Non Action-Field", totalNaf],
      [1, "Total open call", openCalls, "", "Flex Backend", flexBackend ?? 0],
      [2, "Total field Actionable call", actionable, "", "SSC", ssc ?? 0],
      [3, "Total Call Scheduled", planned, "", "HP Backend", hpBackend ?? 0],
      [4, "Call Allocation Engineer Wise", Number(callAllocation), "", "OBS-Customer", obsCustomer ?? 0],
      [5, "Print - Open call (=>2 days)", printOpenGe2, "", "Cu Pending", cuPending ?? 0],
      [6, "Print - Actionable call (=>2 days)", printActionableGe2, "", "Physical Closed", physicalClosed ?? 0],
      [7, "Print - Scheduled (=>2 days)", printScheduledGe2, "", "Total NAF", totalNaf],
      [8, "Open call (>10 days)", openCallsGt10, "", "SSC%", `${sscPct}%`],
      [9, "Actionable call (>10 days)", actionableGt10, "", "", ""],
      [10, "Call Scheduled (>10 days)", scheduledGt10, "", "", ""],
      [11, "MPS >1 Days", mpsGt1 ?? 0, "", "", ""],
      [12, "EOD Call Closer", eodCloser ?? 0, "", "", ""],
      [13, "New Calls Received", newCalls ?? 0, "", "", ""],
      [14, "CSO Days Inventory", csoDaysInventory === "#DIV/0!" ? "#DIV/0!" : Number(csoDaysInventory), "", "", ""],
      [15, "Total Eng Count", engineerCount, "", "", ""],
      [16, "Eng Avl in Field", engAvlInField, "", "", ""],
      [17, "Engineers Productivity", Number(enggProductivity), "", "", ""],
      [18, "Missed to schedule field action calls due to non avl of Eng", missedToSchedule ?? 0, "", "", ""],
      [19, "Missed by Eng to attend scheduled Call (High call allocation)", missedByEng ?? 0, "", "", ""],
      [20, "G Total (Missed to schedule & Attend Daily basis)", gTotalMissed ?? 0, "", "", ""],
      [21, "% - Missed to schedule & Attend Daily call", `${pctMissed}%`, "", "", ""],
      [22, "Closure Adherence", `${closureAdherence}%`, "", "", ""],
    ];
 
    merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    ];
 
    colWidths = [
      { wch: 10 },
      { wch: 45 },
      { wch: 15 },
      { wch: 5 },
      { wch: 30 },
      { wch: 15 },
    ];
  } else {
    // 2. Salem region KPI summaries
    const openCallsCount = activeRows.length;
    const closedCallsCount = closedRows.length;
    const actionableCount = activeRows.filter(r => matchStatus(r, ["actionable"], ["customer", "cust", "cx", "delay", "pending"])).length;
    const plannedCount = activeRows.filter(r => matchStatus(r, ["assigned", "scheduled", "onsite"], ["pending", "to be"])).length;
    const enggOnsiteCount = activeRows.filter(r => matchStatus(r, ["assigned", "onsite"], ["pending", "to be"])).length;
    const toBeScheduleCount = activeRows.filter(r => matchStatus(r, ["to be scheduled", "assignment pending", "non avl", "missed to schedule"])).length;
    const cxRescheduleCount = activeRows.filter(r => matchStatus(r, ["cx pending", "reschedule", "cx", "cust delay", "customer delay", "customer pending"])).length;
    const sscPendingCount = activeRows.filter(r => matchStatus(r, ["ssc pending", "ssc"])).length;
    const elevateTechCount = activeRows.filter(r => matchStatus(r, ["elevation HP Pending", "elevation Part Pending", "elevation - HP Pending", "elevation - Partner Pending", "elevate"])).length;
    const underObservationCount = activeRows.filter(r => matchStatus(r, ["CRT Pending", "CT Validation Pending", "observation", "under observation", "crt"])).length;
    const toBeYankCount = activeRows.filter(r => matchStatus(r, ["Need to Yank", "Yank"])).length;
    const addPartOrderedCount = activeRows.filter(r => matchStatus(r, ["Additional Part", "Part Order Pending", "Parts Hold", "Part need to order"])).length;
    const toBeCancelCount = activeRows.filter(r => matchStatus(r, ["Need to Cancel", "Need to Cancel Mail", "Request to Cancel"])).length;
    const newCallsCount = activeRows.filter((r) => r.comparison?.changeType === "NEW").length;
    
    // Trade open calls helper (WO OTC CODE contains "TRADE" or starts with "01")
    const isTradeRow = (r: GeneratedReportResponse["rows"][number]) => {
      const code = String(r.output["WO OTC CODE"] ?? "").trim().toUpperCase();
      return code.includes("TRADE") || code.startsWith("01");
    };
    const tradeOpenCallsCount = activeRows.filter(isTradeRow).length;
 
    // Closed cancelled
    const closedCancelledCount = closedRows.filter((r) => matchStatus(r, ["cancel"])).length;
 
    aoaData = [
      [reportDate, "", regionName],
      ["S.No", "Description", "Count"],
      [1, "Engineer Count", engineerCount],
      [2, "No.of Engg Presents", engineerCount],
      [3, "Open Calls", openCallsCount],
      [4, "Actionable Calls", actionableCount || 0],
      [5, "Planned Calls", plannedCount || 0],
      [6, "Closed Calls", closedCallsCount || 0],
      [7, "Engg onsite", enggOnsiteCount || 0],
      [8, "To be schedule", toBeScheduleCount || 0],
      [9, "CX Reschedule Calls", cxRescheduleCount || 0],
      [10, "SSC Pending Calls", sscPendingCount || 0],
      [11, "Elevate/Tech Support Calls", elevateTechCount || 0],
      [12, "Under observation Calls", underObservationCount || 0],
      [13, "To be Yank", toBeYankCount || 0],
      [14, "Closed cancelled", closedCancelledCount || 0],
      [15, "Add.Part ordered", addPartOrderedCount || 0],
      [16, "To be Cancel", toBeCancelCount || 0],
      [17, "New calls", newCallsCount || 0],
      [18, "Trade Open Calls", tradeOpenCallsCount || 0],
    ];
 
    merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    ];
 
    colWidths = [
      { wch: 10 },
      { wch: 35 },
      { wch: 15 },
    ];
  }

  // 4. Create Worksheet and Workbook
  const ws = XLSX.utils.aoa_to_sheet(aoaData);
  
  // Set merge for first row
  ws["!merges"] = merges;

  // Set widths
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Region Summary");

  // Write file
  XLSX.writeFile(wb, `${regionName}_Region_Summary_${reportDate}.xlsx`);
}

export function downloadEngineerProductivityExcel(
  regionName: string,
  dateLabel: string,
  list: any[],
  totalAttended: number,
): void {
  const aoaData = [
    ["Date " + dateLabel, "", "", "", "", "", "", ""],
    ["S.No", "Engineer Name", "Assigned", "Attended", "Closed", "Part ordered", "Under Observation", "CX Reschedule"],
    ...list.map((item, index) => [
      index + 1,
      item.name,
      item.assigned,
      item.attended,
      item.closed,
      item.partOrdered ?? 0,
      item.underObservation ?? 0,
      item.cxReschedule ?? 0,
    ]),
    ["Total Attended", "", "", totalAttended, "", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: aoaData.length - 1, c: 0 }, e: { r: aoaData.length - 1, c: 2 } },
  ];

  ws["!cols"] = [
    { wch: 10 },
    { wch: 25 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 20 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Engineer Productivity");

  XLSX.writeFile(wb, `Engineer_Productivity_${regionName}_${dateLabel.replace(/\s+/g, "_")}.xlsx`);
}

