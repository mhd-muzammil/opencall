"use client";

import type { CSSProperties } from "react";
import { DAY_SUMMARY_ROWS, type DayReportColumn, type DayReportLine, type DayReportRowSpec } from "../../../lib/dayReport";

/**
 * A Day Report sheet as the office's own sheet looks: a plain black grid on
 * white, black text, the field names on the left and every value centred --
 * their sample, on screen -- under a heading in the app's indigo. The Date and
 * Name rows and the field names stay in view while a wide or long sheet
 * scrolls. The Summary's short rows by default; the Table view lays the full
 * rows out the same way.
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

/** A sheet's colours: the Date row, the Name row, the field names down the side, the Total km row. */
export interface SheetColours {
  date: string;
  name: string;
  side: string;
  km: string;
}

/** The Summary's: the dates on the app's indigo, the names on sky blue, light indigo down the side, the km on light green. */
export const SUMMARY_COLOURS: SheetColours = { date: "#4f46e5", name: "#0284c7", side: "#e0e7ff", km: "#dcfce7" };

/** The Table's, told apart from the Summary's: the dates on teal, the names on deep teal, light teal down the side, the km on light amber. */
export const TABLE_COLOURS: SheetColours = { date: "#0f766e", name: "#134e4a", side: "#ccfbf1", km: "#fef3c7" };

/** The Date and Name rows: the heading, white, the names bold. */
const heading = (key: string, colours: SheetColours): CSSProperties => ({
  background: key === "name" ? colours.name : colours.date,
  color: "#fff",
  fontWeight: key === "name" ? 700 : 600,
});

/**
 * One line of a cell, in black; a place is a link, coloured as Excel colours
 * one. A time before the place stays out of the link, so only the place is
 * underlined.
 */
function SheetLine({ line }: { line: DayReportLine }) {
  if (!line.href) return <div>{line.text}</div>;
  const lead = line.lead && line.text.startsWith(line.lead) ? line.lead : "";
  const rest = line.text.slice(lead.length);
  const dot = lead && rest.startsWith(" · ") ? " · " : "";
  return (
    <div>
      {lead}
      {dot}
      <a href={line.href} target="_blank" rel="noreferrer" style={{ color: "#0563c1" }}>
        {rest.slice(dot.length)}
      </a>
    </div>
  );
}

export default function DaySummarySheet({
  columns,
  rows = DAY_SUMMARY_ROWS,
  testId = "day-summary-sheet",
  colours = SUMMARY_COLOURS,
}: {
  columns: DayReportColumn[];
  rows?: DayReportRowSpec[];
  testId?: string;
  colours?: SheetColours;
}) {
  return (
    <div
      data-testid={testId}
      style={{ marginTop: 10, overflow: "auto", maxHeight: "calc(100vh - 320px)", minHeight: 240, background: "#fff" }}
    >
      <table style={{ borderCollapse: "separate", borderSpacing: 0, borderTop: GRID, borderLeft: GRID }}>
        <thead>
          {rows.slice(0, 2).map((spec, index) => (
            <tr key={spec.key}>
              <th scope="row" style={{ ...labelCell, ...heading(spec.key, colours), top: index * HEAD_H, zIndex: 3, height: HEAD_H }}>
                {spec.label}
              </th>
              {columns.map((column) => (
                <th
                  key={`${column.day}|${column.engineerId}`}
                  style={{
                    ...cellBase,
                    ...heading(spec.key, colours),
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
          {rows.slice(2).map((spec) => (
            <tr key={spec.key}>
              <th scope="row" style={{ ...labelCell, background: spec.key === "km" ? colours.km : colours.side, top: "auto", zIndex: 1 }}>
                {spec.label}
              </th>
              {columns.map((column) => {
                const lines = spec.lines(column);
                return (
                  <td
                    key={`${column.day}|${column.engineerId}`}
                    style={{
                      ...cellBase,
                      background: spec.key === "km" ? colours.km : "#fff",
                      width: COLUMN_W,
                      minWidth: COLUMN_W,
                      maxWidth: COLUMN_W,
                      overflowWrap: "anywhere",
                    }}
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
