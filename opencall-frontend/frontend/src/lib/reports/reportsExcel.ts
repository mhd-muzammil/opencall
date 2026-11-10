/**
 * The Reports section's Excel files. Each report is one sheet; a single
 * report's download is that sheet alone, and the All-in-One download is every
 * sheet in one workbook, behind a cover sheet that says what it holds. Every
 * sheet is built from exactly what the page shows, so the file and the screen
 * agree.
 */
import type * as ExcelJSNS from "exceljs";
import { DAY_SUMMARY_ROWS, type DayReportColumn } from "../dayReport";
import { addDayReportSheet, loadExcelJs, saveXlsx } from "../dayReportExcel";
import { ATTENDANCE_TOTAL_HEADERS, AUTO_CLOSED_NOTE, dayCellText, statusShown, type AttendanceReport } from "./attendanceReport";
import { PAY_GROUPS, PAY_NET, payPeriod, payTotals, toNumber } from "./payReport";
import type { PayslipRow } from "../reportsApiClient";

export interface ProductivityReportRow {
  name: string;
  region: string;
  km: number | null;
  assigned: number;
  attended: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  customerPending: number;
  engineerDelay: number;
}

/** Everything the page has loaded for one filter. A report not loaded (or failed) is null and left out. */
export interface ReportsBundle {
  scope: string;
  from: string;
  to: string;
  petrol: DayReportColumn[] | null;
  productivity: ProductivityReportRow[] | null;
  attendance: AttendanceReport | null;
  pay: PayslipRow[] | null;
}

export type ReportKind = "petrol" | "productivity" | "attendance" | "pay";

export const REPORT_TITLES: Record<ReportKind, string> = {
  petrol: "Petrol Report",
  productivity: "Engineer Productivity Report",
  attendance: "Attendance Report",
  pay: "Pay Report",
};

const INDIGO = "FF4F46E5";
const INDIGO_TINT = "FFE0E7FF";
const TOTAL_TINT = "FFF1F5F9";
const THIN = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

const sheetDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};
const periodText = (from: string, to: string) => (from === to ? sheetDate(from) : `${sheetDate(from)} to ${sheetDate(to)}`);

/** A title line and a "who · when" line above a table, spanning `width` columns. */
function addTitle(sheet: ExcelJSNS.Worksheet, title: string, bundle: ReportsBundle, width: number): void {
  const span = Math.max(width, 4);
  sheet.mergeCells(1, 1, 1, span);
  const head = sheet.getCell(1, 1);
  head.value = title;
  head.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  head.fill = solid(INDIGO);
  head.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 26;
  sheet.mergeCells(2, 1, 2, span);
  const sub = sheet.getCell(2, 1);
  sub.value = `${bundle.scope}  ·  ${periodText(bundle.from, bundle.to)}`;
  sub.font = { italic: true, color: { argb: "FF475569" } };
  sub.alignment = { indent: 1 };
}

/** A header row at `rowNumber` in the section's indigo tint. */
function styleHeader(row: ExcelJSNS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1E1B4B" } };
    cell.fill = solid(INDIGO_TINT);
    cell.border = BOX;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 30;
}

function boxRow(row: ExcelJSNS.Row, from: number, to: number): void {
  for (let c = from; c <= to; c++) row.getCell(c).border = BOX;
}

// ---- Petrol -------------------------------------------------------------------

export function addPetrolSheet(workbook: ExcelJSNS.Workbook, bundle: ReportsBundle): void {
  // Exactly the Live Tracking Day Report's Summary sheet.
  addDayReportSheet(workbook, bundle.petrol ?? [], DAY_SUMMARY_ROWS, REPORT_TITLES.petrol);
}

// ---- Engineer Productivity -----------------------------------------------------

const PRODUCTIVITY_HEADERS = [
  "S.No",
  "Engineer Name",
  "Region",
  "KM",
  "Assigned",
  "Attended",
  "Closed",
  "Part ordered",
  "Under Observation/Elevation",
  "Customer Pending",
  "Engineer Delay",
];

export function addProductivitySheet(workbook: ExcelJSNS.Workbook, bundle: ReportsBundle): void {
  const rows = bundle.productivity ?? [];
  const sheet = workbook.addWorksheet(REPORT_TITLES.productivity, { views: [{ state: "frozen", ySplit: 3, xSplit: 2 }] });
  addTitle(sheet, REPORT_TITLES.productivity, bundle, PRODUCTIVITY_HEADERS.length);
  styleHeader(sheet.addRow(PRODUCTIVITY_HEADERS));
  rows.forEach((r, i) => {
    const row = sheet.addRow([
      i + 1,
      r.name,
      r.region,
      r.km == null ? "-" : Math.round(r.km * 10) / 10,
      r.assigned,
      r.attended,
      r.closed,
      r.partOrdered,
      r.underObservation,
      r.customerPending,
      r.engineerDelay,
    ]);
    boxRow(row, 1, PRODUCTIVITY_HEADERS.length);
    row.eachCell((cell, col) => {
      if (col !== 2 && col !== 3) cell.alignment = { horizontal: "center" };
    });
  });
  const sum = (key: keyof ProductivityReportRow) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const total = sheet.addRow([
    "",
    "Total",
    "",
    Math.round(sum("km") * 10) / 10,
    sum("assigned"),
    sum("attended"),
    sum("closed"),
    sum("partOrdered"),
    sum("underObservation"),
    sum("customerPending"),
    sum("engineerDelay"),
  ]);
  boxRow(total, 1, PRODUCTIVITY_HEADERS.length);
  total.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.fill = solid(TOTAL_TINT);
    if (col > 3) cell.alignment = { horizontal: "center" };
  });
  [7, 26, 14, 10, 11, 11, 10, 13, 26, 17, 15].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
}

// ---- Attendance -----------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  Present: "FF15803D",
  Overtime: "FF2563EB",
  overTime: "FF2563EB",
  Absent: "FFDC2626",
  "Half Day": "FFDB2777",
  Leave: "FFD97706",
  Sunday: "FF475569",
  Holiday: "FFD97706",
  Late: "FFD97706",
};

export function addAttendanceSheet(workbook: ExcelJSNS.Workbook, bundle: ReportsBundle): void {
  const report = bundle.attendance ?? { dates: [], dateLabels: [], rows: [], anyAutoClosed: false };
  const width = 3 + report.dates.length + ATTENDANCE_TOTAL_HEADERS.length;
  const sheet = workbook.addWorksheet(REPORT_TITLES.attendance, { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });
  addTitle(sheet, REPORT_TITLES.attendance, bundle, width);
  styleHeader(sheet.addRow(["S.no", "Name", "Location", ...report.dateLabels, ...ATTENDANCE_TOTAL_HEADERS]));
  const firstTotal = 4 + report.dates.length;
  for (const emp of report.rows) {
    const row = sheet.addRow([
      emp.sno,
      emp.relieved ? `${emp.name} (Relieved)` : emp.name,
      emp.branch,
      ...report.dates.map((d) => dayCellText(emp.days[d], d)),
      emp.present,
      emp.sunday,
      emp.holiday,
      emp.leave,
      emp.absent,
      emp.halfDay,
      emp.presentPlusLeave,
      emp.hoursText,
    ]);
    boxRow(row, 1, width);
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    report.dates.forEach((d, i) => {
      const cell = row.getCell(4 + i);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      const status = emp.days[d]?.status;
      if (status) cell.font = { color: { argb: STATUS_COLORS[statusShown(status, d)] || "FF000000" } };
    });
    for (let c = firstTotal; c <= width; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  if (report.anyAutoClosed) {
    sheet.addRow([]);
    sheet.addRow([AUTO_CLOSED_NOTE]).getCell(1).font = { color: { argb: "FF808080" }, size: 10 };
  }
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 14;
  report.dates.forEach((_, i) => (sheet.getColumn(4 + i).width = 14));
  ATTENDANCE_TOTAL_HEADERS.forEach((h, i) => (sheet.getColumn(firstTotal + i).width = Math.max(12, h.length + 2)));
}

// ---- Pay ------------------------------------------------------------------------

const PAY_TONE: Record<string, string> = {
  days: "FFFEF9C3",
  gross: "FFE0F2FE",
  earned: "FFDCFCE7",
  deductions: "FFFEE2E2",
  employer: "FFF3E8FF",
};
const MONEY_FORMAT = "#,##,##0.00";

export function addPaySheet(workbook: ExcelJSNS.Workbook, bundle: ReportsBundle): void {
  const slips = bundle.pay ?? [];
  const lead = ["S.No", "Code", "Employee", "Branch", "Month", "Status"];
  const figures = PAY_GROUPS.flatMap((g) => g.columns.map((c) => ({ ...c, tone: g.tone })));
  const width = lead.length + figures.length + 1;
  const sheet = workbook.addWorksheet(REPORT_TITLES.pay, { views: [{ state: "frozen", xSplit: 3, ySplit: 4 }] });
  addTitle(sheet, REPORT_TITLES.pay, bundle, width);

  // Two heading rows: each group's name over its columns; lead and Net span both.
  const groupRow = sheet.getRow(3);
  const labelRow = sheet.getRow(4);
  lead.forEach((label, i) => {
    sheet.mergeCells(3, i + 1, 4, i + 1);
    groupRow.getCell(i + 1).value = label;
  });
  let col = lead.length + 1;
  for (const group of PAY_GROUPS) {
    const end = col + group.columns.length - 1;
    sheet.mergeCells(3, col, 3, end);
    groupRow.getCell(col).value = group.label;
    group.columns.forEach((c, j) => {
      const cell = labelRow.getCell(col + j);
      cell.value = c.label;
      cell.fill = solid(PAY_TONE[group.tone]!);
    });
    for (let c = col; c <= end; c++) groupRow.getCell(c).fill = solid(PAY_TONE[group.tone]!);
    col = end + 1;
  }
  sheet.mergeCells(3, width, 4, width);
  groupRow.getCell(width).value = PAY_NET.label;
  for (const row of [groupRow, labelRow]) {
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: "FF1E1B4B" } };
      if (!cell.fill || c <= lead.length || c === width) cell.fill = solid(INDIGO_TINT);
      cell.border = BOX;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }
  groupRow.height = 22;
  labelRow.height = 22;

  slips.forEach((slip, i) => {
    const emp = slip.employee_details ?? {};
    const status = `${slip.status ?? ""}${emp.status === "relieved" ? " (Relieved)" : ""}`;
    const row = sheet.addRow([
      i + 1,
      emp.emp_code || "—",
      emp.employee_name || "—",
      emp.branch || "Not Assigned",
      payPeriod(slip),
      status,
      ...figures.map((c) => (c.fromAttendance && slip[c.key] == null ? "—" : toNumber(slip[c.key]))),
      toNumber(slip[PAY_NET.key]),
    ]);
    boxRow(row, 1, width);
    figures.forEach((c, j) => {
      if (c.kind === "money") row.getCell(lead.length + 1 + j).numFmt = MONEY_FORMAT;
    });
    row.getCell(width).numFmt = MONEY_FORMAT;
    row.getCell(width).font = { bold: true };
  });

  const totals = payTotals(slips);
  const total = sheet.addRow([
    "",
    "",
    `Total · ${slips.length}`,
    "",
    "",
    "",
    ...figures.map((c) => totals[c.key] ?? 0),
    totals[PAY_NET.key] ?? 0,
  ]);
  boxRow(total, 1, width);
  total.eachCell((cell, c) => {
    cell.font = { bold: true };
    cell.fill = solid(TOTAL_TINT);
    const figure = figures[c - lead.length - 1];
    if ((figure && figure.kind === "money") || c === width) cell.numFmt = MONEY_FORMAT;
  });

  [6, 9, 24, 14, 11, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = lead.length + 1; c < width; c++) sheet.getColumn(c).width = 12;
  sheet.getColumn(width).width = 15;
}

// ---- Downloads --------------------------------------------------------------------

const ADDERS: Record<ReportKind, (wb: ExcelJSNS.Workbook, b: ReportsBundle) => void> = {
  petrol: addPetrolSheet,
  productivity: addProductivitySheet,
  attendance: addAttendanceSheet,
  pay: addPaySheet,
};

export function reportFilename(kind: ReportKind | "all", bundle: ReportsBundle): string {
  const what = kind === "all" ? "All_In_One_Report" : REPORT_TITLES[kind].replace(/\s+/g, "_");
  const who = bundle.scope.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "All_Employees";
  const when = bundle.from === bundle.to ? bundle.from : `${bundle.from}_to_${bundle.to}`;
  return `${what}_${who}_${when}.xlsx`;
}

/** One report, as its own file. */
export async function downloadReport(kind: ReportKind, bundle: ReportsBundle): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  ADDERS[kind](workbook, bundle);
  saveXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()), reportFilename(kind, bundle));
}

/**
 * Every loaded report in one workbook, a sheet each, behind a cover sheet.
 * `notes` says, per report, why one is missing (not loaded, failed, nothing found).
 */
export async function downloadAllInOne(
  bundle: ReportsBundle,
  notes: Partial<Record<ReportKind, string>> = {},
): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  const cover = workbook.addWorksheet("Summary");
  addTitle(cover, "All-in-One Report", bundle, 4);
  cover.addRow([]);
  styleHeader(cover.addRow(["#", "Report", "Sheet", "Contents"]));
  const kinds: ReportKind[] = ["petrol", "productivity", "attendance", "pay"];
  kinds.forEach((kind, i) => {
    const included = bundle[kind] != null;
    const count =
      kind === "petrol"
        ? `${bundle.petrol?.length ?? 0} FSE-days`
        : kind === "productivity"
          ? `${bundle.productivity?.length ?? 0} engineers`
          : kind === "attendance"
            ? `${bundle.attendance?.rows.length ?? 0} employees`
            : `${bundle.pay?.length ?? 0} payslips`;
    const row = cover.addRow([i + 1, REPORT_TITLES[kind], included ? REPORT_TITLES[kind] : "—", included ? count : notes[kind] ?? "Not included"]);
    boxRow(row, 1, 4);
  });
  cover.addRow([]);
  cover.addRow([`Generated ${new Date().toLocaleString("en-IN")}`]).getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
  [5, 32, 32, 40].forEach((w, i) => (cover.getColumn(i + 1).width = w));

  for (const kind of kinds) if (bundle[kind] != null) ADDERS[kind](workbook, bundle);
  saveXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()), reportFilename("all", bundle));
}
