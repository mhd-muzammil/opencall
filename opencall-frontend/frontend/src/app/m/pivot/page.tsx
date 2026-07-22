"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { useRtplPivot } from "../../../features/dashboard/hooks/useRtplPivot";
import { isRecordsPageVisibleRow } from "../../../lib/reportDashboardAnalytics";
import { formatNumber } from "../../../features/dashboard/utils";
import type { RtplCaseScope } from "../../../features/dashboard/types";

/**
 * RTPL Pivot — RTPL status (rows) × WIP aging (columns), counting Ticket IDs.
 *
 * The matrix itself comes from the web's useRtplPivot hook, so every number matches the
 * desktop exactly. A wide grid is unusable on a phone, so the presentation is a drill:
 * status list (with its grand total) → that status's WIP-aging distribution.
 */
export default function MobilePivotPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [scope, setScope] = useState<RtplCaseScope>("overall");
  const [locations, setLocations] = useState<string[] | null>(null);
  const [openStatus, setOpenStatus] = useState<string | null>(null);

  const activeRows = useMemo(
    () => (report ? report.rows.filter(isRecordsPageVisibleRow) : []),
    [report],
  );

  const { rtplWipPivot, pivotLocationOptions } = useRtplPivot({
    activeRows,
    selectedPivotCaseScope: scope,
    selectedPivotLocations: locations,
    selectedPivotSegments: null,
    draftPivotSegments: null,
    draftPivotLocations: null,
  });

  const { rows, columns, grandTotal } = rtplWipPivot;
  const maxRowTotal = rows[0]?.total ?? 1;

  const activeRow = openStatus
    ? rows.find((r) => r.status === openStatus) ?? null
    : null;

  return (
    <>
      <AppBar
        title="RTPL Pivot"
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
            <div className="mMuted">Loading pivot…</div>
          </div>
        ) : activeRow ? (
          <>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              style={{ marginBottom: 12 }}
              onClick={() => setOpenStatus(null)}
            >
              ← {activeRow.status} ({formatNumber(activeRow.total)})
            </button>
            <div className="mSectionTitle">WIP aging</div>
            <div className="mList">
              {columns
                .map((c) => ({ label: c.label, count: activeRow.cells[c.key] ?? 0 }))
                .filter((c) => c.count > 0)
                .map((c) => (
                  <div key={c.label} className="mRow" style={{ cursor: "default" }}>
                    <div className="mRow__top">
                      <span className="mRow__title" style={{ fontSize: 13.5 }}>{c.label}</span>
                      <span className="mChip">{formatNumber(c.count)}</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: "var(--m-border)",
                        marginTop: 9,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(3, (c.count / activeRow.total) * 100)}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "var(--m-warn)",
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="mSegment">
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

            {pivotLocationOptions.length > 1 && (
              <select
                className="mSelect"
                value={locations === null ? "" : locations[0] ?? ""}
                onChange={(e) =>
                  setLocations(e.target.value === "" ? null : [e.target.value])
                }
                style={{ marginTop: 12 }}
              >
                <option value="">All Locations</option>
                {pivotLocationOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            )}

            <div className="mMuted" style={{ margin: "12px 2px 10px" }}>
              {formatNumber(grandTotal)} tickets · Count of Ticket ID by RTPL status ·
              tap for the WIP aging split
            </div>

            {rows.length === 0 || columns.length === 0 ? (
              <div className="mCard">
                <div className="mMuted">No pivot data for the current filters.</div>
              </div>
            ) : (
              <div className="mList">
                {rows.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className="mRow"
                    onClick={() => setOpenStatus(r.status)}
                  >
                    <div className="mRow__top">
                      <span className="mRow__title" style={{ fontSize: 13.5 }}>{r.status}</span>
                      <span className="mChip">{formatNumber(r.total)}</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: "var(--m-border)",
                        marginTop: 9,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(3, (r.total / maxRowTotal) * 100)}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "var(--m-primary)",
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
