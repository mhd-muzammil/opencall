"use client";

// Location-wise performance — the ratio + chart block that sits BELOW the
// per-engineer table on Engineer Productivity. Purely additive: it reads the
// same filtered list the table renders and does not touch it.
//
// Mirrors the team's spreadsheet: a ranked location comparison and a bar chart
// of attendance conversion, with the same colour bands (green 90+, amber 70+,
// orange 50+, red below).
//
// The bars are plain divs rather than a charting library — one horizontal bar
// chart does not justify ~500KB of bundle, and this matches the hand-rolled
// progress bars already used by the Target tab.

// Default React import (not just types): vitest compiles JSX with the classic
// transform, which needs the React identifier at runtime (same as EditRecordModal.tsx).
import React, { useMemo } from "react";
import {
  BAND_COLOR,
  BAND_LEGEND,
  bandForPercent,
  buildLocationComparison,
  formatPercent,
  type LocationComparisonRow,
  type ProductivityListItem,
} from "./productivityAnalytics";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "18px 20px",
};

const TH: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #cbd5e1",
  fontSize: "12px",
  fontWeight: 700,
  color: "#334155",
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const TD: React.CSSProperties = {
  padding: "10px",
  border: "1px solid #cbd5e1",
  fontSize: "13px",
  textAlign: "center",
  color: "#334155",
};

/** A percentage cell tinted by its performance band. */
function PercentCell({ percent }: Readonly<{ percent: number | null }>) {
  const band = bandForPercent(percent);
  const colors = band ? BAND_COLOR[band] : null;
  return (
    <td
      style={{
        ...TD,
        fontWeight: 700,
        color: colors?.fg ?? "#94a3b8",
        background: colors?.bg ?? "transparent",
      }}
    >
      {formatPercent(percent)}
    </td>
  );
}

/**
 * One horizontal bar. Width is the percentage capped at 100 so a rate above
 * 100% (possible when a same-day closure was never booked) cannot overflow the
 * track, while the printed value still shows the true figure.
 */
function RatioBar({
  label,
  percent,
  caption,
}: Readonly<{ label: string; percent: number | null; caption: string }>) {
  const band = bandForPercent(percent);
  const colors = band ? BAND_COLOR[band] : null;
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 64px", gap: "10px", alignItems: "center" }}>
      <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", textAlign: "right" }}>
        {label}
      </span>
      <div
        style={{ height: "18px", background: "#f1f5f9", borderRadius: "9px", overflow: "hidden" }}
        role="img"
        aria-label={`${label}: ${formatPercent(percent)} (${caption})`}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: colors?.bar ?? "#cbd5e1",
            borderRadius: "9px",
            transition: "width 240ms ease",
          }}
        />
      </div>
      <span style={{ fontSize: "12px", fontWeight: 700, color: colors?.fg ?? "#94a3b8" }}>
        {formatPercent(percent)}
      </span>
    </div>
  );
}

function BarChart({
  title,
  subtitle,
  rows,
  pick,
  caption,
}: Readonly<{
  title: string;
  subtitle: string;
  rows: readonly LocationComparisonRow[];
  pick: (row: LocationComparisonRow) => number | null;
  caption: (row: LocationComparisonRow) => string;
}>) {
  // Ranked by the metric being charted, not by the table's ordering, so each
  // chart reads top-to-bottom as its own leaderboard.
  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const left = pick(a);
        const right = pick(b);
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left;
      }),
    [rows, pick],
  );

  return (
    <div style={CARD}>
      <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "14px" }}>{subtitle}</div>
      <div style={{ display: "grid", gap: "9px" }}>
        {ordered.map((row) => (
          <RatioBar
            key={row.regionName}
            label={row.regionName}
            percent={pick(row)}
            caption={caption(row)}
          />
        ))}
      </div>
    </div>
  );
}

export function LocationPerformancePanel({
  list,
  loading = false,
}: Readonly<{ list: readonly ProductivityListItem[]; loading?: boolean }>) {
  const { rows, total } = useMemo(() => buildLocationComparison(list), [list]);

  // Nothing to compare while the day is still loading or empty — the table
  // above already says so, and an empty chart frame reads as a broken widget.
  if (loading || rows.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "16px", marginTop: "20px" }}>
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
              Location-wise Performance
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Conversion rates per region, strongest attendance first. Follows the
              filters above.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {BAND_LEGEND.map(({ band, label }) => (
              <span key={band} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#475569" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: BAND_COLOR[band].bar }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: "14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ ...TH, textAlign: "left" }}>Location</th>
                <th style={TH}>Engineers</th>
                <th style={TH}>Assigned</th>
                <th style={TH}>Attended</th>
                <th style={TH}>Closed</th>
                <th style={TH}>Assigned vs Attended</th>
                <th style={TH}>Attended vs Closed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.regionName}>
                  <td style={{ ...TD, textAlign: "left", fontWeight: 600 }}>{row.regionName}</td>
                  <td style={TD}>{row.engineers}</td>
                  <td style={TD}>{row.assigned}</td>
                  <td style={{ ...TD, fontWeight: 700, color: "#0f172a" }}>{row.attended}</td>
                  <td style={{ ...TD, fontWeight: 700, color: "#166534" }}>{row.closed}</td>
                  <PercentCell percent={row.assignedVsAttendedPercent} />
                  <PercentCell percent={row.attendedVsClosedPercent} />
                </tr>
              ))}
              <tr style={{ background: "#fffbeb", fontWeight: "bold" }}>
                <td style={{ ...TD, textAlign: "left", fontWeight: 800 }}>{total.regionName}</td>
                <td style={{ ...TD, fontWeight: 800 }}>{total.engineers}</td>
                <td style={{ ...TD, fontWeight: 800 }}>{total.assigned}</td>
                <td style={{ ...TD, fontWeight: 800 }}>{total.attended}</td>
                <td style={{ ...TD, fontWeight: 800, color: "#166534" }}>{total.closed}</td>
                <PercentCell percent={total.assignedVsAttendedPercent} />
                <PercentCell percent={total.attendedVsClosedPercent} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <BarChart
          title="Assigned vs Attended %"
          subtitle="Of the calls booked to each region, how many the engineer actually attended"
          rows={rows}
          pick={(row) => row.assignedVsAttendedPercent}
          caption={(row) => `${row.attended} of ${row.assigned} assigned`}
        />
        <BarChart
          title="Attended vs Closed %"
          subtitle="Of the calls attended, how many were closed the same day"
          rows={rows}
          pick={(row) => row.attendedVsClosedPercent}
          caption={(row) => `${row.closed} of ${row.attended} attended`}
        />
      </div>
    </div>
  );
}
