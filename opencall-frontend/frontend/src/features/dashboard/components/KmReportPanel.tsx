"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { clearSession } from "../../../lib/session";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getEngineerDay,
  getRosterKmDays,
  type EngineerDay,
  type EngineerKmDays,
  type RosterKmDaysResult,
} from "../../../lib/payrollTrackingApiClient";
import type { MapEngineer } from "../../../components/LiveTrackingMap";
import { filterKmRows, formatKm, kmRegions, kmTotals, regionTone } from "../../../lib/kmReport";
import { dayRouteLayers } from "../../../lib/kmRoute";
import { billCycleFor, billCycleForKey, type BillCycle } from "../utils/billCycle";
import { todayIsoDate } from "../utils/dateUtils";
import RouteKmSection from "./RouteKmSection";

// The live tracking board's own map. Leaflet touches `window`, so it is
// client-only here too.
const LiveTrackingMap = dynamic(() => import("../../../components/LiveTrackingMap"), {
  ssr: false,
  loading: () => <div style={{ height: "100%" }} />,
});

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

// A km that can be clicked. Every part of the app's own button look -- a 40px
// filled pill with white text -- is undone, so the cell still reads as a cell.
const dayButton: CSSProperties = {
  font: "inherit",
  display: "block",
  width: "100%",
  minHeight: 0,
  margin: 0,
  padding: "8px 10px",
  border: 0,
  borderRadius: 0,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
  // The focus ring inside the cell, where the next cell cannot paint over it.
  outlineOffset: -2,
  // A figure can still be double-clicked and copied, as it could as plain text.
  userSelect: "text",
  WebkitUserSelect: "text",
};

// As tall as the table may grow, so the two end together, and never so short
// that a route cannot be read.
const MAP_HEIGHT = "max(360px, calc(100vh - 320px))";

// The report is history: the map draws the clicked day, no live positions.
const NO_ENGINEERS: MapEngineer[] = [];
const ignoreSelect = () => {};

/** The day the map is showing: one cell of the table. */
interface RoutePick {
  engineerId: number;
  name: string;
  day: string;
  /** The cell's figure, as the table printed it. */
  km: string;
  /**
   * This pick's own number. The map brings a route into view when its
   * selection changes, and two days of one engineer share an engineer id; the
   * answer fetched for a pick carries its number, so one pick's route is never
   * drawn under another's name.
   */
  seq: number;
}

type RouteAnswer =
  | { seq: number; status: "ready"; day: EngineerDay }
  | { seq: number; status: "failed"; message: string };

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
  // The day clicked in the table, and what came back for it.
  const [pick, setPick] = useState<RoutePick | null>(null);
  const [routeAnswer, setRouteAnswer] = useState<RouteAnswer | null>(null);
  const pickCount = useRef(0);
  const mapBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || sessionExpired) return;
    let active = true;
    setLoading(true);
    setError(null);
    // The last cycle's answer goes the moment another is asked for. Kept, its
    // km sat in the tiles and the table under the new cycle's label for the
    // whole of the new load -- and stayed there if that load came back 401.
    setResult(null);
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

  // The clicked day, from the same Payroll answer the board draws a day from.
  useEffect(() => {
    if (!token || sessionExpired || !pick) return;
    let active = true;
    const { seq } = pick;
    getEngineerDay(token, pick.engineerId, pick.day)
      .then((day) => {
        if (active) setRouteAnswer({ seq, status: "ready", day });
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) {
          // Ends where an expired login on a cycle ends: the banner and nothing
          // else. Left on screen, the km would be relabelled by the cycle
          // arrows, which load nothing while the login is gone.
          setResult(null);
          setSessionExpired(true);
          return;
        }
        setRouteAnswer({
          seq,
          status: "failed",
          message: e instanceof Error ? e.message : "Failed to load the route",
        });
      });
    return () => {
      active = false;
    };
  }, [token, sessionExpired, pick]);

  // Only the answer for THIS pick. Between a click and its answer the last
  // pick's route would otherwise stay drawn under the new name.
  const answer = pick && routeAnswer?.seq === pick.seq ? routeAnswer : null;
  const routeDay = answer?.status === "ready" ? answer.day : null;
  const layers = useMemo(() => dayRouteLayers(routeDay), [routeDay]);
  const routeNote =
    pick == null || sessionExpired
      ? null
      : answer == null
        ? "Loading the route…"
        : answer.status === "failed"
          ? `Could not load the route: ${answer.message}`
          : layers.pathPoints.length < 2
            ? "No route was recorded on this day."
            : null;

  // The route's own distance once it is here: Payroll's figure for that day
  // now, the one the board shows. The table's is from when the report loaded,
  // so for today the two can differ -- and then the label says so.
  const routeKm = routeDay ? formatKm(routeDay.total_km) : null;
  const routeKmShown = routeKm === "-" ? "0" : routeKm;
  const kmDiffers = pick != null && routeKmShown != null && routeKmShown !== pick.km;
  const routeLabel = pick
    ? `${pick.name} · ${weekday(pick.day)} ${fullDate(pick.day)}${
        routeKmShown != null ? ` · ${routeKmShown} km` : ""
      }${kmDiffers ? ` (${pick.km} in the table)` : ""}`
    : "Click a km to see that day's route.";

  const pickDay = (engineerId: number, name: string, day: string, km: string) => {
    // Side by side the map is in view. On a narrower screen it sits under the
    // table, often below the fold, and the click would seem to do nothing --
    // also a click on the day already shown, so this comes first.
    const box = mapBox.current;
    if (box) {
      const { top, bottom, height } = box.getBoundingClientRect();
      const visible = Math.min(bottom, window.innerHeight) - Math.max(top, 0);
      if (visible < height / 2) box.scrollIntoView?.({ block: "nearest" });
    }
    // The day already on the map is not asked for again -- unless asking failed.
    if (pick && pick.engineerId === engineerId && pick.day === day && answer?.status !== "failed") return;
    pickCount.current += 1;
    setPick({ engineerId, name, day, km, seq: pickCount.current });
  };

  // Another cycle is another table: the day the map was showing is not in it.
  const goToCycle = (key: string) => {
    setPick(null);
    setCycleKey(key);
  };

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
  // A tile with no answer yet says so, rather than reading as 0 km.
  const tile = (value: string) => (result ? value : loading ? "…" : "—");

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
              onClick={() => goToCycle(previousCycle(cycle).key)}
              style={{
                font: "inherit",
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                // Said outright: the app's own button style is white text, and
                // on this white button the arrow vanished.
                color: "#111827",
                cursor: "pointer",
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
              onClick={() => goToCycle(nextCycle(cycle).key)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: isCurrent ? "#f3f4f6" : "#fff",
                color: isCurrent ? "#9ca3af" : "#111827",
                cursor: isCurrent ? "default" : "pointer",
                font: "inherit",
              }}
            >
              ›
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: "1 1 auto", justifyContent: "flex-end" }}>
          <SummaryTile value={tile(formatKm(totals.total) === "-" ? "0" : formatKm(totals.total))} label="Total km" />
          <SummaryTile value={tile(String(shown.length))} label={shown.length === 1 ? "FSE" : "FSEs"} />
          <SummaryTile value={tile(formatKm(average) === "-" ? "0" : formatKm(average))} label="Average km per FSE" />
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

      {/* The table on the left and, beside it, the map that draws whichever day
          is clicked in it. Side by side while there is room for both; on a
          narrow screen the map drops below the table. */}
      {shown.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 520px", minWidth: 0 }}>
            <h3
              data-testid="km-table-title"
              style={{ margin: "16px 0 8px", fontSize: 16, fontWeight: 700, color: "#111827" }}
            >
              RTPL APP KM
            </h3>
            <div
              data-testid="km-grid"
              style={{
                marginTop: 0,
                overflow: "auto",
                maxHeight: "calc(100vh - 320px)",
                minHeight: 240,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fff",
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
                        const engineerId = row.engineer_id;
                        // A day with distance on it has a route to show; a dash has none.
                        const canPick = km !== "-" && engineerId != null;
                        const picked = canPick && pick?.engineerId === engineerId && pick.day === day;
                        return (
                          <td
                            key={day}
                            title={`${row.engineer_name} · ${fullDate(day)}`}
                            // All of the cell takes the click, also where a two-line
                            // name makes it taller than the button. The button is
                            // the way in for the keyboard; its click lands here too.
                            onClick={canPick ? () => pickDay(engineerId, row.engineer_name, day, km) : undefined}
                            style={{
                              ...cellBase,
                              textAlign: "center",
                              background: picked ? "#1d4ed8" : isSunday(day) ? "#f8fafc" : "#fff",
                              color: km === "-" ? "#9ca3af" : "#111827",
                              ...(canPick ? { padding: 0, cursor: "pointer" } : {}),
                              // The app's hovered-row grey replaces only the background;
                              // this keeps all of a taller, two-line cell blue.
                              ...(picked ? { boxShadow: "inset 0 0 0 100vmax #1d4ed8" } : {}),
                            }}
                          >
                            {canPick ? (
                              <button
                                type="button"
                                data-testid="km-day"
                                aria-pressed={picked}
                                aria-label={`${km} km: show ${row.engineer_name}'s route on ${fullDate(day)}`}
                                style={{
                                  ...dayButton,
                                  // The fill is the button's too: the app paints a
                                  // hovered row's cells grey with !important, which
                                  // would leave the white figure on light grey.
                                  background: picked ? "#1d4ed8" : "transparent",
                                  color: picked ? "#fff" : "#111827",
                                  // The cell's own weight, as before, until picked.
                                  fontWeight: picked ? 700 : "inherit",
                                }}
                              >
                                {km}
                              </button>
                            ) : (
                              km
                            )}
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
          </div>

          <div data-testid="km-route" style={{ flex: "2 1 360px", minWidth: 0 }}>
            <div
              style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 8px", minWidth: 0 }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                Route map
              </h3>
              <span
                data-testid="km-route-label"
                // One line, so the map starts level with the table; a long name
                // can cut it short, and the whole of it is here.
                title={routeLabel}
                style={{
                  fontSize: 13,
                  color: pick ? "#374151" : "#6b7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {routeLabel}
              </span>
            </div>
            {/* Isolated, so Leaflet's own layers stay inside this box. */}
            <div
              ref={mapBox}
              data-testid="km-route-box"
              style={{ position: "relative", isolation: "isolate", height: MAP_HEIGHT }}
            >
              <LiveTrackingMap
                height="100%"
                engineers={NO_ENGINEERS}
                selectedId={pick?.seq ?? null}
                pathPoints={layers.pathPoints}
                {...(layers.rawFromIndex !== undefined ? { rawFromIndex: layers.rawFromIndex } : {})}
                stops={layers.stops}
                punches={layers.punches}
                onSelect={ignoreSelect}
              />
              {routeNote && (
                <div
                  data-testid="km-route-note"
                  role="status"
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 1100,
                    maxWidth: "calc(100% - 120px)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "rgba(255,255,255,0.96)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    color: answer?.status === "failed" ? "#b91c1c" : "#374151",
                    fontSize: 12.5,
                    textAlign: "center",
                    pointerEvents: "none",
                  }}
                >
                  {routeNote}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ROUTE KM: the same FSEs and days, as the road between the places they
          marked. Its own table and map, under these. */}
      {token && shown.length > 0 && result && (
        <RouteKmSection
          token={token}
          fromIso={cycle.fromIso}
          toIso={cycle.toIso}
          days={days}
          engineers={engineers}
          shown={shown}
          onSessionExpired={() => {
            setResult(null);
            setSessionExpired(true);
          }}
        />
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
