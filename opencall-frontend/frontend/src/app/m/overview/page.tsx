"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { isTodayCallPlanVisibleRow } from "../../../lib/reportDashboardAnalytics";
import { computeOperationalHealth } from "../../../features/dashboard/utils/operationalHealth";
import {
  isCissCase,
  isPcCase,
  isPrintFixCase,
  isPrintInstallationCase,
  isTradeCase,
  isConsumerCase,
} from "../../../features/dashboard/utils/caseClassification";

/**
 * Overview — the same signals the web overview shows, computed with the very same
 * helpers (computeOperationalHealth / caseClassification), so the numbers can never
 * drift from the web.
 */
export default function MobileOverviewPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);
  const [region, setRegion] = useState<string>("ALL");

  const activeRows = useMemo(
    () => (report ? report.rows.filter(isTodayCallPlanVisibleRow) : []),
    [report],
  );

  const scopedRows = useMemo(() => {
    if (region === "ALL") return activeRows;
    return activeRows.filter(
      (r) => String(r.output["Work Location"] ?? "").trim().toUpperCase() === region,
    );
  }, [activeRows, region]);

  const health = useMemo(() => computeOperationalHealth(scopedRows), [scopedRows]);

  const activePartCases = useMemo(
    () => scopedRows.filter((r) => String(r.output["Part"] ?? "").trim() !== "").length,
    [scopedRows],
  );

  const caseTypes = useMemo(
    () => [
      { label: "PC", count: scopedRows.filter(isPcCase).length },
      { label: "Print Fix", count: scopedRows.filter(isPrintFixCase).length },
      { label: "Print Install", count: scopedRows.filter(isPrintInstallationCase).length },
      { label: "CISS", count: scopedRows.filter(isCissCase).length },
      { label: "Trade", count: scopedRows.filter(isTradeCase).length },
    ],
    [scopedRows],
  );

  const segments = useMemo(() => {
    const consumer = scopedRows.filter(isConsumerCase).length;
    return { consumer, commercial: scopedRows.length - consumer };
  }, [scopedRows]);

  const regions = report?.regionBreakdown ?? [];

  return (
    <>
      <AppBar
        title="Overview"
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
            <div className="mMuted">Loading overview…</div>
          </div>
        ) : !report ? (
          <div className="mCard">
            <div className="mMuted">No report available yet.</div>
          </div>
        ) : (
          <>
            {regions.length > 0 && (
              <select
                className="mSelect"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ marginBottom: 14 }}
              >
                <option value="ALL">All Regions ({regions.length})</option>
                {regions.map((r) => (
                  <option key={r.aspCode} value={r.aspCode.toUpperCase()}>
                    {r.regionName} ({r.aspCode})
                  </option>
                ))}
              </select>
            )}

            <div className="mSectionTitle">Needs attention</div>
            <div className="mKpiGrid">
              <Kpi label="Active Part Cases" value={activePartCases} color="var(--m-primary)" hint="Rows with a part" />
              <Kpi label="Unassigned" value={health.unassigned.count} color="var(--m-warn)" hint={`of ${health.openCount} open`} />
            </div>

            <div className="mCard" style={{ marginTop: 10 }}>
              <SplitRow
                left={{ label: "Actionable", value: health.actionable.count }}
                right={{ label: "Planned", value: health.planned.count }}
              />
            </div>

            <div className="mCard" style={{ marginTop: 10 }}>
              <SplitRow
                left={{ label: "Part Pending", value: health.partPending.partPendingCount }}
                right={{ label: "Part Order Pending", value: health.partPending.partOrderPendingCount }}
                tone="var(--m-warn)"
              />
            </div>

            <div className="mCard" style={{ marginTop: 10 }}>
              <div className="mKpi__label" style={{ marginBottom: 8 }}>At-Risk Backlog</div>
              <div style={{ display: "flex", gap: 10 }}>
                <Mini label={`${health.aged.threshold}+ d`} value={health.aged.count} />
                <Mini label="5+ d" value={health.aged.aged5PlusCount} />
                <Mini label="7+ d" value={health.aged.aged7PlusCount} />
                <Mini label="10+ d" value={health.aged.aged10PlusCount} />
              </div>
            </div>

            <div className="mSectionTitle">Case types</div>
            <div className="mKpiGrid">
              {caseTypes.map((c) => (
                <div key={c.label} className="mKpi" style={{ cursor: "default" }}>
                  <div className="mKpi__label">{c.label}</div>
                  <div className="mKpi__value" style={{ fontSize: 21 }}>{c.count}</div>
                </div>
              ))}
            </div>

            <div className="mSectionTitle">Customer segment</div>
            <div className="mKpiGrid">
              <Kpi label="Consumer" value={segments.consumer} color="var(--m-good)" />
              <Kpi label="Commercial" value={segments.commercial} color="var(--m-primary)" />
            </div>

            {regions.length > 0 && (
              <>
                <div className="mSectionTitle">Regions</div>
                <div className="mList">
                  {regions.map((r) => (
                    <button
                      key={r.aspCode}
                      type="button"
                      className="mRow"
                      onClick={() => setRegion(r.aspCode.toUpperCase())}
                    >
                      <div className="mRow__top">
                        <span className="mRow__title">{r.regionName}</span>
                        <span className="mChip">{r.count}</span>
                      </div>
                      <div className="mRow__meta">
                        {r.aspCode} · {r.closedCount} closed
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Kpi({
  label, value, color, hint,
}: Readonly<{ label: string; value: number; color: string; hint?: string }>) {
  return (
    <div className="mKpi" style={{ cursor: "default" }}>
      <div className="mKpi__label">{label}</div>
      <div className="mKpi__value" style={{ color }}>{value.toLocaleString()}</div>
      {hint && <div className="mKpi__hint">{hint}</div>}
    </div>
  );
}

function SplitRow({
  left, right, tone = "var(--m-text)",
}: Readonly<{
  left: { label: string; value: number };
  right: { label: string; value: number };
  tone?: string;
}>) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {[left, right].map((side, i) => (
        <div key={side.label} style={{ flex: 1, textAlign: i === 0 ? "left" : "right" }}>
          <div className="mKpi__label">{side.label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: tone, marginTop: 2 }}>
            {side.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Mini({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--m-danger)" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--m-muted)", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
