"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { FeedbackSheet } from "../FeedbackSheet";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import type { GeneratedReportResponse } from "../../../lib/api/types";

type Row = GeneratedReportResponse["rows"][number];

function val(row: Row, key: string): string {
  return String((row.output as Record<string, unknown>)[key] ?? "").trim();
}

/** Same rule as the web: view-only special-access credentials cannot save feedback. */
function canEdit(role: string | undefined, level: string | undefined): boolean {
  if (role !== "SPECIAL_ACCESS") return true;
  return level === "edit";
}

/**
 * Closed Calls — mirrors the web dashboard: region filter, Closed Date range filter
 * (which also drives the counts), search, and per-case customer feedback.
 */
export default function MobileClosedPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [region, setRegion] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [detail, setDetail] = useState<Row | null>(null);
  const [feedbackRow, setFeedbackRow] = useState<Row | null>(null);

  const closedRows = useMemo(
    () => (report ? report.rows.filter((r) => r.carryForward.closedSyntheticRow) : []),
    [report],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return closedRows.filter((row) => {
      if (region !== "ALL") {
        if (val(row, "Work Location").toUpperCase() !== region) return false;
      }
      // Closed Date range — the value is DD-MM-YYYY; compare as YYYY-MM-DD.
      if (from || to) {
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(val(row, "Case Closed Date"));
        if (!m) return false;
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        if (from && iso < from) return false;
        if (to && iso > to) return false;
      }
      if (!q) return true;
      return ["Ticket ID", "Case ID", "Customer Name", "Engineer", "WO OTC CODE"].some(
        (k) => val(row, k).toLowerCase().includes(q),
      );
    });
  }, [closedRows, region, from, to, search]);

  const visible = filtered.slice(0, limit);
  const regions = report?.regionBreakdown ?? [];
  const editable = canEdit(
    session?.user.role,
    session?.user.specialAccess?.permissionLevel,
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
          <>
            <div className="mKpiGrid" style={{ marginBottom: 12 }}>
              <div className="mKpi" style={{ cursor: "default" }}>
                <div className="mKpi__label">Showing</div>
                <div className="mKpi__value" style={{ color: "var(--m-good)" }}>
                  {filtered.length.toLocaleString()}
                </div>
                <div className="mKpi__hint">of {closedRows.length.toLocaleString()} closed</div>
              </div>
              <div className="mKpi" style={{ cursor: "default" }}>
                <div className="mKpi__label">Regions</div>
                <div className="mKpi__value" style={{ color: "var(--m-primary)" }}>
                  {regions.length}
                </div>
                <div className="mKpi__hint">operational</div>
              </div>
            </div>

            {regions.length > 0 && (
              <select
                className="mSelect"
                value={region}
                onChange={(e) => { setRegion(e.target.value); setLimit(50); }}
                style={{ marginBottom: 10 }}
              >
                <option value="ALL">All Regions ({regions.length})</option>
                {regions.map((r) => (
                  <option key={r.aspCode} value={r.aspCode.toUpperCase()}>
                    {r.regionName} ({r.aspCode})
                  </option>
                ))}
              </select>
            )}

            <div className="mCard" style={{ marginBottom: 10, padding: "12px 14px" }}>
              <div className="mKpi__label" style={{ marginBottom: 8 }}>Closed date range</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="mInput"
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setLimit(50); }}
                />
                <input
                  className="mInput"
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setLimit(50); }}
                />
              </div>
              {(from || to) && (
                <button
                  type="button"
                  className="mBtn mBtn--ghost"
                  style={{ marginTop: 10, minHeight: 40 }}
                  onClick={() => { setFrom(""); setTo(""); }}
                >
                  Clear dates
                </button>
              )}
            </div>

            <input
              className="mSearch"
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLimit(50); }}
              placeholder="Search ticket, customer, engineer…"
              style={{ marginBottom: 12 }}
            />

            {visible.length === 0 ? (
              <div className="mCard">
                <div className="mMuted">No closed calls match the current filters.</div>
              </div>
            ) : (
              <div className="mList">
                {visible.map((row) => {
                  const status = val(row, "Customer Status");
                  return (
                    <button
                      key={row.id ?? row.serialNo}
                      type="button"
                      className="mRow"
                      onClick={() => setDetail(row)}
                    >
                      <div className="mRow__top">
                        <span className="mRow__title">{val(row, "Ticket ID") || "—"}</span>
                        {val(row, "Case Closed Date") && (
                          <span className="mChip mChip--good">
                            {val(row, "Case Closed Date")}
                          </span>
                        )}
                      </div>
                      <div className="mRow__meta">
                        {val(row, "Customer Name") || "No customer"}
                        {val(row, "Engineer") ? ` · ${val(row, "Engineer")}` : ""}
                        {status ? <><br />💬 {status}</> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {filtered.length > visible.length && (
              <button
                type="button"
                className="mBtn mBtn--ghost"
                style={{ marginTop: 12 }}
                onClick={() => setLimit((l) => l + 50)}
              >
                Load more
              </button>
            )}
          </>
        )}
      </main>

      {detail && (
        <div className="mSheetBackdrop" onClick={() => setDetail(null)}>
          <div className="mSheet" onClick={(e) => e.stopPropagation()}>
            <div className="mSheet__grip" />
            <div className="mSheet__title">{val(detail, "Ticket ID") || "Case detail"}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {Object.entries(detail.output as Record<string, unknown>)
                .filter(([, v]) => String(v ?? "").trim() !== "")
                .map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                      {k}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 2, wordBreak: "break-word" }}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" className="mBtn mBtn--ghost" onClick={() => setDetail(null)}>
                Close
              </button>
              {editable && (
                <button
                  type="button"
                  className="mBtn"
                  onClick={() => { setFeedbackRow(detail); setDetail(null); }}
                >
                  💬 Feedback
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {feedbackRow && session && (
        <FeedbackSheet
          row={feedbackRow}
          session={session}
          onClose={() => setFeedbackRow(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
