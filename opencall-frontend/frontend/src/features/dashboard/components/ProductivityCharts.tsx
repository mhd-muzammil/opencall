"use client";

// The chart layer for Engineer Productivity. Three charts, each with a
// different job — no charting library, plain divs on a measured scale.
//
// Palettes are validated, not eyeballed (dataviz validator, light surface
// #ffffff):
//   funnel   ordinal blue #86b6ef -> #3987e5 -> #1c5cab  (monotone L, single hue)
//   rates    categorical slots 1-2 #2a78d6 / #eb6834      (CVD dE 24.7)
//   mix      categorical slots 1-5                        (worst adjacent CVD dE 9.1)
//
// The mix palette's aqua/yellow/magenta sit below 3:1 on white; the relief is
// the Location-wise Performance TABLE above, which carries every value in text.
//
// Regions are nominal, so a bar's colour never encodes its own value — that
// would double-encode length as hue. Good/bad is read positionally against the
// target rule instead, and the table keeps the colour bands.

// Default React import (not just types): vitest compiles JSX with the classic
// transform, which needs the React identifier at runtime (same as EditRecordModal.tsx).
import React from "react";
import {
  formatPercent,
  type LocationComparisonRow,
} from "./productivityAnalytics";

// ---------------------------------------------------------------- chart chrome

const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#ffffff",
};

const FUNNEL_STEPS = ["#86b6ef", "#3987e5", "#1c5cab"] as const;

const RATE_SERIES = [
  { key: "attendance", label: "Attended of assigned", color: "#2a78d6" },
  { key: "close", label: "Closed of attended", color: "#eb6834" },
] as const;

const MIX_SERIES = [
  { key: "closed", label: "Closed", color: "#2a78d6" },
  { key: "partOrdered", label: "Part ordered", color: "#eb6834" },
  { key: "underObservation", label: "Under observation", color: "#1baf7a" },
  { key: "cxReschedule", label: "Customer pending", color: "#eda100" },
  { key: "engineerDelay", label: "Engineer delay", color: "#e87ba4" },
  // Not a categorical slot: the leftover is deliberately recessive so it never
  // competes with a real outcome.
  { key: "otherOrPending", label: "Other / not actioned", color: "#c3c2b7" },
] as const;

/** The band a rate must clear to read as healthy — the sheet's green threshold. */
const TARGET_PERCENT = 90;

const CARD: React.CSSProperties = {
  background: INK.surface,
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "18px 20px",
};

function ChartCard({
  title,
  subtitle,
  legend,
  children,
}: Readonly<{
  title: string;
  subtitle: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: "13px", fontWeight: 800, color: INK.primary }}>{title}</div>
      <div style={{ fontSize: "11px", color: INK.secondary, marginBottom: "12px" }}>
        {subtitle}
      </div>
      {legend}
      {children}
    </div>
  );
}

/**
 * Identity never rests on colour alone: every multi-series chart carries this.
 * The swatch is the coloured mark; the text stays in ink.
 */
function Legend({
  items,
}: Readonly<{ items: ReadonlyArray<{ label: string; color: string }> }>) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", margin: "0 0 14px" }}>
      {items.map((item) => (
        <span
          key={item.label}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: INK.secondary }}
        >
          <span
            style={{ width: "10px", height: "10px", borderRadius: "3px", background: item.color, flexShrink: 0 }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Hairline gridlines + the target rule, behind the marks. */
function PercentGrid({ showTarget }: Readonly<{ showTarget: boolean }>) {
  return (
    <>
      {[0, 25, 50, 75, 100].map((tick) => (
        <span
          key={tick}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${tick}%`,
            top: 0,
            bottom: 0,
            width: "1px",
            background: tick === 0 ? INK.baseline : INK.grid,
          }}
        />
      ))}
      {showTarget && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${TARGET_PERCENT}%`,
            top: 0,
            bottom: 0,
            width: "1px",
            background: INK.muted,
          }}
        />
      )}
    </>
  );
}

function PercentAxis({ showTarget }: Readonly<{ showTarget: boolean }>) {
  return (
    <div style={{ position: "relative", height: "16px", marginTop: "4px" }}>
      {[0, 25, 50, 75, 100].map((tick) => (
        <span
          key={tick}
          style={{
            position: "absolute",
            left: `${tick}%`,
            transform: tick === 100 ? "translateX(-100%)" : tick === 0 ? "none" : "translateX(-50%)",
            fontSize: "10px",
            color: INK.muted,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tick}%
        </span>
      ))}
      {showTarget && (
        <span
          style={{
            position: "absolute",
            left: `${TARGET_PERCENT}%`,
            transform: "translateX(-50%)",
            top: "-2px",
            fontSize: "10px",
            fontWeight: 700,
            color: INK.muted,
            background: INK.surface,
            padding: "0 3px",
          }}
        >
          target
        </span>
      )}
    </div>
  );
}

const LABEL_COL = "116px";
const VALUE_COL = "56px";

// ------------------------------------------------------------------- 1. funnel

/**
 * Assigned -> Attended -> Closed for the whole selection.
 *
 * Ordered stages, so the ordinal ramp (one hue, light to dark) carries the
 * progression. One series, so no legend box — the stage labels are the identity.
 */
export function ConversionFunnel({ total }: Readonly<{ total: LocationComparisonRow }>) {
  const stages = [
    { label: "Assigned", value: total.assigned, color: FUNNEL_STEPS[0] },
    { label: "Attended", value: total.attended, color: FUNNEL_STEPS[1] },
    { label: "Closed", value: total.closed, color: FUNNEL_STEPS[2] },
  ];
  const base = total.assigned;

  return (
    <ChartCard
      title="Call conversion funnel"
      subtitle="Where the day's booked calls ended up, across the current selection"
    >
      <div style={{ display: "grid", gap: "10px" }}>
        {stages.map((stage, index) => {
          const share = base > 0 ? (stage.value / base) * 100 : 0;
          const previous = index === 0 ? null : stages[index - 1];
          const stepPercent =
            previous && previous.value > 0 ? (stage.value / previous.value) * 100 : null;
          return (
            <div
              key={stage.label}
              style={{ display: "grid", gridTemplateColumns: `${LABEL_COL} 1fr ${VALUE_COL}`, gap: "10px", alignItems: "center" }}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: INK.secondary }}>
                  {stage.label}
                </div>
                {stepPercent !== null && (
                  <div style={{ fontSize: "10px", color: INK.muted }}>
                    {stepPercent.toFixed(1)}% of {previous?.label.toLowerCase()}
                  </div>
                )}
              </div>
              {/* The value rides its own column rather than floating past the
                  bar end: at 100% an absolutely-placed label would sit outside
                  the plot and be clipped. */}
              <div
                title={`${stage.label}: ${stage.value} of ${base} assigned`}
                style={{
                  width: `${Math.max(0, Math.min(100, share))}%`,
                  minWidth: stage.value > 0 ? "2px" : 0,
                  height: "22px",
                  background: stage.color,
                  // Square at the baseline, rounded at the data end.
                  borderRadius: "0 4px 4px 0",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: INK.primary,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {stage.value}
                <span style={{ color: INK.muted, fontWeight: 500, fontSize: "10px" }}>
                  {" "}
                  {share.toFixed(0)}%
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* What the funnel implies, stated rather than left to be inferred from
          the gaps between bars. */}
      <div
        style={{
          display: "grid",
          gap: "6px",
          marginTop: "16px",
          paddingTop: "14px",
          borderTop: `1px solid ${INK.grid}`,
        }}
      >
        <FunnelLoss
          count={total.assigned - total.attended}
          label="assigned but never attended"
          detail="customer pending, engineer delay, or still booked"
        />
        <FunnelLoss
          count={total.attended - total.closed}
          label="attended but not closed"
          detail="part ordered, under observation, or still open"
        />
      </div>
    </ChartCard>
  );
}

function FunnelLoss({
  count,
  label,
  detail,
}: Readonly<{ count: number; label: string; detail: string }>) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", fontSize: "11px" }}>
      <span style={{ fontSize: "14px", fontWeight: 800, color: INK.primary, fontVariantNumeric: "tabular-nums" }}>
        {Math.max(0, count)}
      </span>
      <span style={{ color: INK.secondary, fontWeight: 600 }}>{label}</span>
      <span style={{ color: INK.muted }}>— {detail}</span>
    </div>
  );
}

// ------------------------------------------------------- 2. conversion by region

/**
 * Both conversion rates per region, as a grouped bar.
 *
 * Two series, so categorical colour carries identity and the legend is
 * mandatory. The colour belongs to the METRIC, not the region — filtering
 * regions never repaints the survivors.
 */
export function RegionRateChart({ rows }: Readonly<{ rows: readonly LocationComparisonRow[] }>) {
  return (
    <ChartCard
      title="Conversion rate by location"
      subtitle={`Attendance and same-day close rates against a ${TARGET_PERCENT}% target`}
      legend={<Legend items={RATE_SERIES.map((s) => ({ label: s.label, color: s.color }))} />}
    >
      <div style={{ display: "grid", gap: "12px" }}>
        {rows.map((row) => {
          const values = [
            { ...RATE_SERIES[0], percent: row.assignedVsAttendedPercent, of: `${row.attended} of ${row.assigned} assigned` },
            { ...RATE_SERIES[1], percent: row.attendedVsClosedPercent, of: `${row.closed} of ${row.attended} attended` },
          ];
          return (
            <div
              key={row.regionName}
              style={{ display: "grid", gridTemplateColumns: `${LABEL_COL} 1fr ${VALUE_COL}`, gap: "10px", alignItems: "center" }}
            >
              <span style={{ fontSize: "12px", fontWeight: 600, color: INK.secondary, textAlign: "right" }}>
                {row.regionName}
              </span>
              <div style={{ position: "relative", display: "grid", gap: "2px" }}>
                <PercentGrid showTarget />
                {values.map((value) => (
                  <div
                    key={value.key}
                    title={`${row.regionName} — ${value.label}: ${formatPercent(value.percent)} (${value.of})`}
                    style={{
                      position: "relative",
                      height: "11px",
                      width: `${Math.max(0, Math.min(100, value.percent ?? 0))}%`,
                      minWidth: (value.percent ?? 0) > 0 ? "2px" : 0,
                      background: value.color,
                      borderRadius: "0 4px 4px 0",
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: INK.secondary,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.35,
                }}
              >
                {formatPercent(row.assignedVsAttendedPercent)}
                <br />
                {formatPercent(row.attendedVsClosedPercent)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `${LABEL_COL} 1fr ${VALUE_COL}`, gap: "10px" }}>
        <span />
        <PercentAxis showTarget />
        <span />
      </div>
    </ChartCard>
  );
}

// ------------------------------------------------------------- 3. outcome mix

/**
 * How each region's assigned calls actually ended — a part-to-whole stack.
 *
 * Absolute widths against the busiest region, so the bars show volume as well
 * as mix. Interior segments carry no inline label (they have no free end and
 * would clip); the legend, the tooltip and the table above carry the values.
 */
export function OutcomeMixChart({ rows }: Readonly<{ rows: readonly LocationComparisonRow[] }>) {
  const busiest = rows.reduce((max, row) => Math.max(max, row.assigned), 0);

  return (
    <ChartCard
      title="Outcome mix by location"
      subtitle="What happened to every assigned call, sized by the busiest location"
      legend={<Legend items={MIX_SERIES.map((s) => ({ label: s.label, color: s.color }))} />}
    >
      <div style={{ display: "grid", gap: "10px" }}>
        {rows.map((row) => (
          <div
            key={row.regionName}
            style={{ display: "grid", gridTemplateColumns: `${LABEL_COL} 1fr ${VALUE_COL}`, gap: "10px", alignItems: "center" }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: INK.secondary, textAlign: "right" }}>
              {row.regionName}
            </span>
            <div
              style={{
                display: "flex",
                // The 2px surface gap is what separates touching segments —
                // never a border, which would add ink that is not data.
                gap: "2px",
                height: "20px",
                width: busiest > 0 ? `${(row.assigned / busiest) * 100}%` : "0%",
              }}
            >
              {MIX_SERIES.map((series) => {
                const value = row[series.key];
                if (value <= 0) return null;
                return (
                  <div
                    key={series.key}
                    title={`${row.regionName} — ${series.label}: ${value} of ${row.assigned} assigned`}
                    style={{
                      flexGrow: value,
                      flexBasis: 0,
                      background: series.color,
                      borderRadius: "2px",
                    }}
                  />
                );
              })}
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: INK.secondary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row.assigned}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
