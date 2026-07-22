"use client";

import { useEffect, useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { useProductivityAnalytics } from "../../../features/dashboard/hooks/useProductivityAnalytics";
import { useKpiMetrics } from "../../../features/dashboard/hooks/useKpiMetrics";

type Mode = "BOD" | "EOD";

/**
 * TN View Status — the phone version of the desktop "TN VIEW Status Summary" table.
 *
 * It reuses the very hooks the desktop page uses (useProductivityAnalytics →
 * tnFilteredRows → useKpiMetrics.regionKpiMetrics), so the 19 numbers here are the same
 * objects the web renders; only the layout differs. Like the desktop it is strictly
 * single-region — regionKpiMetrics is null for "ALL".
 */
export default function MobileTnViewPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [region, setRegion] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("EOD"); // desktop default

  const regions = useMemo(() => report?.regionBreakdown ?? [], [report]);

  useEffect(() => {
    if (region === null && regions.length > 0) {
      setRegion(regions[0]?.aspCode ?? null);
    }
  }, [region, regions]);

  const { tnFilteredRows } = useProductivityAnalytics({
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

  const { regionKpiMetrics: k, activeRegionName } = useKpiMetrics({
    report,
    selectedRegion: region,
    tnFilteredRows,
    tnViewMode: mode,
    eodBodFilteredRows: [],
    eodBodViewMode: mode,
  });

  // Same 19 rows, same order, same alert flags as TNViewStatusPage.tsx.
  const rows = k
    ? [
        { id: 1, desc: "Engineer Count", val: k.engineerCount },
        { id: 2, desc: "No.of Engg Presents", val: k.enggPresents },
        { id: 3, desc: "Open Calls", val: k.openCalls },
        { id: 4, desc: "Actionable Calls", val: k.actionable },
        { id: 5, desc: "Planned Calls", val: k.planned },
        { id: 6, desc: "Attended", val: k.attended },
        { id: 7, desc: "Closed Calls", val: k.closedCalls, alert: true },
        { id: 8, desc: "Engg onsite", val: k.enggOnsite },
        { id: 9, desc: "To be schedule", val: k.toBeSchedule },
        { id: 10, desc: "CX Reschedule Calls", val: k.cxReschedule },
        { id: 11, desc: "SSC Pending Calls", val: k.sscPending },
        { id: 12, desc: "Elevate/Tech Support Calls", val: k.elevateTech },
        { id: 13, desc: "Under observation Calls", val: k.underObservation },
        { id: 14, desc: "To be Yank", val: k.toBeYank },
        { id: 15, desc: "Closed cancelled", val: k.closedCancelled },
        { id: 16, desc: "Add.Part ordered", val: k.addPartOrdered, alert: true },
        { id: 17, desc: "To be Cancel", val: k.toBeCancel },
        { id: 18, desc: "New calls", val: k.newCalls, alert: true },
        { id: 19, desc: "Trade Open Calls", val: k.tradeOpenCalls },
      ]
    : [];

  return (
    <>
      <AppBar
        title="TN View Status"
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
            <div className="mMuted">Loading TN view…</div>
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
                  {v === "BOD" ? "🌅 BOD View" : "🌃 EOD View"}
                </button>
              ))}
            </div>

            <select
              className="mSelect"
              value={region ?? ""}
              onChange={(e) => setRegion(e.target.value || null)}
              style={{ marginTop: 12 }}
            >
              <option value="">Select Region</option>
              {regions.map((r) => (
                <option key={r.aspCode} value={r.aspCode}>
                  {r.regionName} ({r.aspCode})
                </option>
              ))}
            </select>

            {!k ? (
              <div className="mCard" style={{ marginTop: 14, textAlign: "center" }}>
                <div style={{ fontSize: 24 }} aria-hidden="true">🗺️</div>
                <div className="mMuted" style={{ marginTop: 8 }}>
                  Select a region to view its TN VIEW Status metrics summary.
                </div>
              </div>
            ) : (
              <>
                <div className="mKpiGrid" style={{ marginTop: 14 }}>
                  <div className="mKpi" style={{ cursor: "default" }}>
                    <div className="mKpi__label">Open Calls</div>
                    <div className="mKpi__value" style={{ color: "var(--m-primary)" }}>
                      {k.openCalls}
                    </div>
                    <div className="mKpi__hint">{k.actionable} actionable</div>
                  </div>
                  <div className="mKpi" style={{ cursor: "default" }}>
                    <div className="mKpi__label">Closed Calls</div>
                    <div className="mKpi__value" style={{ color: "var(--m-good)" }}>
                      {k.closedCalls}
                    </div>
                    <div className="mKpi__hint">{k.engineerCount} engineers</div>
                  </div>
                </div>

                <div className="mSectionTitle">
                  Summary · {mode} · {activeRegionName}
                </div>
                <div className="mList">
                  {rows.map((m) => (
                    <div key={m.id} className="mRow" style={{ cursor: "default" }}>
                      <div className="mRow__top">
                        <span className="mRow__title" style={{ fontSize: 13.5 }}>
                          <span className="mMuted" style={{ marginRight: 8, fontWeight: 600 }}>
                            {m.id}
                          </span>
                          {m.desc}
                        </span>
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: m.val === 0
                              ? "var(--m-muted)"
                              : m.alert
                                ? "var(--m-warn)"
                                : "var(--m-text)",
                          }}
                        >
                          {m.val}
                        </span>
                      </div>
                    </div>
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
