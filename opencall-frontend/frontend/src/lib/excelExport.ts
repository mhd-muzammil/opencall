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
