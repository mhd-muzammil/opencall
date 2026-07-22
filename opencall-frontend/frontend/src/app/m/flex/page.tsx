"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { StatusBreakdown } from "../StatusBreakdown";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import {
  isRecordsPageVisibleRow,
  filterRowsByRegion,
  ALL_REGIONS_FILTER,
} from "../../../lib/reportDashboardAnalytics";
import { isWarrantyCase, isTradeCase } from "../../../features/dashboard/utils/caseClassification";

type Scope = "overall" | "warranty" | "trade";

/**
 * Flex Dashboard — same pipeline as the desktop:
 *   report.rows → isRecordsPageVisibleRow → case scope → filterRowsByRegion
 *   → distribution of "Flex Status".
 * The helpers are imported rather than re-implemented so the counts cannot drift.
 */
export default function MobileFlexPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [scope, setScope] = useState<Scope>("overall");
  const [region, setRegion] = useState<string>(ALL_REGIONS_FILTER);

  const activeRows = useMemo(
    () => (report ? report.rows.filter(isRecordsPageVisibleRow) : []),
    [report],
  );

  const scopedRows = useMemo(() => {
    switch (scope) {
      case "warranty":
        return activeRows.filter(isWarrantyCase);
      case "trade":
        return activeRows.filter(isTradeCase);
      default:
        return activeRows;
    }
  }, [activeRows, scope]);

  const rows = useMemo(
    () => filterRowsByRegion(scopedRows, region),
    [scopedRows, region],
  );

  // Region tabs carry the same counts the desktop shows next to each region.
  const regionOptions = useMemo(() => {
    if (!report) return [];
    return report.regionBreakdown.map((entry) => ({
      value: entry.aspCode,
      label: entry.regionName,
      count: scopedRows.filter(
        (row) =>
          String(row.output["Work Location"] ?? "").trim().toUpperCase() ===
          entry.aspCode.toUpperCase(),
      ).length,
    }));
  }, [report, scopedRows]);

  return (
    <>
      <AppBar
        title="Flex Dashboard"
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
            <div className="mMuted">Loading Flex…</div>
          </div>
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
                  {s === "overall"
                    ? `Overall (${activeRows.length})`
                    : s === "warranty"
                      ? `Warranty (${activeRows.filter(isWarrantyCase).length})`
                      : `Trade (${activeRows.filter(isTradeCase).length})`}
                </button>
              ))}
            </div>

            {regionOptions.length > 0 && (
              <select
                className="mSelect"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ marginTop: 12 }}
              >
                <option value={ALL_REGIONS_FILTER}>
                  All Regions ({scopedRows.length})
                </option>
                {regionOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} ({r.count})
                  </option>
                ))}
              </select>
            )}

            <div className="mMuted" style={{ margin: "12px 2px 10px" }}>
              {rows.length.toLocaleString()} cases · tap a Flex status to drill in
            </div>

            <StatusBreakdown
              rows={rows}
              column="Flex Status"
              session={session}
              onSaved={reload}
              emptyText="No cases."
            />
          </>
        )}
      </main>
    </>
  );
}
