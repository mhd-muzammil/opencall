"use client";

import { useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { CaseList } from "../CaseList";
import { useMobileSession } from "../session";
import { useMobileReport } from "../useMobileReport";
import { isRecordsPageVisibleRow } from "../../../lib/reportDashboardAnalytics";
import {
  isPcCase,
  isPrintFixCase,
  isPrintInstallationCase,
} from "../../../features/dashboard/utils/caseClassification";
import type { GeneratedReportResponse } from "../../../lib/api/types";

type Row = GeneratedReportResponse["rows"][number];
type Bucket = "within" | "breached" | "pending";

/**
 * SLA TaT — the same three case sets and the same rule as SLATatPage.tsx:
 * rows without a Ticket ID are skipped entirely, a blank / "Manual Entry Required" /
 * unparseable TAT counts as Pending, otherwise `now < TAT` is Within and anything else
 * is Breached. Adherence = within / (within + breached), 100 when there is nothing valid.
 */
function bucketOf(row: Row, now: Date): Bucket | null {
  const ticketId = String(row.output["Ticket ID"] ?? "").trim();
  if (!ticketId) return null;

  const tatVal = row.output["TAT"];
  const text = String(tatVal ?? "").trim();
  if (!tatVal || text === "" || text === "Manual Entry Required") return "pending";

  const tatDate = new Date(String(tatVal));
  if (Number.isNaN(tatDate.getTime())) return "pending";

  return now < tatDate ? "within" : "breached";
}

const CASE_TYPES = [
  { key: "pc", label: "PC Cases", match: isPcCase },
  { key: "printFix", label: "Print Fix Cases", match: isPrintFixCase },
  { key: "printInstall", label: "Print Installation", match: isPrintInstallationCase },
] as const;

export default function MobileSlaPage() {
  const { session } = useMobileSession();
  const { report, loading, error, reload } = useMobileReport(session);

  const [region, setRegion] = useState("ALL");
  const [drill, setDrill] = useState<{ type: string; bucket: Bucket } | null>(null);

  const rows = useMemo(() => {
    if (!report) return [];
    const active = report.rows.filter(isRecordsPageVisibleRow);
    if (region === "ALL") return active;
    const target = region.trim().toUpperCase();
    return active.filter(
      (r) => String(r.output["Work Location"] ?? "").trim().toUpperCase() === target,
    );
  }, [report, region]);

  // Recomputed whenever the row set changes — the web reads `new Date()` per render too.
  const now = useMemo(() => new Date(), [rows]);

  const stats = useMemo(
    () =>
      CASE_TYPES.map((t) => {
        const typeRows = rows.filter(t.match);
        let within = 0;
        let breached = 0;
        let pending = 0;
        for (const r of typeRows) {
          const b = bucketOf(r, now);
          if (b === "within") within += 1;
          else if (b === "breached") breached += 1;
          else if (b === "pending") pending += 1;
        }
        const valid = within + breached;
        return {
          ...t,
          total: typeRows.length,
          within,
          breached,
          pending,
          adherence: valid > 0 ? Math.round((within / valid) * 100) : 100,
        };
      }),
    [rows, now],
  );

  const drillRows = useMemo(() => {
    if (!drill) return [];
    const t = CASE_TYPES.find((c) => c.key === drill.type);
    if (!t) return [];
    return rows.filter((r) => t.match(r) && bucketOf(r, now) === drill.bucket);
  }, [rows, drill, now]);

  const regions = report?.regionBreakdown ?? [];

  return (
    <>
      <AppBar
        title="SLA TaT"
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
            <div className="mMuted">Loading SLA…</div>
          </div>
        ) : drill ? (
          <>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              style={{ marginBottom: 12 }}
              onClick={() => setDrill(null)}
            >
              ← {CASE_TYPES.find((c) => c.key === drill.type)?.label} ·{" "}
              {drill.bucket} ({drillRows.length})
            </button>
            <CaseList
              rows={drillRows}
              emptyText="No cases in this bucket."
              session={session}
              onSaved={reload}
            />
          </>
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

            {stats.map((s) => (
              <div key={s.key} className="mCard" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 750, fontSize: 14 }}>{s.label}</div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: s.adherence >= 90
                        ? "var(--m-good)"
                        : s.adherence >= 70
                          ? "var(--m-warn)"
                          : "var(--m-danger)",
                    }}
                  >
                    {s.adherence}% SLA
                  </div>
                </div>
                <div className="mMuted" style={{ fontSize: 12, marginTop: 2 }}>
                  {s.total} cases
                </div>

                {/* Adherence bar */}
                <div
                  style={{
                    display: "flex",
                    height: 7,
                    borderRadius: 999,
                    overflow: "hidden",
                    marginTop: 10,
                    background: "var(--m-border)",
                  }}
                >
                  <div style={{ width: `${s.total ? (s.within / s.total) * 100 : 0}%`, background: "var(--m-good)" }} />
                  <div style={{ width: `${s.total ? (s.breached / s.total) * 100 : 0}%`, background: "var(--m-danger)" }} />
                  <div style={{ width: `${s.total ? (s.pending / s.total) * 100 : 0}%`, background: "#94a3b8" }} />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {([
                    { b: "within" as const, label: "Within", value: s.within, color: "var(--m-good)" },
                    { b: "breached" as const, label: "Breached", value: s.breached, color: "var(--m-danger)" },
                    { b: "pending" as const, label: "Pending", value: s.pending, color: "#64748b" },
                  ]).map((x) => (
                    <button
                      key={x.b}
                      type="button"
                      onClick={() => x.value > 0 && setDrill({ type: s.key, bucket: x.b })}
                      style={{
                        flex: 1,
                        border: "1px solid var(--m-border)",
                        borderRadius: 10,
                        background: "transparent",
                        padding: "8px 4px",
                        cursor: x.value > 0 ? "pointer" : "default",
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 800, color: x.color }}>{x.value}</div>
                      <div style={{ fontSize: 10, color: "var(--m-muted)", fontWeight: 600 }}>{x.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </>
  );
}
