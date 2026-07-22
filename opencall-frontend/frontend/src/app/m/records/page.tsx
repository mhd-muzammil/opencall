"use client";

import { useMemo } from "react";
import { AppBar } from "../AppBar";
import { CaseList } from "../CaseList";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { isTodayCallPlanVisibleRow } from "../../../lib/reportDashboardAnalytics";

/** Active records — the same row set the web Records table shows. */
export default function MobileRecordsPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const rows = useMemo(
    () => (report ? report.rows.filter(isTodayCallPlanVisibleRow) : []),
    [report],
  );

  return (
    <>
      <AppBar
        title="Records"
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
            <div className="mMuted">Loading records…</div>
          </div>
        ) : (
          <CaseList
            rows={rows}
            emptyText="No active records in the latest report."
            session={session}
            onSaved={reload}
          />
        )}
      </main>
    </>
  );
}
