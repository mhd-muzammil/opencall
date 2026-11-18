"use client";

import { useMemo, useState } from "react";
import type { CallBrand } from "@opencall/shared";
import { AppBar } from "../AppBar";
import { CaseList } from "../CaseList";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { isTodayCallPlanVisibleRow } from "../../../lib/reportDashboardAnalytics";

/** Active records — the same row set the web Records table shows. */
export default function MobileRecordsPage() {
  const { session } = useMobileSession();
  // HP's calls or Acer's, like the web Records page's tabs.
  const [brand, setBrand] = useState<CallBrand>("HP");
  const { report, loading, error, reload } = useMobileReport(session, brand);

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
        <div className="mSegment" role="tablist" aria-label="Brand">
          {(["HP", "ACER"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={brand === value}
              className={`mSegment__btn ${brand === value ? "is-active" : ""}`}
              onClick={() => setBrand(value)}
            >
              {value === "HP" ? "HP" : "Acer"}
            </button>
          ))}
        </div>
        {error && <div className="mError">{error}</div>}
        {loading ? (
          <div className="mCard" style={{ textAlign: "center", padding: 26 }}>
            <div className="mSpinner" />
            <div className="mMuted">Loading records…</div>
          </div>
        ) : (
          <CaseList
            rows={rows}
            emptyText={brand === "HP" ? "No active records in the latest report." : "No open Acer calls in the latest report."}
            session={session}
            onSaved={reload}
          />
        )}
      </main>
    </>
  );
}
