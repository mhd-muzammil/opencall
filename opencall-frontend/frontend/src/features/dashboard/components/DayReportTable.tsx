"use client";

import { Fragment, type CSSProperties } from "react";
import { DAY_REPORT_ROWS, type DayReportColumn, type DayReportLine } from "../../../lib/dayReport";

/**
 * The Day Report as the office's sheet: the fields down, one column per
 * FSE-day across -- the layout of the downloaded Excel, for comparing many
 * FSE-days side by side.
 */

// Frozen label column, and the two header rows, at fixed sizes so each knows
// where the next begins.
const LABEL_W = 168;
const HEAD_H = 30;
// Each FSE-day's width. A long address wraps inside it rather than running on
// over the next FSE's column.
const COLUMN_W = 260;

// The app's table rules (globals.css) make every cell nowrap and every th an
// uppercase header stuck to the top; each is said otherwise here, for this
// table only.
const cellBase: CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  verticalAlign: "top",
  boxSizing: "border-box",
  fontSize: 12.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
  textTransform: "none",
  letterSpacing: "normal",
  color: "#111827",
};

const TONE_COLOR: Record<NonNullable<DayReportLine["tone"]>, string> = {
  alert: "#b91c1c",
  warn: "#b45309",
  good: "#15803d",
  muted: "#9ca3af",
};

/** One line of a cell: its time in bold, its place a link, its colour its meaning. */
function LineView({ line }: { line: DayReportLine }) {
  if (line.text === "-" && !line.tone) return <div style={{ color: "#9ca3af" }}>-</div>;
  const lead = line.lead && line.text.startsWith(line.lead) ? line.lead : "";
  const rest = line.text.slice(lead.length);
  // The dot after the time stays out of the link, so only the place is underlined.
  const dot = lead && rest.startsWith(" · ") ? " · " : "";
  const tail = rest.slice(dot.length);
  return (
    <div
      style={{
        color: line.tone ? TONE_COLOR[line.tone] : undefined,
        fontWeight: line.tone === "alert" || line.tone === "good" ? 700 : undefined,
        fontStyle: line.tone === "muted" ? "italic" : undefined,
      }}
    >
      {lead && <strong style={{ fontWeight: 700, color: line.tone ? undefined : "#111827" }}>{lead}</strong>}
      {dot}
      {line.href ? (
        <a href={line.href} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
          {tail}
        </a>
      ) : (
        tail
      )}
    </div>
  );
}

export default function DayReportTable({ columns }: { columns: DayReportColumn[] }) {
  return (
    <div
      data-testid="day-report-grid"
      style={{
        marginTop: 10,
        overflow: "auto",
        maxHeight: "calc(100vh - 320px)",
        minHeight: 240,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          {DAY_REPORT_ROWS.slice(0, 2).map((spec, index) => (
            <tr key={spec.key}>
              <th
                scope="row"
                style={{
                  ...cellBase,
                  position: "sticky",
                  left: 0,
                  top: index * HEAD_H,
                  zIndex: 3,
                  width: LABEL_W,
                  minWidth: LABEL_W,
                  maxWidth: LABEL_W,
                  height: HEAD_H,
                  background: "#eef2ff",
                  textAlign: "left",
                  fontWeight: 700,
                }}
              >
                {spec.label}
              </th>
              {columns.map((column) => (
                <th
                  key={`${column.day}|${column.engineerId}`}
                  style={{
                    ...cellBase,
                    position: "sticky",
                    top: index * HEAD_H,
                    zIndex: 2,
                    height: HEAD_H,
                    width: COLUMN_W + 20,
                    minWidth: COLUMN_W + 20,
                    background: "#eef2ff",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    // The name is what a column is read by; the date sits above it, quieter.
                    fontWeight: spec.key === "name" ? 700 : 600,
                    fontSize: spec.key === "name" ? 13.5 : 12,
                    color: spec.key === "name" ? "#111827" : "#4b5563",
                  }}
                >
                  {spec.lines(column)[0]?.text}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {DAY_REPORT_ROWS.slice(2).map((spec, index, rows) => (
            <Fragment key={spec.key}>
              {/* A band where each group of rows begins: Duty, Calls, ... */}
              {spec.group !== rows[index - 1]?.group && (
                <tr data-testid="day-report-band">
                  <th
                    scope="rowgroup"
                    style={{
                      ...cellBase,
                      position: "sticky",
                      left: 0,
                      top: "auto",
                      zIndex: 1,
                      width: LABEL_W,
                      minWidth: LABEL_W,
                      maxWidth: LABEL_W,
                      background: "#e0e7ff",
                      color: "#3730a3",
                      textAlign: "left",
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "4px 10px",
                    }}
                  >
                    {spec.group}
                  </th>
                  <td colSpan={columns.length} style={{ ...cellBase, background: "#e0e7ff", padding: "4px 10px" }} />
                </tr>
              )}
              <tr>
                <th
                  scope="row"
                  style={{
                    ...cellBase,
                    position: "sticky",
                    left: 0,
                    // Not stuck to the top as the app's th is: only the two
                    // header rows are.
                    top: "auto",
                    zIndex: 1,
                    width: LABEL_W,
                    minWidth: LABEL_W,
                    maxWidth: LABEL_W,
                    background: "#f9fafb",
                    textAlign: "left",
                    fontWeight: 600,
                  }}
                >
                  {spec.label}
                </th>
                {columns.map((column) => {
                  const lines = spec.lines(column);
                  const value = lines[0]?.text;
                  return (
                    <td
                      key={`${column.day}|${column.engineerId}`}
                      style={{
                        ...cellBase,
                        textAlign: spec.list ? "left" : "center",
                        fontVariantNumeric: "tabular-nums",
                        ...(spec.key === "km" ? { fontWeight: 700, fontSize: 14 } : {}),
                      }}
                    >
                      <div style={{ width: COLUMN_W, overflowWrap: "anywhere" }}>
                        {lines.length === 0 ? (
                          <span style={{ color: "#9ca3af" }}>-</span>
                        ) : spec.chip && value !== "-" ? (
                          // A count as a pill in its own colour, as the KM Report colours them.
                          <span
                            style={{
                              display: "inline-block",
                              minWidth: 32,
                              padding: "1px 10px",
                              borderRadius: 999,
                              background: spec.chip.tint,
                              color: spec.chip.accent,
                              fontWeight: 700,
                            }}
                          >
                            {value}
                          </span>
                        ) : (
                          lines.map((line, lineIndex) => <LineView key={lineIndex} line={line} />)
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
