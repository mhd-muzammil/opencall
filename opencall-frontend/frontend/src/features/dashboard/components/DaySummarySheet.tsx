"use client";

import type { CSSProperties } from "react";
import { DAY_SUMMARY_ROWS, type DayReportColumn, type DayReportLine } from "../../../lib/dayReport";

/**
 * The Summary as the office's own sheet looks: a plain black grid on white,
 * black text, the field names on the left and every value centred -- their
 * sample, on screen -- under a heading in the app's indigo. The Date and Name
 * rows and the field names stay in view while a wide or long sheet scrolls.
 */

const LABEL_W = 190;
const COLUMN_W = 200;
const HEAD_H = 34;
const GRID = "1px solid #000";
// Excel's own face, where the machine has it.
const SHEET_FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

// The app's table rules (globals.css) make every cell nowrap and every th an
// uppercase header stuck to the top; each is said otherwise here.
const cellBase: CSSProperties = {
  border: "none",
  borderRight: GRID,
  borderBottom: GRID,
  padding: "4px 8px",
  boxSizing: "border-box",
  fontFamily: SHEET_FONT,
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.35,
  color: "#000",
  background: "#fff",
  textTransform: "none",
  letterSpacing: "normal",
  whiteSpace: "normal",
  verticalAlign: "middle",
  textAlign: "center",
};

const labelCell: CSSProperties = {
  ...cellBase,
  position: "sticky",
  left: 0,
  width: LABEL_W,
  minWidth: LABEL_W,
  maxWidth: LABEL_W,
  textAlign: "left",
};

/** The Date and Name rows: the heading, white -- the dates on the app's indigo, the names bold on sky blue. */
const heading = (key: string): CSSProperties => ({
  background: key === "name" ? "#0284c7" : "#4f46e5",
  color: "#fff",
  fontWeight: key === "name" ? 700 : 600,
});

/** The field names down the side, on a light indigo. */
const SIDE_TINT = "#e0e7ff";

/** One line of a cell, in black; a place is a link, coloured as Excel colours one. */
function SheetLine({ line }: { line: DayReportLine }) {
  return (
    <div>
      {line.href ? (
        <a href={line.href} target="_blank" rel="noreferrer" style={{ color: "#0563c1" }}>
          {line.text}
        </a>
      ) : (
        line.text
      )}
    </div>
  );
}

export default function DaySummarySheet({ columns }: { columns: DayReportColumn[] }) {
  return (
    <div
      data-testid="day-summary-sheet"
      style={{ marginTop: 10, overflow: "auto", maxHeight: "calc(100vh - 320px)", minHeight: 240, background: "#fff" }}
    >
      <table style={{ borderCollapse: "separate", borderSpacing: 0, borderTop: GRID, borderLeft: GRID }}>
        <thead>
          {DAY_SUMMARY_ROWS.slice(0, 2).map((spec, index) => (
            <tr key={spec.key}>
              <th scope="row" style={{ ...labelCell, ...heading(spec.key), top: index * HEAD_H, zIndex: 3, height: HEAD_H }}>
                {spec.label}
              </th>
              {columns.map((column) => (
                <th
                  key={`${column.day}|${column.engineerId}`}
                  style={{
                    ...cellBase,
                    ...heading(spec.key),
                    position: "sticky",
                    top: index * HEAD_H,
                    zIndex: 2,
                    height: HEAD_H,
                    width: COLUMN_W,
                    minWidth: COLUMN_W,
                    maxWidth: COLUMN_W,
                  }}
                >
                  {spec.lines(column)[0]?.text}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {DAY_SUMMARY_ROWS.slice(2).map((spec) => (
            <tr key={spec.key}>
              <th scope="row" style={{ ...labelCell, background: SIDE_TINT, top: "auto", zIndex: 1 }}>
                {spec.label}
              </th>
              {columns.map((column) => {
                const lines = spec.lines(column);
                return (
                  <td
                    key={`${column.day}|${column.engineerId}`}
                    style={{ ...cellBase, width: COLUMN_W, minWidth: COLUMN_W, maxWidth: COLUMN_W, overflowWrap: "anywhere" }}
                  >
                    {lines.length === 0 ? "-" : lines.map((line, lineIndex) => <SheetLine key={lineIndex} line={line} />)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
