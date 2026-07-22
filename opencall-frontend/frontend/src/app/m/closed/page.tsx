"use client";

import { useMemo } from "react";
import { AppBar } from "../AppBar";
import { CaseList } from "../CaseList";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";

/** Closed calls — the same row set the web Closed Calls dashboard shows. */
export default function MobileClosedPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const rows = useMemo(
    () => (report ? report.rows.filter((r) => r.carryForward.closedSyntheticRow) : []),
    [report],
  );

  return (
    <>
      <AppBar
        title="Closed Calls"
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
            <div className="mMuted">Loading closed calls…</div>
          </div>
        ) : (
          <CaseList rows={rows} emptyText="No closed calls in the latest report." />
        )}
      </main>
    </>
  );
}
