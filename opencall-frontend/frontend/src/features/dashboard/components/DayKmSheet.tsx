"use client";

import type { CSSProperties, ReactNode } from "react";
import { sheetDate } from "../../../lib/dayReport";
import {
  dayKmText,
  kmPerPresentDayText,
  totalKmText,
  type DayKmLine,
  type DayKmReport,
} from "../../../lib/dayKmReport";

/**
 * The Day-wise KM Report as the office's own sheet has it: a line per FSE with
 * a column per day -- each day's km shaded deeper the further it went -- then
 * a line per location, each with a bar under its total km, the days present
 * and the km a present day. The names stay in view while a long period
 * scrolls across.
 */

const NAVY = "#1f3864";
const GRID = "1px solid #bfbfbf";
const SHEET_FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
// The deepest a day's km is shaded: the day that went furthest.
const HEAT = [250, 213, 189] as const;
const BAR = "#638ec6";
const TOTAL_ROW = "#d9e1f2";
const LOCATION_TEXT = "#008000";

const NO_W = 44;
const NAME_W = 160;
const PLACE_W = 120;
const DAY_W = 64;
const TOTAL_W = 120;
const PRESENT_W = 86;
const AVG_W = 104;

// The app's table rules (globals.css) make every th an uppercase header stuck
// to the top and shade every other row; each is said otherwise here.
const cellBase: CSSProperties = {
  border: "none",
  borderRight: GRID,
  borderBottom: GRID,
  padding: "3px 6px",
  boxSizing: "border-box",
  fontFamily: SHEET_FONT,
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.3,
  color: "#000",
  background: "#fff",
  textTransform: "none",
  letterSpacing: "normal",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
  fontVariantNumeric: "tabular-nums",
};

const width = (w: number): CSSProperties => ({ width: w, minWidth: w, maxWidth: w });

const headCell: CSSProperties = {
  ...cellBase,
  position: "static",
  background: NAVY,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  textAlign: "center",
  whiteSpace: "normal",
  height: 96,
};

/**
 * A cell stuck to the left while the days scroll across. The first carries the
 * sheet's left edge itself, so nothing shifts when the days start scrolling.
 */
const stuck = (left: number, z = 1): CSSProperties => ({
  position: "sticky",
  left,
  zIndex: z,
  ...(left === 0 ? { borderLeft: GRID } : {}),
});

/** White for no km, deepening to the shade of the furthest day. */
function heat(km: number, max: number): string {
  if (!km || max <= 0) return "#fff";
  const t = Math.min(km / max, 1);
  const mix = (full: number) => Math.round(255 + (full - 255) * t);
  return `rgb(${mix(HEAT[0])}, ${mix(HEAT[1])}, ${mix(HEAT[2])})`;
}

/** The total km over a bar as long as its share of the longest. */
function TotalKm({ km, max }: { km: number; max: number }) {
  const share = max > 0 && km > 0 ? Math.min(km / max, 1) : 0;
  return (
    <>
      {share > 0 && (
        <span
          data-testid="day-km-bar"
          aria-hidden
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            bottom: 3,
            // The longest at nine tenths of the cell, as Excel draws its bars.
            width: `${Math.round(share * 900) / 10}%`,
            background: `linear-gradient(90deg, ${BAR}, #fff)`,
          }}
        />
      )}
      <span style={{ position: "relative" }}>{totalKmText(km)}</span>
    </>
  );
}

function DateHead({ day }: { day: string }) {
  return (
    <th style={{ ...headCell, ...width(DAY_W), padding: "4px 0" }}>
      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", display: "inline-block" }}>
        {sheetDate(day)}
      </span>
    </th>
  );
}

/** One table of the report: the lines, their days, their totals, and the Total line. */
function KmTable({
  testId,
  lead,
  lines,
  total,
  days,
  shade,
  leadCells,
  totalCells,
}: {
  testId: string;
  /** The heads of the columns before the days, their widths, and centred ones. */
  lead: { label: string; w: number; centre?: boolean }[];
  lines: DayKmLine[];
  total: DayKmLine;
  days: string[];
  /** Shade each day's km by how far it went. */
  shade: boolean;
  leadCells: (line: DayKmLine, index: number) => ReactNode[];
  totalCells: ReactNode[];
}) {
  const maxDay = shade ? Math.max(0, ...lines.flatMap((line) => line.km)) : 0;
  const maxTotal = Math.max(0, ...lines.map((line) => line.total));
  const lefts = lead.map((_, index) => lead.slice(0, index).reduce((sum, column) => sum + column.w, 0));
  const leadStyle = (index: number, extra: CSSProperties = {}): CSSProperties => ({
    ...cellBase,
    ...width(lead[index]!.w),
    ...stuck(lefts[index]!),
    whiteSpace: "normal",
    textAlign: lead[index]!.centre ? "center" : "left",
    ...extra,
  });
  const totalRow: CSSProperties = { background: TOTAL_ROW, fontWeight: 700 };
  return (
    <div style={{ overflowX: "auto", background: "#fff" }}>
      <table
        data-testid={testId}
        // Its own columns' widths, not stretched to the page as the app's tables are.
        style={{ width: "max-content", minWidth: 0, borderCollapse: "separate", borderSpacing: 0, borderTop: GRID }}
      >
        <thead>
          <tr>
            {lead.map((column, index) => (
              <th key={column.label} style={{ ...headCell, ...width(column.w), ...stuck(lefts[index]!, 3) }}>
                {column.label}
              </th>
            ))}
            {days.map((day) => (
              <DateHead key={day} day={day} />
            ))}
            <th style={{ ...headCell, ...width(TOTAL_W) }}>Total KM</th>
            <th style={{ ...headCell, ...width(PRESENT_W) }}>Days Present</th>
            <th style={{ ...headCell, ...width(AVG_W) }}>Avg KM / Present Day</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, lineIndex) => (
            <tr key={`${line.name}|${lineIndex}`}>
              {leadCells(line, lineIndex).map((content, index) => (
                <td key={index} style={leadStyle(index)}>
                  {content}
                </td>
              ))}
              {line.km.map((km, index) => (
                <td
                  key={days[index]}
                  style={{ ...cellBase, ...width(DAY_W), textAlign: "right", background: shade ? heat(km, maxDay) : "#fff" }}
                >
                  {dayKmText(km)}
                </td>
              ))}
              <td style={{ ...cellBase, ...width(TOTAL_W), position: "relative", textAlign: "right", fontWeight: 700 }}>
                <TotalKm km={line.total} max={maxTotal} />
              </td>
              <td style={{ ...cellBase, ...width(PRESENT_W), textAlign: "center", fontWeight: 700 }}>{line.present}</td>
              <td style={{ ...cellBase, ...width(AVG_W), textAlign: "right", fontWeight: 700 }}>
                {kmPerPresentDayText(line)}
              </td>
            </tr>
          ))}
          <tr data-testid="day-km-total">
            {totalCells.map((content, index) => (
              <td key={index} style={leadStyle(index, totalRow)}>
                {content}
              </td>
            ))}
            {total.km.map((km, index) => (
              <td key={days[index]} style={{ ...cellBase, ...width(DAY_W), ...totalRow, textAlign: "right" }}>
                {dayKmText(km)}
              </td>
            ))}
            <td style={{ ...cellBase, ...width(TOTAL_W), ...totalRow, textAlign: "right" }}>{totalKmText(total.total)}</td>
            <td style={{ ...cellBase, ...width(PRESENT_W), ...totalRow, textAlign: "center" }}>{total.present}</td>
            <td style={{ ...cellBase, ...width(AVG_W), ...totalRow, textAlign: "right" }}>{kmPerPresentDayText(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: SHEET_FONT,
  fontWeight: 700,
  color: NAVY,
  textTransform: "none",
  letterSpacing: "normal",
};

export default function DayKmSheet({ report }: { report: DayKmReport }) {
  return (
    <div data-testid="day-km-report" style={{ marginTop: 10, display: "grid", gap: 6 }}>
      <h4 style={{ ...titleStyle, fontSize: 20 }}>Day-wise KM Report (Engineer-wise)</h4>
      <p style={{ margin: 0, fontFamily: SHEET_FONT, fontStyle: "italic", fontSize: 13, color: "#595959" }}>
        Source: the Total km row of the Day Report. &quot;-&quot; = no km that day. Days Present = days with a Login or km.
      </p>
      <KmTable
        testId="day-km-fses"
        lead={[
          { label: "S.No", w: NO_W, centre: true },
          { label: "Engineer", w: NAME_W },
          { label: "Location", w: PLACE_W },
        ]}
        lines={report.fses}
        total={report.total}
        days={report.days}
        shade
        leadCells={(line, index) => [
          index + 1,
          line.name,
          <span key="place" style={{ color: LOCATION_TEXT }}>
            {line.location || "-"}
          </span>,
        ]}
        totalCells={["", "Total KM (day)", ""]}
      />
      <h4 style={{ ...titleStyle, fontSize: 17, marginTop: 18 }}>Location-wise KM per Day</h4>
      <KmTable
        testId="day-km-locations"
        lead={[
          { label: "Location", w: NAME_W },
          { label: "Engineers", w: PLACE_W, centre: true },
        ]}
        lines={report.locations}
        total={report.total}
        days={report.days}
        shade={false}
        leadCells={(line) => [line.name, line.fses]}
        totalCells={["Total", report.total.fses]}
      />
    </div>
  );
}
