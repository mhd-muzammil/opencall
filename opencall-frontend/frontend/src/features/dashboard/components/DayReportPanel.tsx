"use client";

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import { CircleCheck, ClipboardCheck, LayoutGrid, MapPin, Route, Table2, Users } from "lucide-react";
import { clearSession } from "../../../lib/session";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getDayReport,
  getRoster,
  type DayReportResult,
  type RosterEngineer,
} from "../../../lib/payrollTrackingApiClient";
import { filterKmRows, formatKm, kmRegions, regionTone } from "../../../lib/kmReport";
import {
  DAY_REPORT_ROWS,
  DAY_SUMMARY_ROWS,
  MAX_DAY_REPORT_DAYS,
  dayCount,
  dayReportColumns,
  dayReportFilename,
  dayReportTotals,
  sheetDate,
} from "../../../lib/dayReport";
import { downloadDayReportExcel } from "../../../lib/dayReportExcel";
import { todayIsoDate } from "../utils/dateUtils";
import DayReportCards from "./DayReportCards";
import DaySummarySheet, { TABLE_COLOURS } from "./DaySummarySheet";

/**
 * DAY REPORT: what the Live Tracking day panel says about each FSE-day -- Login,
 * Logout, check-ins and outs, Assigned / Attended / Closed, waiting, GPS and Net
 * off and on, km, with where each happened -- for everybody, one region or one
 * person, to read here as cards or as the office's sheet, and to download as
 * that sheet in Excel.
 *
 * Asked for with Show, not on every change: a month of every FSE is hundreds of
 * FSE-days, and a search typed letter by letter must not ask for each one. What
 * is on screen is always the answer to the last Show, named as such, and the
 * download is exactly what is on screen.
 */

const inputStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  font: "inherit",
  background: "#fff",
  color: "#111827",
};

// The app's buttons are filled with its accent and white text; these say so
// outright, as the KM Report's do, so a disabled one still reads.
const actionButton = (enabled: boolean, filled: boolean): CSSProperties => ({
  font: "inherit",
  padding: "8px 16px",
  minHeight: 0,
  borderRadius: 8,
  border: `1px solid ${enabled ? "#4f46e5" : "#d1d5db"}`,
  background: enabled ? (filled ? "#4f46e5" : "#fff") : "#f3f4f6",
  color: enabled ? (filled ? "#fff" : "#4f46e5") : "#9ca3af",
  fontWeight: 600,
  cursor: enabled ? "pointer" : "default",
});

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

/** A figure above the report, with its icon in its colour. */
function SummaryTile({ value, label, Icon, color, tint }: { value: string; label: string; Icon: Icon; color: string; tint: string }) {
  return (
    <div
      data-testid="day-report-tile"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px 10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#fff",
        minWidth: 150,
        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
      }}
    >
      <span
        aria-hidden
        style={{ width: 38, height: 38, borderRadius: 10, background: tint, color, display: "grid", placeItems: "center" }}
      >
        <Icon size={19} strokeWidth={2.2} />
      </span>
      <div>
        <div style={{ fontSize: 21, fontWeight: 800, color: "#111827", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      </div>
    </div>
  );
}

/** The question behind what is on screen. */
interface Asked {
  key: string;
  from: string;
  to: string;
  ids: number[];
  /** Who it covers, in words: "All Regions", a region, or one FSE. */
  scope: string;
}

// Summary is the office's own short sheet (DAY_SUMMARY_ROWS).
type View = "cards" | "table" | "summary";

export interface DayReportPanelProps {
  token: string | null;
}

export default function DayReportPanel({ token }: DayReportPanelProps) {
  const today = todayIsoDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  // "" is All Regions.
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("cards");

  const [engineers, setEngineers] = useState<RosterEngineer[] | null>(null);
  const [rosterConfigured, setRosterConfigured] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [asked, setAsked] = useState<Asked | null>(null);
  const [result, setResult] = useState<{ key: string; answer: DayReportResult } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // The FSEs: our register, as the board and the KM Report list it, and only
  // those Payroll recognises -- an unmatched name has no day to report.
  useEffect(() => {
    if (!token || sessionExpired) return;
    let active = true;
    getRoster(token, today)
      .then((answer) => {
        if (!active) return;
        setRosterConfigured(answer.configured);
        setEngineers(answer.engineers.filter((row) => row.matched && row.engineer_id != null));
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) {
          setSessionExpired(true);
          return;
        }
        setRosterError(e instanceof Error ? e.message : "Failed to load the FSEs");
      });
    return () => {
      active = false;
    };
  }, [token, today, sessionExpired]);

  const regions = useMemo(() => kmRegions(engineers ?? []), [engineers]);
  // A region nobody is in falls back to All.
  const activeRegion = regions.some((r) => r.key === region) ? region : "";
  const shown = useMemo(
    () => filterKmRows(engineers ?? [], activeRegion, query),
    [engineers, activeRegion, query],
  );
  const nameById = useMemo(
    () => new Map((engineers ?? []).map((row) => [row.engineer_id as number, row.engineer_name] as const)),
    [engineers],
  );
  const regionById = useMemo(
    () => new Map((engineers ?? []).map((row) => [row.engineer_id as number, row.branch] as const)),
    [engineers],
  );

  const days = dayCount(from, to);
  const futureFrom = from > today;
  const ids = shown.map((row) => row.engineer_id as number);
  const scope =
    shown.length === 1
      ? shown[0]!.engineer_name
      : activeRegion
        ? regions.find((r) => r.key === activeRegion)?.name ?? "All Regions"
        : "All Regions";
  const key = `${from}|${to}|${ids.join(",")}`;
  const canShow = !!token && !sessionExpired && ids.length > 0 && days != null && !futureFrom;

  // Asked once per Show; a later Show replaces it, and an answer to an older
  // question is never put on screen.
  useEffect(() => {
    if (!token || !asked || sessionExpired) return;
    let active = true;
    setFailed(null);
    getDayReport(token, asked.from, asked.to, asked.ids)
      .then((answer) => {
        if (active) setResult({ key: asked.key, answer });
      })
      .catch((e) => {
        if (!active) return;
        if (isApiAuthError(e)) {
          setResult(null);
          setSessionExpired(true);
          return;
        }
        setFailed({ key: asked.key, message: e instanceof Error ? e.message : "Failed to load the Day Report" });
      });
    return () => {
      active = false;
    };
  }, [token, asked, sessionExpired]);

  const answer = asked && result?.key === asked.key ? result.answer : null;
  const loading = asked != null && answer == null && failed?.key !== asked.key && !sessionExpired;
  const error = asked && failed?.key === asked.key ? failed.message : null;
  const columns = useMemo(() => (answer ? dayReportColumns(answer, nameById) : []), [answer, nameById]);
  const totals = useMemo(() => dayReportTotals(columns), [columns]);
  // The boxes, the search or the dates moved since the last Show.
  const changed = asked != null && asked.key !== key;

  const show = () => {
    if (!canShow) return;
    setDownloadError(null);
    setAsked({ key, from, to, ids, scope });
  };

  const download = async () => {
    if (!asked || columns.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Summary on screen downloads the short sheet; Cards and Table, the full one.
      const summary = view === "summary";
      await downloadDayReportExcel(
        columns,
        dayReportFilename(asked.scope, asked.from, asked.to, summary),
        summary ? DAY_SUMMARY_ROWS : DAY_REPORT_ROWS,
      );
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Could not make the Excel file");
    } finally {
      setDownloading(false);
    }
  };

  const boxes = [
    { key: "", name: "All Regions", count: engineers?.length ?? 0 },
    ...regions.map((r) => ({ key: r.key, name: r.name, count: r.count })),
  ];

  const periodWords = (a: Asked) =>
    a.from === a.to ? sheetDate(a.from) : `${sheetDate(a.from)} to ${sheetDate(a.to)}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
          From
          <input
            type="date"
            aria-label="From"
            value={from}
            max={today}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6b7280" }}>
          To
          <input
            type="date"
            aria-label="To"
            value={to}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="button" onClick={show} disabled={!canShow} style={actionButton(canShow, true)}>
          Show
        </button>
        <button
          type="button"
          onClick={download}
          disabled={columns.length === 0 || downloading}
          style={actionButton(columns.length > 0 && !downloading, false)}
        >
          {downloading ? "Making the Excel file…" : "Download Excel"}
        </button>
      </div>
      {days == null && (
        <p style={{ color: "#b45309", fontSize: 13, marginTop: 8 }}>
          Pick a period of 1 to {MAX_DAY_REPORT_DAYS} days, From on or before To.
        </p>
      )}
      {futureFrom && (
        <p style={{ color: "#b45309", fontSize: 13, marginTop: 8 }}>From cannot be after today.</p>
      )}

      {/* A box per region and one for everybody, as on the KM Report. */}
      {engineers && engineers.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
          {boxes.map((box) => {
            const picked = activeRegion === box.key;
            const tone = regionTone(box.key);
            return (
              <button
                key={box.key || "all"}
                type="button"
                data-testid="day-report-region"
                aria-pressed={picked}
                onClick={() => setRegion(box.key)}
                style={{
                  flex: "0 0 auto",
                  minWidth: 132,
                  minHeight: 0,
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
          style={{ ...inputStyle, minWidth: 220 }}
        />
        {engineers && (
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            Show will load {shown.length} {shown.length === 1 ? "FSE" : "FSEs"}
            {days != null ? ` × ${days} ${days === 1 ? "day" : "days"}` : ""}.
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
            <strong>Your login has expired.</strong> Sign in again and the report is here as before.
          </span>
          <button
            type="button"
            onClick={() => {
              clearSession();
              window.location.replace("/");
            }}
            style={{
              padding: "6px 14px",
              minHeight: 0,
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
      {(!rosterConfigured || answer?.configured === false) && !sessionExpired && (
        <p style={{ color: "#b45309", marginTop: 12 }}>
          Payroll integration is not configured. Set PAYROLL_API_URL / PAYROLL_API_USER /
          PAYROLL_API_PASSWORD in the OpenCall backend environment.
        </p>
      )}
      {rosterError && !sessionExpired && <p style={{ color: "#dc2626", marginTop: 12 }}>{rosterError}</p>}
      {engineers && engineers.length > 0 && shown.length === 0 && (
        <p style={{ color: "#6b7280", marginTop: 12 }}>No FSE matches this region and search.</p>
      )}
      {error && !sessionExpired && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}
      {downloadError && <p style={{ color: "#dc2626", marginTop: 12 }}>{downloadError}</p>}

      {asked && !sessionExpired && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 data-testid="day-report-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>
            {asked.scope} · {periodWords(asked)}
          </h3>
          {loading && (
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              Loading… (Payroll is asked one day at a time, so a long period takes a little while)
            </span>
          )}
          {changed && !loading && (
            <span style={{ color: "#b45309", fontSize: 13 }}>
              The dates, region or search have changed since. Press Show to load them.
            </span>
          )}
          {/* Cards to read a day by; the table to compare them, as the sheet lays them out. */}
          {columns.length > 0 && (
            <div
              role="group"
              aria-label="View"
              style={{ marginLeft: "auto", display: "inline-flex", border: "1px solid #c7d2fe", borderRadius: 10, overflow: "hidden" }}
            >
              {(
                [
                  ["cards", "Cards", LayoutGrid],
                  ["table", "Table", Table2],
                  ["summary", "Summary", ClipboardCheck],
                ] as const
              ).map(([value, label, ViewIcon]) => {
                const on = view === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setView(value)}
                    style={{
                      font: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      minHeight: 0,
                      padding: "6px 14px",
                      border: "none",
                      borderRadius: 0,
                      background: on ? "#4f46e5" : "#fff",
                      color: on ? "#fff" : "#4338ca",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <ViewIcon size={15} strokeWidth={2.2} /> {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {answer && columns.length === 0 && (
        <p style={{ color: "#6b7280", marginTop: 8 }}>Nothing to show for these FSEs and days.</p>
      )}

      {columns.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <SummaryTile
            value={formatKm(totals.km) === "-" ? "0" : formatKm(totals.km)}
            label="Total km"
            Icon={Route}
            color="#4f46e5"
            tint="#eef2ff"
          />
          <SummaryTile
            value={String(totals.fses)}
            label={totals.fses === 1 ? "FSE" : "FSEs"}
            Icon={Users}
            color="#0284c7"
            tint="#e0f2fe"
          />
          <SummaryTile
            value={String(totals.checkIns)}
            label={totals.checkIns === 1 ? "Check in" : "Check ins"}
            Icon={MapPin}
            color="#2563eb"
            tint="#dbeafe"
          />
          <SummaryTile
            value={String(totals.closed)}
            label="Closed"
            Icon={CircleCheck}
            color="#7c3aed"
            tint="#ede9fe"
          />
        </div>
      )}

      {columns.length > 0 &&
        (view === "cards" ? (
          <DayReportCards columns={columns} regionById={regionById} />
        ) : view === "summary" ? (
          <DaySummarySheet columns={columns} />
        ) : (
          // The full rows, in the Summary's sheet, in its own colours.
          <DaySummarySheet columns={columns} rows={DAY_REPORT_ROWS} testId="day-report-grid" colours={TABLE_COLOURS} />
        ))}
    </div>
  );
}
