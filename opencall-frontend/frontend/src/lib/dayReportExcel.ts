// The Day Report as an Excel sheet, laid out like the office's own: one row
// per field, one column per FSE-day, every cell boxed. Built from the same
// rows the screen shows (dayReport.ts), so the file and the screen agree.

import type * as ExcelJSNS from "exceljs";
import { DAY_REPORT_ROWS, sheetText, type DayReportColumn } from "./dayReport";

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

/** The workbook's bytes. */
export async function buildDayReportWorkbook(columns: DayReportColumn[]): Promise<Uint8Array> {
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

  DAY_REPORT_ROWS.forEach((spec, rowIndex) => {
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
export async function downloadDayReportExcel(columns: DayReportColumn[], filename: string): Promise<void> {
  const bytes = await buildDayReportWorkbook(columns);
  const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
