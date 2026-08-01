import { useCallback, useEffect, useMemo, useState } from "react";
import { readSession } from "../../../lib/session";
import {
  getEngineerTarget,
  type EngineerTargetResponse,
} from "../../../lib/engineerTargetApiClient";
import {
  analyseEngineerTarget,
  nextDayAdvice,
  STATUS_COLOR,
  STATUS_LABEL,
  type EngineerTargetAnalysis,
} from "./engineerTargetMath";

/**
 * Engineer Target — are the engineers hitting the standing close target, and what do they
 * have to do from tomorrow to still land the month.
 *
 * Counts come from the API, which replays each day through the SAME engineer-productivity
 * calculation the Productivity tab uses, so the two can never disagree. All the target
 * arithmetic lives in `engineerTargetMath` and is unit-tested there.
 *
 * Entirely self-contained — it reads its own endpoint and changes nothing else.
 */

/** First day of the current month in IST. */
function monthStartIst(): string {
  const today = todayIst();
  return `${today.slice(0, 7)}-01`;
}

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pct(done: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((done / target) * 100));
}

/** A thin progress bar; colour follows the target status. */
function Bar({ value, target, color }: Readonly<{ value: number; target: number; color: string }>) {
  return (
    <div
      style={{
        height: "6px",
        borderRadius: "999px",
        background: "#e5e7eb",
        overflow: "hidden",
        minWidth: "90px",
      }}
    >
      <div
        style={{
          width: `${pct(value, target)}%`,
          height: "100%",
          background: color,
          borderRadius: "999px",
        }}
      />
    </div>
  );
}

export function EngineerTargetTab() {
  // Reads the session directly (same approach as WarrantyLookupManager) so the host page
  // does not have to thread a token prop down — keeps the existing file's diff to the tab.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(readSession()?.token ?? null);
  }, []);

  const [fromDate, setFromDate] = useState(monthStartIst);
  const [toDate, setToDate] = useState(todayIst);
  const [data, setData] = useState<EngineerTargetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getEngineerTarget(token, { from: fromDate, to: toDate }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load engineer targets");
    } finally {
      setLoading(false);
    }
  }, [token, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyses: EngineerTargetAnalysis[] = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.rows
      .map((row) =>
        analyseEngineerTarget(
          {
            engineer: row.engineer,
            regionCode: row.regionCode,
            todayClosed: row.todayClosed,
            periodClosed: row.periodClosed,
            daysWorked: row.daysWorked,
          },
          {
            dailyTarget: data.dailyTarget,
            monthlyTarget: data.monthlyTarget,
            workingDaysPerMonth: data.workingDaysPerMonth,
          },
        ),
      )
      .filter(
        (a) =>
          !needle ||
          a.engineer.toLowerCase().includes(needle) ||
          a.regionCode.toLowerCase().includes(needle),
      );
  }, [data, search]);

  const roll = useMemo(() => {
    const counts = { ACHIEVED: 0, ON_TRACK: 0, PUSH: 0, AT_RISK: 0, NOT_POSSIBLE: 0 };
    let todayClosed = 0;
    let todayTarget = 0;
    for (const a of analyses) {
      counts[a.status] += 1;
      todayClosed += a.todayClosed;
      todayTarget += data?.dailyTarget ?? 0;
    }
    return { counts, todayClosed, todayTarget };
  }, [analyses, data]);

  const cell: React.CSSProperties = {
    padding: "9px 12px",
    borderBottom: "1px solid var(--border-color, #eef0f3)",
    whiteSpace: "nowrap",
    fontSize: "13px",
  };
  const head: React.CSSProperties = {
    padding: "10px 12px",
    fontWeight: 700,
    textAlign: "left",
    borderBottom: "1px solid var(--border-color, #e5e7eb)",
    background: "var(--th-bg, #f3f4f6)",
    whiteSpace: "nowrap",
    fontSize: "12px",
  };
  const dateInput: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "13px",
    minHeight: "34px",
    color: "#374151",
    background: "#ffffff",
  };

  return (
    <section style={{ minWidth: 0, maxWidth: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "14px",
          minWidth: 0,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Engineer Target</h3>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
            Target {data?.dailyTarget ?? 7} closes a day ·{" "}
            {data?.monthlyTarget ?? 175} a month ({data?.workingDaysPerMonth ?? 25} working
            days). Counts use the same calculation as the Productivity tab.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={dateInput}
            aria-label="From date"
          />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={dateInput}
            aria-label="To date"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search engineer…"
            style={{ ...dateInput, minWidth: "180px" }}
          />
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Roll-up */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
        {(
          [
            ["ACHIEVED", roll.counts.ACHIEVED],
            ["ON_TRACK", roll.counts.ON_TRACK],
            ["PUSH", roll.counts.PUSH],
            ["AT_RISK", roll.counts.AT_RISK],
            ["NOT_POSSIBLE", roll.counts.NOT_POSSIBLE],
          ] as const
        ).map(([status, count]) => (
          <span
            key={status}
            style={{
              padding: "6px 12px",
              borderRadius: "999px",
              background: STATUS_COLOR[status].bg,
              color: STATUS_COLOR[status].fg,
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {STATUS_LABEL[status]} · {count}
          </span>
        ))}
        <span
          style={{
            padding: "6px 12px",
            borderRadius: "999px",
            background: "#f3f4f6",
            color: "#374151",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          Today {roll.todayClosed} / {roll.todayTarget}
          {data?.latestDate ? ` · ${data.latestDate}` : ""}
        </span>
      </div>

      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "10px",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>Engineer</th>
              <th style={head}>Region</th>
              <th style={head}>Today</th>
              <th style={head}>Month to date</th>
              <th style={head}>Avg/day</th>
              <th style={head}>Pace</th>
              <th style={head}>Need/day</th>
              <th style={head}>Projected</th>
              <th style={head}>Status</th>
              <th style={head}>What to do next</th>
            </tr>
          </thead>
          <tbody>
            {loading && analyses.length === 0 ? (
              <tr>
                <td style={{ ...cell, textAlign: "center" }} colSpan={10}>
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && analyses.length === 0 ? (
              <tr>
                <td style={{ ...cell, textAlign: "center", color: "#6b7280" }} colSpan={10}>
                  No engineer activity in this range.
                </td>
              </tr>
            ) : null}
            {analyses.map((a) => {
              const color = STATUS_COLOR[a.status];
              return (
                <tr key={`${a.engineer}::${a.regionCode}`}>
                  <td style={{ ...cell, fontWeight: 600 }}>{a.engineer}</td>
                  <td style={cell}>{a.regionCode || "-"}</td>
                  <td style={cell}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: a.todayShortfall === 0 ? "#15803d" : "#b91c1c",
                      }}
                    >
                      {a.todayClosed}
                    </span>
                    <span style={{ color: "#9ca3af" }}> / {data?.dailyTarget ?? 7}</span>
                  </td>
                  <td style={cell}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700 }}>{a.periodClosed}</span>
                      <span style={{ color: "#9ca3af" }}>/ {data?.monthlyTarget ?? 175}</span>
                      <Bar
                        value={a.periodClosed}
                        target={data?.monthlyTarget ?? 175}
                        color={color.fg}
                      />
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>
                      {a.daysWorked} days worked
                    </div>
                  </td>
                  <td style={cell}>{a.avgPerDay}</td>
                  <td style={{ ...cell, color: a.gap >= 0 ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
                    {a.gap >= 0 ? `+${a.gap}` : a.gap}
                  </td>
                  <td style={{ ...cell, fontWeight: 700 }}>
                    {a.neededPerDay === null ? "—" : a.neededPerDay}
                  </td>
                  <td style={cell}>{a.projected}</td>
                  <td style={cell}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "999px",
                        background: color.bg,
                        color: color.fg,
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td style={{ ...cell, whiteSpace: "normal", minWidth: "260px", color: "#4b5563" }}>
                    {nextDayAdvice(a)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "10px" }}>
        {data
          ? `${data.reportDays} report day(s) in range${data.latestDate ? ` · latest ${data.latestDate}` : ""}.`
          : ""}{" "}
        &quot;Pace&quot; is month-to-date closes minus {data?.dailyTarget ?? 7} × days worked.
        &quot;Need/day&quot; is what is left divided by the working days remaining.
      </p>
    </section>
  );
}
