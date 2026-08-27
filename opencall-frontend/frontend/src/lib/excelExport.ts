import { ASP_CODE_REGION_MAP, DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import type { GeneratedReportResponse } from "./apiClient";
import type { RtplWipPivot } from "../features/dashboard/types";
import {
  hasRequestToCancelFlexStatus,
  isTodayCallPlanVisibleRow,
} from "./reportDashboardAnalytics";
import {
  buildPivotWorkbookBytes,
  CLOSED_CALLS_SHEET,
  OPEN_CALL_SHEET,
  PIVOT_TEMPLATE_URL,
} from "./pivotWorkbook";
import {
  isTradeCase,
  isWarrantyCase,
  isPrintCase as isPrintTypeCase,
} from "../features/dashboard/utils/caseClassification";
import {
  isActionableStatusValue,
  isPlannedStatusValue,
  isOnsiteStatusValue,
  isCaseClosedStatusValue,
} from "../features/dashboard/utils/reportUtils";
// Runtime `xlsx` (~900KB) is loaded lazily at export time so it stays out of the
// initial page bundle. Only the type namespace is imported statically (erased at
// build). Every function that touches the workbook API is async and awaits this.
import type * as XLSXNS from "xlsx";
const loadXlsx = (): Promise<typeof import("xlsx")> => import("xlsx");

// `exceljs` is only needed by the styled records-view export (SheetJS CE cannot
// write cell fills/fonts). Loaded lazily for the same bundle-size reason; the
// CJS module surfaces under `.default` depending on the bundler interop.
import type * as ExcelJSNS from "exceljs";
const loadExcelJs = async (): Promise<typeof ExcelJSNS> => {
  const mod = (await import("exceljs")) as typeof ExcelJSNS & {
    default?: typeof ExcelJSNS;
  };
  return mod.default ?? mod;
};

// A call is treated as "closed" when its (current or previous) RTPL status reads
// as closed — WO Closed, Physically Closed, Partner Complete, etc.
const CLOSED_STATUS_KEYS = [
  "woclosed",
  "physicallyclosed",
  "physicalclosed",
  "partnercomplete",
  "partnercompleted",
] as const;

function isClosedCallByStatus(
  row: GeneratedReportResponse["rows"][number],
): boolean {
  const raw = String(
    row.output["RTPL status"] ?? row.comparison?.previousRtplStatus ?? "",
  );
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) {
    return false;
  }
  return CLOSED_STATUS_KEYS.some((key) => normalized.includes(key));
}

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";

// In exported sheets the "Manual Entry Required" placeholder is shown as just
// "Entry" — a compact label the client reads as "needs a manual entry here".
// Display-only: the stored row values and the in-app UI are unchanged.
const MANUAL_ENTRY_EXPORT_LABEL = "Entry";

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

// Columns that hold numeric measures (day counts / turnaround), as opposed to
// identifiers or codes. These are written as real numbers so Excel sorts and
// aggregates them correctly in a manual PivotTable — text-stored numbers sort
// lexicographically (0, 1, 11, 12, ... 19, 2, 20) and won't sum.
const NUMERIC_EXPORT_COLUMNS = new Set<string>([
  "WIP aging",
  "Status Aging",
  "TAT",
]);

// Coerce a pure-numeric string in a numeric column to a real number. Anything
// else — ids, codes, values like "5 days", or blanks — passes through unchanged,
// so identifiers (Ticket ID, WO OTC CODE, Contact, ...) keep their text form.
function coerceNumericCell(
  column: string,
  value: ExportCellValue,
): ExportCellValue {
  if (typeof value === "number" || !NUMERIC_EXPORT_COLUMNS.has(column)) {
    return value;
  }
  const trimmed = String(value).trim();
  if (trimmed !== "" && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return value;
}

const STANDARD_COLUMN_SET = new Set<string>(STANDARD_EXPORT_COLUMNS);

export function mapRowToStandardExport(
  row: GeneratedReportResponse["rows"][number],
  columns: readonly string[] = STANDARD_EXPORT_COLUMNS,
): ExportCellValue[] {
  return columns.map((col) => {
    const value = (row.output as Record<string, string | number | undefined>)[col];

    // Raw Excel headers (not standard report columns) are merged into output by
    // the backend; emit their value as-is (no placeholder / carry-forward logic).
    if (!STANDARD_COLUMN_SET.has(col)) {
      return value === null || value === undefined ? "" : value;
    }

    if (value !== null && value !== undefined && value !== "") {
      if (value === MANUAL_ENTRY_REQUIRED) {
        return MANUAL_ENTRY_EXPORT_LABEL;
      }
      // Work Location is stored as the ASP code and shown as the region name —
      // the records grid has done that since "ASP code into Region Name", but
      // the export kept writing the raw code, so the file disagreed with the
      // screen it was taken from. Only the per-region download looked right,
      // and only because it is handed a region name rather than reading one.
      //
      // Every export path (records view, report matrix, workbook tabs) comes
      // through here, so this is the one place that can put them all in
      // agreement. An unmapped code passes through unchanged: a region the map
      // has not been told about must still export as something.
      if (col === "Work Location") {
        const aspCode = String(value).trim();
        return (
          ASP_CODE_REGION_MAP[aspCode as keyof typeof ASP_CODE_REGION_MAP] ??
          aspCode
        );
      }
      return coerceNumericCell(col as (typeof STANDARD_EXPORT_COLUMNS)[number], value);
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
      return coerceNumericCell(col, row.comparison?.previousWipAging ?? "");
    }

    return "";
  });
}

// Index of the "S.no" column in the standard export (always first).
const SNO_COLUMN_INDEX = STANDARD_EXPORT_COLUMNS.indexOf("S.no");

// Override the S.no cell so each exported sheet is numbered 1..N sequentially,
// rather than carrying the original (gappy, post-filter) serial numbers.
function withSequentialSerial(
  cells: ExportCellValue[],
  index: number,
  snoIndex: number = SNO_COLUMN_INDEX,
): ExportCellValue[] {
  if (snoIndex >= 0) {
    cells[snoIndex] = index + 1;
  }
  return cells;
}

// Header labels for export mirror the on-screen relabels (the stored column key
// stays the same). Keep in sync with the records grid.
const EXPORT_HEADER_LABEL: Partial<Record<string, string>> = {
  "RTPL status": "Morning status",
};

export function buildReportExportMatrix(
  report: GeneratedReportResponse,
  columns: readonly string[] = STANDARD_EXPORT_COLUMNS,
): ExportCellValue[][] {
  const headers = columns.map((c) => EXPORT_HEADER_LABEL[c] ?? c);
  const snoIndex = columns.indexOf("S.no");
  const data: ExportCellValue[][] = [headers];

  report.rows
    .filter((item) => !hasRequestToCancelFlexStatus(item))
    .forEach((row, index) => {
      data.push(withSequentialSerial(mapRowToStandardExport(row, columns), index, snoIndex));
    });

  return data;
}

function buildReportExportMatrixForRows(
  rows: readonly GeneratedReportResponse["rows"][number][],
): ExportCellValue[][] {
  return [
    [...STANDARD_EXPORT_COLUMNS],
    ...rows.map((row, index) =>
      withSequentialSerial(mapRowToStandardExport(row), index),
    ),
  ];
}

// Split the (already region-filtered) report into today's open calls vs. calls
// closed by status. Open = visible and not closed-by-status; Closed = status
// reads as closed (WO Closed, Physically Closed, Partner Complete, ...).
function splitWorkbookRows(report: GeneratedReportResponse): {
  openRows: GeneratedReportResponse["rows"][number][];
  closedRows: GeneratedReportResponse["rows"][number][];
} {
  const openRows = report.rows.filter(
    (row) => isTodayCallPlanVisibleRow(row) && !isClosedCallByStatus(row),
  );
  const closedRows = report.rows.filter(
    (row) => !hasRequestToCancelFlexStatus(row) && isClosedCallByStatus(row),
  );
  return { openRows, closedRows };
}

export function buildWorkbookExportMatrices(report: GeneratedReportResponse): {
  todayOpenCall: ExportCellValue[][];
  todayClosedCalls: ExportCellValue[][];
} {
  const { openRows, closedRows } = splitWorkbookRows(report);
  return {
    todayOpenCall: buildReportExportMatrixForRows(openRows),
    todayClosedCalls: buildReportExportMatrixForRows(closedRows),
  };
}

// Excel-style filter label for a column over the (already region/case-scoped)
// pivot rows: the single value when only one is present, "(Multiple Items)"
// when several are, and "(All)" when none — exactly how an Excel PivotTable
// page filter reads.
export function pivotFilterLabel(
  rows: readonly GeneratedReportResponse["rows"][number][],
  column: string,
): string {
  const distinct = new Set<string>();
  for (const row of rows) {
    const value = String(row.output[column] ?? "").trim();
    if (value) {
      distinct.add(value);
    }
    if (distinct.size > 1) {
      return "(Multiple Items)";
    }
  }
  const [only] = distinct;
  return distinct.size === 1 && only ? only : "(All)";
}

// Render the dashboard RTPL-status x WIP-aging pivot as a sheet matrix that
// mirrors a native Excel PivotTable: "Segment" / "WO OTC CODE" filter rows, the
// "Count of Ticket ID" / "Column Labels" banner, "Row Labels" carrying the WIP
// aging columns, blank (not 0) empty cells, and a "Grand Total" row & column.
export function buildPivotMatrix(
  pivot: RtplWipPivot,
  filters: { segment?: string; woOtcCode?: string } = {},
): ExportCellValue[][] {
  // Page-filter context (mirrors the reference pivot's Segment + WO OTC CODE
  // filters), then a blank spacer row.
  const filterRows: ExportCellValue[][] = [
    ["Segment", filters.segment ?? "(All)"],
    ["WO OTC CODE", filters.woOtcCode ?? "(All)"],
  ];
  const spacerRow: ExportCellValue[] = [""];

  const valueBanner: ExportCellValue[] = [
    "Count of Ticket ID",
    "Column Labels",
  ];
  const columnHeader: ExportCellValue[] = [
    "Row Labels",
    ...pivot.columns.map((column) => column.label),
    "Grand Total",
  ];

  // Empty cells are left blank (""), matching the Excel pivot — counts are only
  // ever >= 1 in the pivot, so a missing cell means zero tickets.
  const body: ExportCellValue[][] = pivot.rows.map((row) => [
    row.status,
    ...pivot.columns.map((column) => row.cells[column.key] ?? ""),
    row.total,
  ]);

  const grandTotalRow: ExportCellValue[] = [
    "Grand Total",
    ...pivot.columns.map((column) => column.total),
    pivot.grandTotal,
  ];

  return [...filterRows, spacerRow, valueBanner, columnHeader, ...body, grandTotalRow];
}

export function downloadReportAsExcel(
  report: GeneratedReportResponse,
  columns?: readonly string[],
): void {
  const data = buildReportExportMatrix(report, columns ?? STANDARD_EXPORT_COLUMNS);
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

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ——— OCR export filename ————————————————————————————————————————————————————
// The workbook export is named for the company, the region it was scoped to,
// and the day's phase:
//   Renderways_Technology_Pvt_Ltd_OCR_BOD_15-July.xlsx          (all ASP codes)
//   Renderways_Technology_Pvt_Ltd_Chennai_OCR_EOD_15-July.xlsx  (one ASP code)
// EOD only when the employees have filled the Evening status on EVERY open
// call in the export — one missing entry keeps it a BOD file.
const EXPORT_COMPANY_NAME = "Renderways_Technology_Pvt_Ltd";

const EXPORT_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "2026-07-15" -> "15-July"; an unparseable date passes through unchanged. */
export function formatOcrExportDate(reportDate: string): string {
  const parsed = new Date(`${reportDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return reportDate;
  }
  return `${parsed.getDate()}-${EXPORT_MONTH_NAMES[parsed.getMonth()]}`;
}

/** "VELLORE" / "vellore" -> "Vellore" (each word title-cased). */
export function formatOcrRegionName(regionName: string): string {
  return regionName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * EOD when every OPEN call in the export carries a filled Evening status —
 * closed rows (already done) and Request-to-Cancel rows don't gate it. With no
 * open rows at all the day never reaches EOD via this export (stays BOD).
 */
export function isEveningStatusComplete(
  rows: readonly GeneratedReportResponse["rows"][number][],
): boolean {
  const openRows = rows.filter(
    (row) =>
      !row.carryForward.closedSyntheticRow && !hasRequestToCancelFlexStatus(row),
  );
  if (openRows.length === 0) {
    return false;
  }
  return openRows.every((row) => {
    const value = String(row.output["Evening status"] ?? "").trim();
    return value !== "" && value !== MANUAL_ENTRY_REQUIRED;
  });
}

/**
 * The exported workbook's filename. `regionName` names the region the export
 * was scoped to — the ASP Code the user filtered the table by, or a
 * REGION_ADMIN's own region — and is null/absent for an unfiltered export.
 * Underscore-delimited like the rest of the name, so the whole filename splits
 * cleanly on "_".
 */
export function buildOcrExportFilename(
  report: GeneratedReportResponse,
  regionName?: string | null,
): string {
  const company = regionName?.trim()
    ? `${EXPORT_COMPANY_NAME}_${formatOcrRegionName(regionName)}`
    : EXPORT_COMPANY_NAME;
  const phase = isEveningStatusComplete(report.rows) ? "EOD" : "BOD";
  const date = report.reportDate || new Date().toISOString().split("T")[0];
  return `${company}_OCR_${phase}_${formatOcrExportDate(date ?? "")}.xlsx`;
}

async function fetchPivotTemplate(
  url: string = PIVOT_TEMPLATE_URL,
): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Pivot template ${url} returned HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function triggerDownload(bytes: Uint8Array, filename: string, mime: string): void {
  // Copy into a fresh ArrayBuffer-backed view so the bytes satisfy BlobPart
  // (fflate's Uint8Array is typed over the broader ArrayBufferLike).
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Fallback when the PivotTable template can't be fetched: a plain two-sheet
// workbook (Open + Closed) with no pivot, so the export still works before the
// template asset is in place.
async function downloadDataSheetsWorkbook(
  openAoa: ExportCellValue[][],
  closedAoa: ExportCellValue[][],
  filename: string,
): Promise<void> {
  const XLSX = await loadXlsx();
  const headers = openAoa[0] ?? [];
  const wb = XLSX.utils.book_new();

  const openSheet = XLSX.utils.aoa_to_sheet(openAoa);
  openSheet["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, openSheet, OPEN_CALL_SHEET);

  const closedSheet = XLSX.utils.aoa_to_sheet(closedAoa);
  closedSheet["!cols"] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, closedSheet, CLOSED_CALLS_SHEET);

  XLSX.writeFile(wb, filename);
}

// Export the report as an .xlsx whose "Pivot" sheet is a *native* Excel
// PivotTable (RTPL status x WIP aging, Count of Ticket ID, filtered by Segment
// + WO OTC CODE). The PivotTable lives in a prebuilt template; here we inject
// today's open calls as its data source (and as the verbatim "Today Open Call"
// / "Today Closed Calls" sheets) and let Excel rebuild the cache on open.
//
// When `view` is given, a styled "Records" sheet is added to the same workbook:
// the records table exactly as the employee sees it (their column layout and
// filtered/sorted rows), with the on-screen blue header — one file carrying
// both the working view and the exact old pivot.
export async function downloadReportAsXlsx(
  report: GeneratedReportResponse,
  view?: RecordsViewInput,
  naming?: { regionName?: string | null },
): Promise<void> {
  const { openRows, closedRows } = splitWorkbookRows(report);
  const openCallAoa = buildReportExportMatrixForRows(openRows);
  const closedCallsAoa = buildReportExportMatrixForRows(closedRows);

  const filename = buildOcrExportFilename(report, naming?.regionName ?? null);

  try {
    const templateBytes = await fetchPivotTemplate();
    const recordsView = view ? buildRecordsViewMatrix(view.rows, view.columns) : null;
    const workbookBytes = buildPivotWorkbookBytes(templateBytes, {
      sourceAoa: openCallAoa,
      openAoa: openCallAoa,
      closedAoa: closedCallsAoa,
      ...(recordsView
        ? {
            records: {
              name: RECORDS_VIEW_SHEET,
              aoa: recordsView.aoa,
              widths: recordsView.widths,
            },
          }
        : {}),
      // The file opens with exactly two tabs — Pivot and Records. The pivot's
      // data-source sheet stays in the workbook (the PivotTable refreshes from
      // it on open) but its tab is hidden.
      hideSourceSheet: true,
    });
    triggerDownload(workbookBytes, filename, XLSX_MIME);
  } catch (error) {
    console.warn(
      `Native PivotTable template (${PIVOT_TEMPLATE_URL}) unavailable; exporting data sheets only.`,
      error,
    );
    if (view) {
      await downloadRecordsFallbackWorkbook(view, filename);
    } else {
      await downloadDataSheetsWorkbook(openCallAoa, closedCallsAoa, filename);
    }
  }
}

// ——— Records-view (WYSIWYG) export ——————————————————————————————————————————
// Exports the records table exactly as the employee is viewing it: their column
// layout/order (hidden columns removed), their filtered/searched/sorted rows,
// and the on-screen grid styling — solid blue header (#0ea5e9) with dark bold
// text, slate gridlines, frozen header row and an Excel autofilter (mirroring
// the sticky header + per-column filters in the app).
const RECORDS_HEADER_FILL_ARGB = "FF0EA5E9";
const RECORDS_HEADER_FONT_ARGB = "FF0F172A";
const RECORDS_GRID_BORDER_ARGB = "FFCBD5E1";
export const RECORDS_VIEW_SHEET = "Records";

type ReportRows = GeneratedReportResponse["rows"];

// The rows + columns the employee is actually looking at on the records page.
export interface RecordsViewInput {
  rows: ReportRows;
  columns: readonly string[];
}

// Header + body matrix of the on-screen view (sequential S.no, "Morning
// status" relabel, "Entry" placeholders), plus content-fitted column widths.
export function buildRecordsViewMatrix(
  rows: ReportRows,
  columns: readonly string[],
): { aoa: ExportCellValue[][]; widths: number[] } {
  const headers: ExportCellValue[] = columns.map((c) => EXPORT_HEADER_LABEL[c] ?? c);
  const snoIndex = columns.indexOf("S.no");
  const body = rows.map((row, index) =>
    withSequentialSerial(mapRowToStandardExport(row, columns), index, snoIndex),
  );
  const widths = columns.map((_, index) => {
    let maxLen = String(headers[index] ?? "").length;
    for (const cells of body) {
      const len = String(cells[index] ?? "").length;
      if (len > maxLen) {
        maxLen = len;
      }
    }
    return Math.min(Math.max(maxLen + 3, 9), 44);
  });
  return { aoa: [headers, ...body], widths };
}

export async function buildRecordsViewWorkbook(
  rows: ReportRows,
  columns: readonly string[] = STANDARD_EXPORT_COLUMNS,
): Promise<ExcelJSNS.Workbook> {
  const ExcelJS = await loadExcelJs();
  const { aoa, widths } = buildRecordsViewMatrix(rows, columns);
  const [headers = [], ...body] = aoa;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(RECORDS_VIEW_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow([...headers]);
  for (const cells of body) {
    sheet.addRow(cells);
  }

  const gridBorderSide: ExcelJSNS.Border = {
    style: "thin",
    color: { argb: RECORDS_GRID_BORDER_ARGB },
  };
  const gridBorder: Partial<ExcelJSNS.Borders> = {
    top: gridBorderSide,
    left: gridBorderSide,
    bottom: gridBorderSide,
    right: gridBorderSide,
  };
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = gridBorder;
    });
  });

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: RECORDS_HEADER_FILL_ARGB },
    };
    cell.font = { bold: true, color: { argb: RECORDS_HEADER_FONT_ARGB }, size: 11 };
    cell.alignment = { vertical: "middle" };
  });

  // Width each column to its longest value (clamped) so the sheet opens
  // readable without a manual column resize.
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(columns.length, 1) },
  };

  return workbook;
}

// Fallback for the merged export when the pivot template can't be fetched:
// just the styled Records sheet — no pivot is possible without the template,
// and the export must never carry extra data tabs (the file is Pivot + Records
// only by spec).
async function downloadRecordsFallbackWorkbook(
  view: RecordsViewInput,
  filename: string,
): Promise<void> {
  const workbook = await buildRecordsViewWorkbook(view.rows, view.columns);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(new Uint8Array(buffer), filename, XLSX_MIME);
}

export async function downloadRegionSummaryExcel(
  regionName: string,
  reportDate: string,
  rows: readonly GeneratedReportResponse["rows"][number][],
  isChennaiStyle?: boolean,
  isBod?: boolean,
): Promise<void> {
  const XLSX = await loadXlsx();
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

  // Trade/Warranty now flow from the backend-derived Segment (single source of truth).
  const isTradeRow = isTradeCase;
  const isWarrantyRow = isWarrantyCase;

  // 1. Calculate the counts
  const activeRows = isBod
    ? rows.filter((r) => r.comparison?.changeType !== "NEW" && isWarrantyRow(r))
    : rows.filter((r) => !r.carryForward.closedSyntheticRow && isWarrantyRow(r));
  const closedRows = isBod ? [] : rows.filter((r) => r.carryForward.closedSyntheticRow && isWarrantyRow(r));

  // Engineers list
  const getUniqueEngineers = (items: typeof rows) => {
    const list = items
      .map((r) => String(r.output.Engineer ?? "").trim())
      .filter((name) => name && name !== "Manual Entry Required");
    return Array.from(new Set(list));
  };
  const uniqueEngineers = getUniqueEngineers(activeRows);
  const engineerCount = uniqueEngineers.length;

  const getRowStatus = (r: GeneratedReportResponse["rows"][number]): string => {
    return (isBod
      ? String(r.comparison?.previousRtplStatus || r.output["RTPL status"] || "")
      : String(r.output["RTPL status"] || "")
    ).trim();
  };

  const matchStatus = (
    r: GeneratedReportResponse["rows"][number],
    keywords: string[],
    excludes: string[] = []
  ): boolean => {
    const s = getRowStatus(r).toLowerCase();
    if (!s || s === "manual entry required") return false;
    const matchesKeyword = keywords.some(kw => s.includes(kw.toLowerCase()));
    const matchesExclude = excludes.some(ex => s.includes(ex.toLowerCase()));
    return matchesKeyword && !matchesExclude;
  };

  // Present = the engineer has at least one "Scheduled" call under their name
  // that day; an engineer with no scheduled assignment is absent.
  const presentsCount = getUniqueEngineers(
    activeRows.filter(
      (r) =>
        getRowStatus(r).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ===
        "scheduled",
    ),
  ).length;

  const parseWipAgingValue = (value: unknown): number | null => {
    const parsed = Number(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  };

  // Print-type detection also flows from the Segment. activeRows are already
  // warranty-filtered, so this yields warranty Print + Install rows.
  const isPrintCase = isPrintTypeCase;

  let aoaData: (string | number)[][];
  let merges: XLSXNS.Range[] = [];
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
    // Actionable = "Scheduled" + "To Be Scheduled" (shared definition).
    const actionableCount = activeRows.filter(r => isActionableStatusValue(getRowStatus(r))).length;
    // Planned = Scheduled + Engineer Assigned (exact); onsite is its own bucket.
    const plannedCount = activeRows.filter(r => isPlannedStatusValue(getRowStatus(r))).length;
    const enggOnsiteCount = activeRows.filter(r => isOnsiteStatusValue(getRowStatus(r))).length;
    // Attended = a planned (Morning Scheduled/Engg Assigned) case whose Evening
    // status exists and has moved past the planning stage — cross-column, so it
    // reads Morning/Evening directly (mirrors the on-screen BOD & EOD table).
    const attendedCount = activeRows.filter((r) => {
      const morning = String(r.output["RTPL status"] ?? "").trim();
      const evening = String(r.output["Evening status"] ?? "").trim();
      return (
        isPlannedStatusValue(morning) &&
        evening !== "" &&
        evening.toLowerCase() !== "manual entry required" &&
        !isPlannedStatusValue(evening)
      );
    }).length;
    // Closed Calls = explicit "Case-Closed" statuses plus closed-by-vanishing
    // rows, minus vanished cancellations (those belong to Closed cancelled).
    const caseClosedCount =
      activeRows.filter((r) => isCaseClosedStatusValue(getRowStatus(r))).length +
      closedRows.filter((r) => !matchStatus(r, ["cancel"])).length;
    const toBeScheduleCount = activeRows.filter(r => matchStatus(r, ["to be scheduled", "assignment pending", "non avl", "missed to schedule"])).length;
    const cxRescheduleCount = activeRows.filter(r => matchStatus(r, ["cx pending", "reschedule", "cx", "cust delay", "customer delay", "customer pending"])).length;
    const engineerDelayCount = activeRows.filter(r => matchStatus(r, ["engineer delay", "eng delay"])).length;
    const sscPendingCount = activeRows.filter(r => matchStatus(r, ["ssc pending", "ssc"])).length;
    const elevateTechCount = activeRows.filter(r => matchStatus(r, ["elevation HP Pending", "elevation Part Pending", "elevation - HP Pending", "elevation - Partner Pending", "elevate"])).length;
    const underObservationCount = activeRows.filter(r => matchStatus(r, ["CRT Pending", "CT Validation Pending", "observation", "under observation", "crt"])).length;
    const toBeYankCount = activeRows.filter(r => matchStatus(r, ["Need to Yank", "Yank"])).length;
    const addPartOrderedCount = activeRows.filter(r => matchStatus(r, ["Additional Part", "Part Order Pending", "Parts Hold", "Part need to order"])).length;
    const toBeCancelCount = activeRows.filter(r => matchStatus(r, ["Need to Cancel", "Need to Cancel Mail", "Request to Cancel"])).length;
    const newCallsCount = activeRows.filter((r) => r.comparison?.changeType === "NEW").length;
    
    const tradeOpenCallsCount = isBod
      ? rows.filter((r) => r.comparison?.changeType !== "NEW" && isTradeRow(r)).length
      : rows.filter((r) => !r.carryForward.closedSyntheticRow && isTradeRow(r)).length;
 
    // Closed cancelled
    const closedCancelledCount = closedRows.filter((r) => matchStatus(r, ["cancel"])).length;
 
    aoaData = [
      [reportDate, "", regionName],
      ["S.No", "Description", "Count"],
      [1, "Engineer Count", engineerCount],
      [2, "No.of Engg Presents", presentsCount],
      [3, "Open Calls", openCallsCount],
      [4, "Actionable Calls", actionableCount || 0],
      [5, "Scheduled Calls", plannedCount || 0],
      [6, "Attended", isBod ? 0 : attendedCount || 0],
      [7, "Closed Calls", caseClosedCount || 0],
      [8, "Engg onsite", enggOnsiteCount || 0],
      [9, "To be schedule", toBeScheduleCount || 0],
      [10, "Customer Pending", cxRescheduleCount || 0],
      [11, "Engineer Delay", engineerDelayCount || 0],
      [12, "SSC Pending Calls", sscPendingCount || 0],
      [13, "Elevate/Tech Support Calls", elevateTechCount || 0],
      [14, "Under observation Calls", underObservationCount || 0],
      [15, "To be Yank", toBeYankCount || 0],
      [16, "Closed cancelled", closedCancelledCount || 0],
      [17, "Add.Part ordered", addPartOrderedCount || 0],
      [18, "To be Cancel", toBeCancelCount || 0],
      [19, "New calls", newCallsCount || 0],
      [20, "Trade Open Calls", tradeOpenCallsCount || 0],
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

export async function downloadEngineerProductivityExcel(
  regionName: string,
  dateLabel: string,
  list: any[],
  totalAttended: number,
): Promise<void> {
  const XLSX = await loadXlsx();
  const sum = (key: string) =>
    list.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
  const aoaData = [
    ["Date " + dateLabel, "", "", "", "", "", "", "", ""],
    ["S.No", "Engineer Name", "Assigned", "Attended", "Closed", "Part ordered", "Under Observation/Elevation", "Customer Pending", "Engineer Delay"],
    ...list.map((item, index) => [
      index + 1,
      item.name,
      item.assigned,
      item.attended,
      item.closed,
      item.partOrdered ?? 0,
      item.underObservation ?? 0,
      item.cxReschedule ?? 0,
      item.engineerDelay ?? 0,
    ]),
    [
      "Total",
      "",
      sum("assigned"),
      totalAttended,
      sum("closed"),
      sum("partOrdered"),
      sum("underObservation"),
      sum("cxReschedule"),
      sum("engineerDelay"),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: aoaData.length - 1, c: 0 }, e: { r: aoaData.length - 1, c: 1 } },
  ];

  ws["!cols"] = [
    { wch: 10 },
    { wch: 25 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 26 },
    { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Engineer Productivity");

  XLSX.writeFile(wb, `Engineer_Productivity_${regionName}_${dateLabel.replace(/\s+/g, "_")}.xlsx`);
}

