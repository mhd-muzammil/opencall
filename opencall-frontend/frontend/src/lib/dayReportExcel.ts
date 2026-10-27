// The Day Report as an Excel sheet, laid out like the office's own: one row
// per field, one column per FSE-day, every cell boxed. Built from the same
// rows the screen shows (dayReport.ts), so the file and the screen agree.

import type * as ExcelJSNS from "exceljs";
import { DAY_REPORT_ROWS, sheetDate, sheetText, type DayReportColumn, type DayReportRowSpec } from "./dayReport";
import { kmPerPresentDay, type DayKmLine, type DayKmReport } from "./dayKmReport";

// Loaded at download time, as the other exports load it, so it stays out of
// the page's first bundle. The CJS module surfaces under `.default` depending
// on the bundler.
const loadExcelJs = async (): Promise<typeof ExcelJSNS> => {
  const mod = (await import("exceljs")) as typeof ExcelJSNS & { default?: typeof ExcelJSNS };
  return mod.default ?? mod;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** The workbook's bytes: `rows` down -- the full sheet, or the short one -- the FSE-days across. */
export async function buildDayReportWorkbook(
  columns: DayReportColumn[],
  rows: DayReportRowSpec[] = DAY_REPORT_ROWS,
): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  // The field names and the Date and Name rows stay in view while scrolling.
  const sheet = workbook.addWorksheet("Day Report", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
  });
  sheet.getColumn(1).width = 22;
  columns.forEach((_, index) => {
    sheet.getColumn(index + 2).width = 32;
  });

  rows.forEach((spec, rowIndex) => {
    const row = sheet.getRow(rowIndex + 1);
    const label = row.getCell(1);
    label.value = spec.label;
    label.border = BOX;
    label.alignment = { vertical: "top" };
    label.font = { bold: true };
    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 2);
      cell.value = sheetText(spec.lines(column));
      cell.border = BOX;
      cell.alignment = { vertical: "top", horizontal: spec.list ? "left" : "center", wrapText: true };
    });
  });

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Builds the sheet and hands it to the browser as a download. */
export async function downloadDayReportExcel(
  columns: DayReportColumn[],
  filename: string,
  rows: DayReportRowSpec[] = DAY_REPORT_ROWS,
): Promise<void> {
  saveXlsx(await buildDayReportWorkbook(columns, rows), filename);
}

const NAVY = "FF1F3864";
const GREY = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const GREY_BOX = { top: GREY, left: GREY, bottom: GREY, right: GREY };
const TOTAL_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9E1F2" } };
const KM_FORMAT = "#,##0.0";

/**
 * The Day-wise KM Report as the office's sheet has it: a line per FSE with a
 * column per day, shaded deeper the further the day went, then a line per
 * location; each with its total km over a bar, the days present and the km a
 * present day, and a Total line under each.
 */
export async function buildDayKmWorkbook(report: DayKmReport): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  // S.No, Engineer and Location, and the heading, stay in view while scrolling.
  const sheet = workbook.addWorksheet("KM Report", { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });
  const firstDay = 4;
  const totalCol = firstDay + report.days.length;
  const letter = (col: number) => sheet.getColumn(col).letter;
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 14;
  report.days.forEach((_, index) => {
    sheet.getColumn(firstDay + index).width = 8;
  });
  sheet.getColumn(totalCol).width = 13;
  sheet.getColumn(totalCol + 1).width = 11;
  sheet.getColumn(totalCol + 2).width = 13;

  const title = sheet.getCell(1, 1);
  title.value = "Day-wise KM Report (Engineer-wise)";
  title.font = { bold: true, size: 16, color: { argb: NAVY } };
  const source = sheet.getCell(2, 1);
  source.value = 'Source: the Total km row of the Day Report. "-" = no km that day. Days Present = days with a Login or km.';
  source.font = { italic: true, color: { argb: "FF595959" } };

  /** A heading row: `lead` from column `from`, then the days and the three totals. */
  const heading = (rowNumber: number, from: number, lead: string[]) => {
    const row = sheet.getRow(rowNumber);
    row.height = 72;
    const labels = [...lead, ...report.days.map(sheetDate), "Total KM", "Days Present", "Avg KM / Present Day"];
    labels.forEach((label, index) => {
      const cell = row.getCell(from + index);
      const isDay = from + index >= firstDay && from + index < totalCol;
      cell.value = label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.border = GREY_BOX;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, ...(isDay ? { textRotation: 90 } : {}) };
    });
  };

  /** A line's days and totals, from the first day's column on. */
  const figures = (rowNumber: number, line: DayKmLine, total: boolean) => {
    const row = sheet.getRow(rowNumber);
    const put = (col: number, value: number | string, format: string, horizontal: "right" | "center") => {
      const cell = row.getCell(col);
      cell.value = value;
      cell.numFmt = format;
      cell.border = GREY_BOX;
      cell.alignment = { horizontal, vertical: "middle" };
      if (total) cell.fill = TOTAL_FILL;
      if (total || col >= totalCol) cell.font = { bold: true };
    };
    line.km.forEach((km, index) => put(firstDay + index, km ? km : "-", KM_FORMAT, "right"));
    put(totalCol, line.total, KM_FORMAT, "right");
    put(totalCol + 1, line.present, "0", "center");
    const average = kmPerPresentDay(line);
    put(totalCol + 2, average == null ? "-" : Math.round(average * 10) / 10, "0.0", "right");
  };

  /** The cells before the days, boxed; on a Total line, shaded and bold. */
  const lead = (rowNumber: number, values: (string | number | null)[], total: boolean, from = 1) => {
    const row = sheet.getRow(rowNumber);
    values.forEach((value, index) => {
      const cell = row.getCell(from + index);
      cell.value = value;
      cell.border = GREY_BOX;
      cell.alignment = { vertical: "middle", horizontal: typeof value === "number" ? "center" : "left" };
      if (total) {
        cell.fill = TOTAL_FILL;
        cell.font = { bold: true };
      }
    });
  };

  // Engineer-wise.
  heading(3, 1, ["S.No", "Engineer", "Location"]);
  report.fses.forEach((line, index) => {
    const rowNumber = 4 + index;
    lead(rowNumber, [index + 1, line.name, line.location || "-"], false);
    sheet.getCell(rowNumber, 3).font = { color: { argb: "FF008000" } };
    figures(rowNumber, line, false);
  });
  const fseEnd = 3 + report.fses.length;
  lead(fseEnd + 1, [null, "Total KM (day)", null], true);
  figures(fseEnd + 1, report.total, true);

  // Location-wise, two rows below.
  const locTitleRow = fseEnd + 3;
  const locTitle = sheet.getCell(locTitleRow, 1);
  locTitle.value = "Location-wise KM per Day";
  locTitle.font = { bold: true, size: 13, color: { argb: NAVY } };
  heading(locTitleRow + 1, 2, ["Location", "Engineers"]);
  report.locations.forEach((line, index) => {
    const rowNumber = locTitleRow + 2 + index;
    lead(rowNumber, [line.name, line.fses], false, 2);
    figures(rowNumber, line, false);
  });
  const locEnd = locTitleRow + 1 + report.locations.length;
  lead(locEnd + 1, ["Total", report.total.fses], true, 2);
  figures(locEnd + 1, report.total, true);

  // Each day's km shaded from white (none) to peach (the furthest day), and a
  // bar under each total km -- the Total lines left out of both.
  const dayRange = `${letter(firstDay)}4:${letter(totalCol - 1)}${fseEnd}`;
  sheet.addConditionalFormatting({
    ref: dayRange,
    rules: [
      {
        type: "colorScale",
        priority: 1,
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
        color: [{ argb: "FFFFFFFF" }, { argb: "FFFAD5BD" }],
      },
    ],
  });
  // A total of none gets no bar, as on the office's sheet: Excel would draw a
  // stub even at 0, so those cells are left out of the bar's range.
  const bar = (firstRow: number, lines: DayKmLine[], priority: number) => {
    const rows = lines.flatMap((line, index) => (line.total > 0 ? [firstRow + index] : []));
    if (rows.length === 0) return;
    const runs: string[] = [];
    let start = rows[0]!;
    rows.forEach((row, index) => {
      const next = rows[index + 1];
      if (next === row + 1) return;
      const col = letter(totalCol);
      runs.push(start === row ? `${col}${row}` : `${col}${start}:${col}${row}`);
      if (next != null) start = next;
    });
    sheet.addConditionalFormatting({
      ref: runs.join(" "),
      rules: [
        // exceljs writes a bar's `color`, though its types leave it out.
        {
          type: "dataBar",
          priority,
          gradient: true,
          cfvo: [{ type: "num", value: 0 }, { type: "max" }],
          color: { argb: "FF638EC6" },
        } as ExcelJSNS.DataBarRuleType,
      ],
    });
  };
  bar(4, report.fses, 2);
  bar(locTitleRow + 2, report.locations, 3);

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Builds the Day-wise KM sheet and hands it to the browser as a download. */
export async function downloadDayKmExcel(report: DayKmReport, filename: string): Promise<void> {
  saveXlsx(await buildDayKmWorkbook(report), filename);
}

/** Hands a workbook's bytes to the browser as a download. */
function saveXlsx(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
