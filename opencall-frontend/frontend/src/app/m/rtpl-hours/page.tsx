"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { CaseList } from "../CaseList";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import {
  buildStatusMaps,
  calculateRtplHoursMetrics,
  type RtplHoursMetric,
} from "../rtplHoursMetrics";
import { isRecordsPageVisibleRow } from "../../../lib/reportDashboardAnalytics";
import { isWarrantyCase, isTradeCase } from "../../../features/dashboard/utils/caseClassification";

type Scope = "overall" | "warranty" | "trade";
type Mode = "BOD" | "EOD";

/**
 * RTPL Hours Status — the phone version of the desktop "RTPL HOURES STATUS" table.
 * Same row filter (isRecordsPageVisibleRow), same scope/region filters and the same
 * 19 metrics, laid out as a tappable list instead of a two-column table.
 */
export default function MobileRtplHoursPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [scope, setScope] = useState<Scope>("overall");
  const [region, setRegion] = useState("ALL");
  const [mode, setMode] = useState<Mode>("BOD");
  const [drill, setDrill] = useState<RtplHoursMetric | null>(null);

  const rows = useMemo(() => {
    if (!report) return [];
    const active = report.rows.filter(isRecordsPageVisibleRow);
    const scoped =
      scope === "warranty"
        ? active.filter(isWarrantyCase)
        : scope === "trade"
          ? active.filter(isTradeCase)
          : active;
    if (region === "ALL") return scoped;
    return scoped.filter(
      (r) => String(r.output["Work Location"] ?? "").trim().toUpperCase() === region,
    );
  }, [report, scope, region]);

  const metrics = useMemo(() => {
    const maps = buildStatusMaps(rows);
    const isBod = mode === "BOD";
    return calculateRtplHoursMetrics(
      rows,
      isBod ? maps.bod : maps.eod,
      isBod,
      maps,
    );
  }, [rows, mode]);

  const visible = useMemo(
    () => metrics.filter((m) => !(mode === "BOD" && m.eodOnly)),
    [metrics, mode],
  );

  const regions = report?.regionBreakdown ?? [];

  return (
    <>
      <AppBar
        title="RTPL Hours Status"
        subtitle={report?.reportDate ?? undefined}
        back
        action={
          <button type="button" className="mIconBtn" aria-label="Refresh" onClick={reload}>
            ↻
          </button>
        }
      />
      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        {loading ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading RTPL hours…</div>
          </div>
        ) : drill ? (
          <>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              style={{ marginBottom: 12 }}
              onClick={() => setDrill(null)}
            >
              ← {drill.label} ({drill.rows.length})
            </button>
            <CaseList
              rows={drill.rows}
              emptyText="No cases in this metric."
              session={session}
              onSaved={reload}
            />
          </>
        ) : (
          <>
            <div className="mSegment">
              {(["BOD", "EOD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`mSegment__btn${mode === m ? " is-active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m === "BOD" ? "BOD (Morning)" : "EOD (Evening)"}
                </button>
              ))}
            </div>

            <div className="mSegment" style={{ marginTop: 8 }}>
              {(["overall", "warranty", "trade"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`mSegment__btn${scope === s ? " is-active" : ""}`}
                  onClick={() => setScope(s)}
                >
                  {s === "overall" ? "Overall" : s === "warranty" ? "Warranty" : "Trade"}
                </button>
              ))}
            </div>

            {regions.length > 0 && (
              <select
                className="mSelect"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ marginTop: 12 }}
              >
                <option value="ALL">All Regions</option>
                {regions.map((r) => (
                  <option key={r.aspCode} value={r.aspCode.toUpperCase()}>
                    {r.regionName} ({r.aspCode})
                  </option>
                ))}
              </select>
            )}

            <div className="mMuted" style={{ margin: "12px 2px 10px" }}>
              {rows.length.toLocaleString()} rows in scope · tap a metric for its cases
            </div>

            <div className="mList">
              {visible.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="mRow"
                  onClick={() => m.rows.length > 0 && setDrill(m)}
                  style={{ cursor: m.rows.length > 0 ? "pointer" : "default" }}
                >
                  <div className="mRow__top">
                    <span className="mRow__title" style={{ fontSize: 13.5 }}>
                      {m.label}
                    </span>
                    <span
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: m.value === 0
                          ? "var(--m-muted)"
                          : m.alert
                            ? "var(--m-warn)"
                            : "var(--m-text)",
                      }}
                    >
                      {m.value}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
