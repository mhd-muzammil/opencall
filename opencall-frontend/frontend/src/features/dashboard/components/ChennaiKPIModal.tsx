// Chennai Region Dashboard Summary (EOD/BOD view) modal extracted from
// app/page.tsx (Phase 6.7). JSX preserved verbatim; props passed explicitly (no
// KPI-calculation, EOD/BOD-filtering, state, handler, or modal-behavior changes).
// The
// `isChennaiKpiModalOpen && selectedRegion && selectedRegion !== "ALL" && chennaiKpiMetrics`
// render guard stays in page.tsx, so `chennaiKpiMetrics` is always non-null here.
import type { Dispatch, SetStateAction } from "react";
import { downloadRegionSummaryExcel } from "../../../lib/excelExport";
import { formatDisplayDateOnly } from "../utils";
import type { ReportRow } from "../types";

export function ChennaiKPIModal({
  activeRegionName,
  eodBodViewMode,
  setEodBodViewMode,
  eodBodFilterType,
  setEodBodFilterType,
  selectedEodBodValue,
  setSelectedEodBodValue,
  regionDateMetadata,
  chennaiKpiMetrics,
  eodBodFilteredRows,
  getParsedDateForExcel,
  getDayOfWeek,
  setIsChennaiKpiModalOpen,
}: Readonly<{
  activeRegionName: string;
  eodBodViewMode: "BOD" | "EOD";
  setEodBodViewMode: Dispatch<SetStateAction<"BOD" | "EOD">>;
  eodBodFilterType: string;
  setEodBodFilterType: Dispatch<SetStateAction<string>>;
  selectedEodBodValue: string;
  setSelectedEodBodValue: Dispatch<SetStateAction<string>>;
  regionDateMetadata: { datesList: string[]; monthsList: string[] };
  chennaiKpiMetrics: {
    openCalls: number;
    actionable: number;
    planned: number;
    callAllocation: string;
    printOpenGe2: number;
    printActionableGe2: number;
    printScheduledGe2: number;
    openCallsGt10: number;
    actionableGt10: number;
    scheduledGt10: number;
    mpsGt1: number;
    eodCloser: number;
    newCalls: number;
    csoDaysInventory: string;
    enggCount: number;
    engAvlInField: number;
    enggProductivity: string;
    missedToSchedule: number;
    missedByEng: number;
    gTotalMissed: number;
    pctMissed: number;
    closureAdherence: number;
    flexBackend: number;
    ssc: number;
    hpBackend: number;
    obsCustomer: number;
    cuPending: number;
    physicalClosed: number;
    totalNaf: number;
    sscPct: number;
  };
  eodBodFilteredRows: ReportRow[];
  getParsedDateForExcel: (filterType: string, selectedValue: string) => string;
  getDayOfWeek: (dateStr: string) => string;
  setIsChennaiKpiModalOpen: Dispatch<SetStateAction<boolean>>;
}>) {
  return (
    <div className="drawerOverlay" style={{ zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.45)" }} onClick={() => setIsChennaiKpiModalOpen(false)}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          width: "min(1000px, 98vw)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)",
          padding: "24px",
          display: "grid",
          gap: "18px",
          position: "relative",
          border: "1px solid var(--border)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>📊 {activeRegionName} Dashboard Summary ({eodBodViewMode} View)</h2>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              Showing {eodBodViewMode} summary for {activeRegionName}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* EOD/BOD Toggle Segment */}
            <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: "8px", padding: "2px", border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                onClick={() => setEodBodViewMode("BOD")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "700",
                  border: "none",
                  cursor: "pointer",
                  background: eodBodViewMode === "BOD" ? "#ffffff" : "transparent",
                  color: eodBodViewMode === "BOD" ? "#0284c7" : "#475569",
                  boxShadow: eodBodViewMode === "BOD" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                🌅 BOD View
              </button>
              <button
                type="button"
                onClick={() => setEodBodViewMode("EOD")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "700",
                  border: "none",
                  cursor: "pointer",
                  background: eodBodViewMode === "EOD" ? "#ffffff" : "transparent",
                  color: eodBodViewMode === "EOD" ? "#0284c7" : "#475569",
                  boxShadow: eodBodViewMode === "EOD" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                🌃 EOD View
              </button>
            </div>

            {/* Filter Type */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Filter:</span>
              <select
                value={eodBodFilterType}
                onChange={(e) => setEodBodFilterType(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              >
                <option value="Today">Today</option>
                <option value="Specific Date">Specific Date</option>
                <option value="Specific Month">Specific Month</option>
                <option value="All Dates">All History</option>
              </select>
            </div>

            {/* Conditional Specific Date / Specific Month value */}
            {(eodBodFilterType === "Specific Date" || eodBodFilterType === "Specific Month") && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                  {eodBodFilterType === "Specific Date" ? "Date:" : "Month:"}
                </span>
                <select
                  value={selectedEodBodValue}
                  onChange={(e) => setSelectedEodBodValue(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
                >
                  {eodBodFilterType === "Specific Date"
                    ? regionDateMetadata.datesList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))
                    : regionDateMetadata.monthsList.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))
                  }
                </select>
              </div>
            )}

            <button
              type="button"
              className="secondaryButton"
              style={{ minHeight: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "13px" }}
              onClick={() => setIsChennaiKpiModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
            {/* Left Table - CHENNAI DASHBOARD */}
            <div>
              <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#bae6fd", color: "#0f172a", fontWeight: "bold" }}>
                    <td colSpan={2} style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "800" }}>
                      CHENNAI DASHBOARD
                    </td>
                    <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", fontSize: "12px", background: "#f1f5f9" }}>
                      {(() => {
                        const dateParam = getParsedDateForExcel(eodBodFilterType, selectedEodBodValue);
                        const day = getDayOfWeek(dateParam);
                        const formatted = formatDisplayDateOnly(dateParam);
                        return day ? `${day} / ${formatted}` : formatted;
                      })()}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: 1, desc: "Total open call", val: chennaiKpiMetrics.openCalls },
                    { id: 2, desc: "Total field Actionable call", val: chennaiKpiMetrics.actionable },
                    { id: 3, desc: "Total Call Scheduled", val: chennaiKpiMetrics.planned },
                    { id: 4, desc: "Call Allocation Engineer Wise", val: chennaiKpiMetrics.callAllocation },
                    { id: 5, desc: "Print - Open call (=>2 days)", val: chennaiKpiMetrics.printOpenGe2 },
                    { id: 6, desc: "Print - Actionable call (=>2 days)", val: chennaiKpiMetrics.printActionableGe2 },
                    { id: 7, desc: "Print - Scheduled (=>2 days)", val: chennaiKpiMetrics.printScheduledGe2 },
                    { id: 8, desc: "Open call (>10 days)", val: chennaiKpiMetrics.openCallsGt10 },
                    { id: 9, desc: "Actionable call (>10 days)", val: chennaiKpiMetrics.actionableGt10 },
                    { id: 10, desc: "Call Scheduled (>10 days)", val: chennaiKpiMetrics.scheduledGt10 },
                    { id: 11, desc: "MPS >1 Days", val: chennaiKpiMetrics.mpsGt1 ?? 0 },
                    { id: 12, desc: "EOD Call Closer", val: chennaiKpiMetrics.eodCloser ?? 0 },
                    { id: 13, desc: "New Calls Received", val: chennaiKpiMetrics.newCalls ?? 0 },
                    { id: 14, desc: "CSO Days Inventory", val: chennaiKpiMetrics.csoDaysInventory, isInventory: true },
                    { id: 15, desc: "Total Eng Count", val: chennaiKpiMetrics.enggCount },
                    { id: 16, desc: "Eng Avl in Field", val: chennaiKpiMetrics.engAvlInField },
                    { id: 17, desc: "Engineers Productivity", val: chennaiKpiMetrics.enggProductivity },
                    { id: 18, desc: "Missed to schedule field action calls due to non avl of Eng", val: chennaiKpiMetrics.missedToSchedule ?? 0 },
                    { id: 19, desc: "Missed by Eng to attend scheduled Call (High call allocation)", val: chennaiKpiMetrics.missedByEng ?? 0, isMissedByEng: true },
                    { id: 20, desc: "G Total (Missed to schedule & Attend Daily basis)", val: chennaiKpiMetrics.gTotalMissed ?? 0 },
                    { id: 21, desc: "% - Missed to schedule & Attend Daily call", val: `${chennaiKpiMetrics.pctMissed}%`, isPctMissed: true },
                    { id: 22, desc: "Closure Adherence", val: `${chennaiKpiMetrics.closureAdherence}%`, isAdherence: true },
                  ].map((m) => {
                    let bg = "transparent";
                    let fg = "#334155";
                    let weight = "normal";

                    if (m.isInventory) {
                      bg = m.val === "#DIV/0!" ? "#fee2e2" : "transparent";
                      fg = m.val === "#DIV/0!" ? "#dc2626" : "#334155";
                      weight = "bold";
                    } else if (m.isMissedByEng) {
                      bg = "#ffedd5";
                      fg = "#c2410c";
                    } else if (m.isPctMissed) {
                      bg = "#f1f5f9";
                      fg = "#334155";
                      weight = "bold";
                    } else if (m.isAdherence) {
                      bg = "#eab308";
                      fg = "#713f12";
                      weight = "bold";
                    }

                    return (
                      <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155", width: "40px" }}>{m.id}</td>
                        <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", color: "#334155", fontWeight: m.isAdherence ? "bold" : "normal" }}>{m.desc}</td>
                        <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "center", background: bg, color: fg, fontWeight: weight }}>{m.val}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Right Table - NAF ANALYSIS */}
            <div>
              <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#ffedd5", color: "#c2410c", fontWeight: "bold" }}>
                    <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Date</td>
                    <td style={{ padding: "10px", border: "1px solid #cbd5e1", background: "#fef08a", color: "#854d0e", textAlign: "center", fontSize: "13px", fontWeight: "800" }}>
                      {(() => {
                        const dateParam = getParsedDateForExcel(eodBodFilterType, selectedEodBodValue);
                        return formatDisplayDateOnly(dateParam);
                      })()}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Non Action-Field", val: chennaiKpiMetrics.totalNaf, isHeader: true },
                    { label: "Flex Backend", val: chennaiKpiMetrics.flexBackend ?? 0 },
                    { label: "SSC", val: chennaiKpiMetrics.ssc ?? 0 },
                    { label: "HP Backend", val: chennaiKpiMetrics.hpBackend ?? 0 },
                    { label: "OBS-Customer", val: chennaiKpiMetrics.obsCustomer ?? 0 },
                    { label: "Cu Pending", val: chennaiKpiMetrics.cuPending ?? 0 },
                    { label: "Physical Closed", val: chennaiKpiMetrics.physicalClosed ?? 0 },
                    { label: "Total NAF", val: chennaiKpiMetrics.totalNaf, isTotal: true },
                    { label: "SSC%", val: `${chennaiKpiMetrics.sscPct}%`, isSscPct: true },
                  ].map((r, index) => {
                    let bg = "transparent";
                    let fg = "#334155";
                    let weight = "normal";

                    if (r.isHeader) {
                      bg = "#ffedd5";
                      fg = "#c2410c";
                      weight = "bold";
                    } else if (r.isTotal) {
                      bg = "#f1f5f9";
                      weight = "bold";
                    } else if (r.isSscPct) {
                      bg = "#fed7aa";
                      fg = "#ea580c";
                      weight = "bold";
                    }

                    return (
                      <tr key={index} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", color: fg, fontWeight: weight, background: r.isHeader ? bg : "transparent" }}>{r.label}</td>
                        <td style={{ padding: "8px 12px", border: "1px solid #cbd5e1", textAlign: "center", background: bg, color: fg, fontWeight: "bold" }}>{r.val}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => setIsChennaiKpiModalOpen(false)}
          >
            Close
          </button>
          <button
            type="button"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", borderColor: "#0ea5e9", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff" }}
            onClick={() => {
              downloadRegionSummaryExcel(activeRegionName, getParsedDateForExcel(eodBodFilterType, selectedEodBodValue), eodBodFilteredRows, true, eodBodViewMode === "BOD");
            }}
          >
            📥 Download Summary Excel
          </button>
        </div>
      </div>
    </div>
  );
}
