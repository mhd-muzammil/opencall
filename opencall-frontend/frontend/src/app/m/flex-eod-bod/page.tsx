"use client";

import { useEffect, useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { useProductivityAnalytics } from "../../../features/dashboard/hooks/useProductivityAnalytics";
import { useKpiMetrics } from "../../../features/dashboard/hooks/useKpiMetrics";

type Mode = "BOD" | "EOD";

/**
 * Flex EOD & BOD — this screen deliberately reuses the *same* hooks the desktop page
 * uses (useProductivityAnalytics → eodBodFilteredRows → useKpiMetrics.chennaiKpiMetrics),
 * so the phone can never show a different number than the web. Only the layout differs:
 * the desktop's two wide tables become two stacked label/value lists.
 *
 * Like the desktop, a specific region must be selected — the metrics are region-scoped.
 */
export default function MobileFlexEodBodPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [region, setRegion] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("EOD");

  const regions = useMemo(() => report?.regionBreakdown ?? [], [report]);

  // The desktop auto-selects a region too; without one the metrics are null.
  useEffect(() => {
    if (region === null && regions.length > 0) {
      setRegion(regions[0]?.aspCode ?? null);
    }
  }, [region, regions]);

  const { eodBodFilteredRows } = useProductivityAnalytics({
    report,
    selectedRegion: region,
    selectedWoOtcCode: null,
    tnFilterType: "Today",
    selectedTnValue: "",
    eodBodFilterType: "Today",
    selectedEodBodValue: "",
    productivityFilterType: "Today",
    selectedProductivityValue: "",
  });

  const { chennaiKpiMetrics, activeRegionName } = useKpiMetrics({
    report,
    selectedRegion: region,
    tnFilteredRows: [],
    tnViewMode: mode,
    eodBodFilteredRows,
    eodBodViewMode: mode,
  });

  const m = chennaiKpiMetrics;

  const regionRows: Array<{ label: string; value: string | number; alert?: boolean }> = m
    ? [
        { label: "Total open call", value: m.openCalls },
        { label: "Total field Actionable call", value: m.actionable },
        { label: "Total Call Scheduled", value: m.planned },
        { label: "Call Allocation Engineer Wise", value: m.callAllocation },
        { label: "Print - Open call (=>2 days)", value: m.printOpenGe2 },
        { label: "Print - Actionable call (=>2 days)", value: m.printActionableGe2 },
        { label: "Print - Scheduled (=>2 days)", value: m.printScheduledGe2 },
        { label: "Open call (>10 days)", value: m.openCallsGt10, alert: true },
        { label: "Actionable call (>10 days)", value: m.actionableGt10, alert: true },
        { label: "Call Scheduled (>10 days)", value: m.scheduledGt10 },
        { label: "MPS >1 Days", value: m.mpsGt1 },
        { label: "EOD Call Closer", value: m.eodCloser },
        { label: "New Calls Received", value: m.newCalls },
        { label: "CSO Days Inventory", value: m.csoDaysInventory },
        { label: "Total Eng Count", value: m.enggCount },
        { label: "Eng Avl in Field", value: m.engAvlInField },
        { label: "Engineers Productivity", value: m.enggProductivity },
        { label: "Missed to schedule", value: m.missedToSchedule, alert: true },
        { label: "Missed by Eng", value: m.missedByEng, alert: true },
        { label: "G Total (Missed)", value: m.gTotalMissed },
        { label: "% - Missed", value: `${m.pctMissed}%` },
        { label: "Closure Adherence", value: `${m.closureAdherence}%` },
      ]
    : [];

  const nafRows: Array<{ label: string; value: string | number }> = m
    ? [
        { label: "Flex Backend", value: m.flexBackend },
        { label: "SSC", value: m.ssc },
        { label: "HP Backend", value: m.hpBackend },
        { label: "OBS-Customer", value: m.obsCustomer },
        { label: "Cu Pending", value: m.cuPending },
        { label: "Physical Closed", value: m.physicalClosed },
        { label: "Total NAF", value: m.totalNaf },
        { label: "SSC%", value: `${m.sscPct}%` },
      ]
    : [];

  return (
    <>
      <AppBar
        title="Flex EOD & BOD"
        subtitle={activeRegionName || report?.reportDate || undefined}
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
            <div className="mMuted">Loading EOD/BOD…</div>
          </div>
        ) : (
          <>
            <div className="mSegment">
              {(["BOD", "EOD"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`mSegment__btn${mode === v ? " is-active" : ""}`}
                  onClick={() => setMode(v)}
                >
                  {v === "BOD" ? "BOD (Morning)" : "EOD (Evening)"}
                </button>
              ))}
            </div>

            <select
              className="mSelect"
              value={region ?? ""}
              onChange={(e) => setRegion(e.target.value || null)}
              style={{ marginTop: 12 }}
            >
              <option value="">Select a region…</option>
              {regions.map((r) => (
                <option key={r.aspCode} value={r.aspCode}>
                  {r.regionName} ({r.aspCode})
                </option>
              ))}
            </select>

            {!m ? (
              <div className="mCard" style={{ marginTop: 14 }}>
                <div className="mMuted">
                  Select a region to see its EOD / BOD numbers.
                </div>
              </div>
            ) : (
              <>
                <div className="mKpiGrid" style={{ marginTop: 14 }}>
                  <div className="mKpi" style={{ cursor: "default" }}>
                    <div className="mKpi__label">Open Calls</div>
                    <div className="mKpi__value" style={{ color: "var(--m-primary)" }}>
                      {m.openCalls}
                    </div>
                    <div className="mKpi__hint">{m.actionable} actionable</div>
                  </div>
                  <div className="mKpi" style={{ cursor: "default" }}>
                    <div className="mKpi__label">Closure Adherence</div>
                    <div
                      className="mKpi__value"
                      style={{
                        color:
                          m.closureAdherence >= 90
                            ? "var(--m-good)"
                            : m.closureAdherence >= 70
                              ? "var(--m-warn)"
                              : "var(--m-danger)",
                      }}
                    >
                      {m.closureAdherence}%
                    </div>
                    <div className="mKpi__hint">{m.eodCloser} closed</div>
                  </div>
                </div>

                <div className="mSectionTitle">Region Dashboard</div>
                <div className="mList">
                  {regionRows.map((r) => (
                    <MetricRow key={r.label} {...r} />
                  ))}
                </div>

                <div className="mSectionTitle">
                  Non Action-Field Breakdown ({m.totalNaf})
                </div>
                <div className="mList">
                  {nafRows.map((r) => (
                    <MetricRow key={r.label} {...r} />
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

function MetricRow({
  label, value, alert,
}: Readonly<{ label: string; value: string | number; alert?: boolean }>) {
  const isZero = value === 0 || value === "0" || value === "0.0";
  return (
    <div className="mRow" style={{ cursor: "default" }}>
      <div className="mRow__top">
        <span className="mRow__title" style={{ fontSize: 13.5 }}>{label}</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: isZero
              ? "var(--m-muted)"
              : alert
                ? "var(--m-warn)"
                : "var(--m-text)",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
