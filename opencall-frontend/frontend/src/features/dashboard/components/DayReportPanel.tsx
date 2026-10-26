"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { clearSession } from "../../../lib/session";
import { isApiAuthError } from "../../../lib/api/http";
import {
  getDayReport,
  getRoster,
  type DayReportResult,
  type RosterEngineer,
} from "../../../lib/payrollTrackingApiClient";
import { filterKmRows, kmRegions, regionTone } from "../../../lib/kmReport";
import {
  DAY_REPORT_ROWS,
  MAX_DAY_REPORT_DAYS,
  dayCount,
  dayReportColumns,
  dayReportFilename,
  sheetDate,
} from "../../../lib/dayReport";
import { downloadDayReportExcel } from "../../../lib/dayReportExcel";
import { todayIsoDate } from "../utils/dateUtils";

/**
 * DAY REPORT: what the Live Tracking day panel says about each FSE-day -- Login,
 * Logout, check-ins and outs, Assigned / Attended / Closed, waiting, GPS and Net
 * off and on, km, with where each happened -- for everybody, one region or one
 * person, to read here and download as the office's Excel sheet.
 *
 * Asked for with Show, not on every change: a month of every FSE is hundreds of
 * FSE-days, and a search typed letter by letter must not ask for each one. What
 * is on screen is always the answer to the last Show, named as such, and the
 * download is exactly what is on screen.
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

/** The question behind what is on screen. */
interface Asked {
  key: string;
  from: string;
  to: string;
  ids: number[];
  /** Who it covers, in words: "All Regions", a region, or one FSE. */
  scope: string;
}

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
      await downloadDayReportExcel(columns, dayReportFilename(asked.scope, asked.from, asked.to));
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
        <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h3 data-testid="day-report-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
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
        </div>
      )}
      {answer && columns.length === 0 && (
        <p style={{ color: "#6b7280", marginTop: 8 }}>Nothing to show for these FSEs and days.</p>
      )}

      {columns.length > 0 && (
        <div
          data-testid="day-report-grid"
          style={{
            marginTop: 8,
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
                        fontWeight: 700,
                      }}
                    >
                      {spec.lines(column)[0]?.text}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {DAY_REPORT_ROWS.slice(2).map((spec) => (
                <tr key={spec.key}>
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
                    return (
                      <td
                        key={`${column.day}|${column.engineerId}`}
                        style={{
                          ...cellBase,
                          textAlign: spec.list ? "left" : "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <div style={{ width: COLUMN_W, overflowWrap: "anywhere" }}>
                          {lines.length === 0
                            ? "-"
                            : lines.map((line, index) => (
                                <div key={index}>
                                  {line.href ? (
                                    <a href={line.href} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                                      {line.text}
                                    </a>
                                  ) : (
                                    line.text
                                  )}
                                </div>
                              ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
