"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { useProductivityAnalytics } from "../../../features/dashboard/hooks/useProductivityAnalytics";

/**
 * Engineer Productivity — reuses the web's useProductivityAnalytics hook verbatim, so
 * every count (Assigned / Attended / Closed / Part / UO / CX / Delay) matches the web.
 */
export default function MobileProductivityPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [region, setRegion] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { engineerProductivityMetrics, productivityDateLabel } = useProductivityAnalytics({
    report,
    selectedRegion: region === "ALL" ? null : region,
    selectedWoOtcCode: null,
    tnFilterType: "Today",
    selectedTnValue: "",
    eodBodFilterType: "Today",
    selectedEodBodValue: "",
    productivityFilterType: "Today",
    selectedProductivityValue: "",
  });

  const list = engineerProductivityMetrics.list;
  const regions = report?.regionBreakdown ?? [];

  const totals = useMemo(
    () =>
      list.reduce(
        (acc, e) => ({
          assigned: acc.assigned + e.assigned,
          attended: acc.attended + e.attended,
          closed: acc.closed + e.closed,
        }),
        { assigned: 0, attended: 0, closed: 0 },
      ),
    [list],
  );

  return (
    <>
      <AppBar
        title="Engineer Productivity"
        subtitle={productivityDateLabel}
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
            <div className="mMuted">Loading productivity…</div>
          </div>
        ) : (
          <>
            {regions.length > 0 && (
              <select
                className="mSelect"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ marginBottom: 12 }}
              >
                <option value="ALL">All Regions</option>
                {regions.map((r) => (
                  <option key={r.aspCode} value={r.aspCode.toUpperCase()}>
                    {r.regionName} ({r.aspCode})
                  </option>
                ))}
              </select>
            )}

            <div className="mKpiGrid" style={{ marginBottom: 4 }}>
              <div className="mKpi" style={{ cursor: "default" }}>
                <div className="mKpi__label">Assigned</div>
                <div className="mKpi__value" style={{ color: "var(--m-primary)" }}>
                  {totals.assigned}
                </div>
                <div className="mKpi__hint">{list.length} engineers</div>
              </div>
              <div className="mKpi" style={{ cursor: "default" }}>
                <div className="mKpi__label">Attended</div>
                <div className="mKpi__value" style={{ color: "var(--m-good)" }}>
                  {totals.attended}
                </div>
                <div className="mKpi__hint">{totals.closed} closed</div>
              </div>
            </div>

            <div className="mSectionTitle">Engineers</div>
            {list.length === 0 ? (
              <div className="mCard">
                <div className="mMuted">No engineer activity for this day.</div>
              </div>
            ) : (
              <div className="mList">
                {list.map((e) => {
                  const open = expanded === e.name;
                  return (
                    <button
                      key={`${e.name}-${e.regionCode}`}
                      type="button"
                      className="mRow"
                      onClick={() => setExpanded(open ? null : e.name)}
                    >
                      <div className="mRow__top">
                        <span className="mRow__title">{e.name || "Unassigned"}</span>
                        <span className="mChip">{e.attended}/{e.assigned}</span>
                      </div>
                      <div className="mRow__meta">
                        {e.regionName || e.regionCode || "—"} · {e.closed} closed
                      </div>

                      {open && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 8,
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid var(--m-border)",
                          }}
                        >
                          <Stat label="Assigned" value={e.assigned} />
                          <Stat label="Attended" value={e.attended} />
                          <Stat label="Closed" value={e.closed} />
                          <Stat label="Part" value={e.partOrdered} />
                          <Stat label="UO" value={e.underObservation} />
                          <Stat label="CX Resch" value={e.cxReschedule} />
                          <Stat label="Delay" value={e.engineerDelay} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--m-muted)", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
