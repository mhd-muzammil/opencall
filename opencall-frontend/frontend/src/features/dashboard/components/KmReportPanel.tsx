"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { clearSession } from "../../../lib/session";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getRosterKmDays,
  type EngineerKmDays,
  type RosterKmDaysResult,
} from "../../../lib/payrollTrackingApiClient";
import { filterKmRows, formatKm, kmRegions, kmTotals, regionTone } from "../../../lib/kmReport";
import { billCycleFor, billCycleForKey, type BillCycle } from "../utils/billCycle";
import { todayIsoDate } from "../utils/dateUtils";

/**
 * KM REPORT: how far every FSE travelled, day by day, over a bill cycle.
 *
 * Laid out like Payroll's attendance Report View -- one row per engineer, one
 * column per day, the total at the end -- because that is the sheet the office
 * reads a month from. Each day's figure is the one the live tracking board shows
 * for that engineer on that day, and each row's total is the one Engineer
 * Productivity shows for the cycle: the same Payroll answers, never re-measured.
 *
 * The engineers are our register, as on the board, and only those Payroll
 * recognises: a register name Payroll cannot resolve has no tracking at all, so
 * a row of dashes for it would say nothing.
 */

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "2026-10-13" -> "13". */
const dayOfMonth = (iso: string) => String(Number(iso.slice(8, 10)));

/** "2026-10-13" -> "Tue". */
const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

/** "2026-10-13" -> "13 Oct 2026". */
const fullDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const nextCycle = (cycle: BillCycle) => billCycleFor(addDays(cycle.toIso, 1));
const previousCycle = (cycle: BillCycle) => billCycleFor(addDays(cycle.fromIso, -1));

// Frozen columns: their widths are fixed so each knows where the next begins.
const SNO_W = 48;
const NAME_W = 180;
const PLACE_W = 112;

const cellBase: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

// Border-box, or the padding is added to the width and each frozen column
// comes out wider than the offset the next one is pinned at -- the next one
// then sits over the end of it once the days scroll.
const frozen = (left: number, width: number, background: string, z: number): CSSProperties => ({
  position: "sticky",
  left,
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
  background,
  zIndex: z,
});

function SummaryTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fff",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

export interface KmReportPanelProps {
  token: string | null;
  /** Inside the main app's panel, which supplies the heading. */
  embedded?: boolean;
}

export default function KmReportPanel({ token, embedded = false }: KmReportPanelProps) {
  const today = todayIsoDate();
  const currentKey = billCycleFor(today).key;
  const [cycleKey, setCycleKey] = useState(currentKey);
  const cycle = billCycleForKey(cycleKey);
  const isCurrent = cycleKey >= currentKey;

  const [result, setResult] = useState<RosterKmDaysResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  // "" is All Regions.
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token || sessionExpired) return;
    let active = true;
    setLoading(true);
    setError(null);
    getRosterKmDays(token, cycle.fromIso, cycle.toIso)
      .then((res) => {
        if (!active) return;
        setResult(res);
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) {
          setSessionExpired(true);
          return;
        }
        setResult(null);
        setError(e instanceof Error ? e.message : "Failed to load the kilometres");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, cycle.fromIso, cycle.toIso, sessionExpired]);

  const days = useMemo(() => result?.days ?? [], [result]);
  const engineers = useMemo<EngineerKmDays[]>(
    () => (result?.engineers ?? []).filter((row) => row.matched),
    [result],
  );
  const notInPayroll = (result?.engineers.length ?? 0) - engineers.length;
  const regions = useMemo(() => kmRegions(engineers), [engineers]);
  // A region the new cycle has nobody in falls back to All.
  const activeRegion = regions.some((r) => r.key === region) ? region : "";
  const shown = useMemo(
    () => filterKmRows(engineers, activeRegion, query),
    [engineers, activeRegion, query],
  );
  const totals = useMemo(() => kmTotals(shown, days), [shown, days]);
  const average = shown.length ? Math.round((totals.total / shown.length) * 100) / 100 : 0;
  const configured = result?.configured ?? true;

  const boxes = [
    { key: "", name: "All Regions", count: engineers.length },
    ...regions.map((r) => ({ key: r.key, name: r.name, count: r.count })),
  ];

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!embedded && <h1 style={{ fontSize: 20, fontWeight: 600 }}>KM Report</h1>}
          {/* The bill cycle, 25th to 24th -- the period Payroll pays by. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              aria-label="Previous cycle"
              onClick={() => setCycleKey(previousCycle(cycle).key)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              ‹
            </button>
            <div
              data-testid="km-cycle"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {cycle.monthLabel} · {cycle.label}
            </div>
            <button
              type="button"
              aria-label="Next cycle"
              disabled={isCurrent}
              onClick={() => setCycleKey(nextCycle(cycle).key)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: isCurrent ? "#f3f4f6" : "#fff",
                color: isCurrent ? "#9ca3af" : "inherit",
                cursor: isCurrent ? "default" : "pointer",
                font: "inherit",
              }}
            >
              ›
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: "1 1 auto", justifyContent: "flex-end" }}>
          <SummaryTile value={formatKm(totals.total) === "-" ? "0" : formatKm(totals.total)} label="Total km" />
          <SummaryTile value={String(shown.length)} label={shown.length === 1 ? "FSE" : "FSEs"} />
          <SummaryTile value={formatKm(average) === "-" ? "0" : formatKm(average)} label="Average km per FSE" />
        </div>
      </div>

      {/* A box per region and one for everybody, each in its own colour: a
          tint until it is picked, filled when it is. */}
      {engineers.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
          {boxes.map((box) => {
            const picked = activeRegion === box.key;
            const tone = regionTone(box.key);
            return (
              <button
                key={box.key || "all"}
                type="button"
                data-testid="km-region"
                aria-pressed={picked}
                onClick={() => setRegion(box.key)}
                style={{
                  flex: "0 0 auto",
                  minWidth: 132,
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${tone.accent}`,
                  background: picked ? tone.accent : tone.tint,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: picked ? "#fff" : tone.accent }}>
                  {box.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: picked ? "rgba(255,255,255,0.85)" : "#6b7280",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {box.count} {box.count === 1 ? "FSE" : "FSEs"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FSE…"
          aria-label="Search FSE"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            minWidth: 220,
            font: "inherit",
          }}
        />
        {loading && (
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            Adding up {cycle.label}… (one Payroll question per day, so a whole cycle takes a few seconds)
          </span>
        )}
      </div>

      {sessionExpired && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>Your login has expired.</strong> Sign in again and the report fills straight back up.
          </span>
          <button
            type="button"
            onClick={() => {
              clearSession();
              window.location.replace("/");
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #b45309",
              background: "#b45309",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign in again
          </button>
        </div>
      )}
      {!configured && !sessionExpired && (
        <p style={{ color: "#b45309", marginTop: 12 }}>
          Payroll integration is not configured. Set PAYROLL_API_URL / PAYROLL_API_USER /
          PAYROLL_API_PASSWORD in the OpenCall backend environment.
        </p>
      )}
      {error && !sessionExpired && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}

      {!loading && !error && !sessionExpired && configured && result && shown.length === 0 && (
        <p style={{ color: "#6b7280", marginTop: 16 }}>
          {engineers.length === 0
            ? `No FSE kilometres for ${cycle.label}.`
            : "No FSE matches this region and search."}
        </p>
      )}

      {shown.length > 0 && (
        <div
          data-testid="km-grid"
          style={{
            marginTop: 12,
            overflow: "auto",
            maxHeight: "calc(100vh - 320px)",
            minHeight: 240,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...cellBase, ...frozen(0, SNO_W, "#f9fafb", 4), top: 0, textAlign: "center", color: "#1d4ed8" }}>
                  S.no
                </th>
                <th style={{ ...cellBase, ...frozen(SNO_W, NAME_W, "#f9fafb", 4), top: 0, textAlign: "left", color: "#1d4ed8" }}>
                  FSE
                </th>
                <th
                  style={{
                    ...cellBase,
                    ...frozen(SNO_W + NAME_W, PLACE_W, "#f9fafb", 4),
                    top: 0,
                    textAlign: "left",
                    color: "#1d4ed8",
                  }}
                >
                  Region
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    title={fullDate(day)}
                    style={{
                      ...cellBase,
                      position: "sticky",
                      top: 0,
                      zIndex: 3,
                      minWidth: 60,
                      textAlign: "center",
                      // Sundays shaded, so a week reads as a week.
                      background: isSunday(day) ? "#f1f5f9" : "#f9fafb",
                      color: "#b45309",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{dayOfMonth(day)}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>{weekday(day)}</div>
                  </th>
                ))}
                <th style={{ ...cellBase, position: "sticky", top: 0, zIndex: 3, background: "#f9fafb", color: "#1d4ed8" }}>
                  Days
                </th>
                <th style={{ ...cellBase, position: "sticky", top: 0, zIndex: 3, background: "#f9fafb", color: "#1d4ed8" }}>
                  Total km
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={`${row.engineer_id ?? "x"}-${row.engineer_name}`} data-testid="km-row">
                  <td style={{ ...cellBase, ...frozen(0, SNO_W, "#fff", 2), textAlign: "center" }}>{index + 1}</td>
                  <td
                    style={{
                      ...cellBase,
                      ...frozen(SNO_W, NAME_W, "#fff", 2),
                      fontWeight: 600,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {row.engineer_name}
                  </td>
                  <td style={{ ...cellBase, ...frozen(SNO_W + NAME_W, PLACE_W, "#fff", 2) }}>{row.branch ?? "—"}</td>
                  {days.map((day) => {
                    const km = formatKm(row.days[day]);
                    return (
                      <td
                        key={day}
                        title={`${row.engineer_name} · ${fullDate(day)}`}
                        style={{
                          ...cellBase,
                          textAlign: "center",
                          background: isSunday(day) ? "#f8fafc" : "#fff",
                          color: km === "-" ? "#9ca3af" : "#111827",
                        }}
                      >
                        {km}
                      </td>
                    );
                  })}
                  <td style={{ ...cellBase, textAlign: "center" }}>{row.days_tracked}</td>
                  <td style={{ ...cellBase, textAlign: "right", fontWeight: 700, color: "#1d4ed8" }} data-testid="km-total">
                    {formatKm(row.distance_km) === "-" ? "0" : formatKm(row.distance_km)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* Each day's total over the FSEs on screen, and the cycle's. */}
              <tr data-testid="km-footer">
                <td
                  colSpan={3}
                  style={{
                    ...cellBase,
                    ...frozen(0, SNO_W + NAME_W + PLACE_W, "#f9fafb", 4),
                    position: "sticky",
                    bottom: 0,
                    fontWeight: 700,
                  }}
                >
                  Total
                </td>
                {days.map((day) => (
                  <td
                    key={day}
                    style={{
                      ...cellBase,
                      position: "sticky",
                      bottom: 0,
                      zIndex: 3,
                      background: "#f9fafb",
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    {formatKm(totals.byDay[day])}
                  </td>
                ))}
                <td style={{ ...cellBase, position: "sticky", bottom: 0, zIndex: 3, background: "#f9fafb" }} />
                <td
                  style={{
                    ...cellBase,
                    position: "sticky",
                    bottom: 0,
                    zIndex: 3,
                    background: "#f9fafb",
                    textAlign: "right",
                    fontWeight: 700,
                    color: "#1d4ed8",
                  }}
                >
                  {formatKm(totals.total) === "-" ? "0" : formatKm(totals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {notInPayroll > 0 && !loading && (
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 10 }}>
          {notInPayroll} {notInPayroll === 1 ? "engineer" : "engineers"} in the register{" "}
          {notInPayroll === 1 ? "is" : "are"} not in Payroll, so there is no tracking to report for them.
        </p>
      )}
    </div>
  );
}
