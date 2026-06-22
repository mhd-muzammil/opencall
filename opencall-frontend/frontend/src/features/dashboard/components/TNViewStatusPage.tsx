// TN View Status page component that renders the KPI summary report inline.
import type { Dispatch, SetStateAction } from "react";
import { downloadRegionSummaryExcel } from "../../../lib/excelExport";
import type { ReportRow } from "../types";

export function TNViewStatusPage({
  selectedRegion,
  setSelectedRegion,
  activeRegionName,
  activeRegionBreakdown,
  tnViewMode,
  setTnViewMode,
  tnFilterType,
  setTnFilterType,
  selectedTnValue,
  setSelectedTnValue,
  regionDateMetadata,
  tnDateLabel,
  regionKpiMetrics,
  tnFilteredRows,
  getParsedDateForExcel,
  isSuperAdmin,
}: Readonly<{
  selectedRegion: string | null;
  setSelectedRegion: (region: string | null) => void;
  activeRegionName: string;
  activeRegionBreakdown: Array<{ aspCode: string; regionName: string; count: number }>;
  tnViewMode: "BOD" | "EOD";
  setTnViewMode: Dispatch<SetStateAction<"BOD" | "EOD">>;
  tnFilterType: string;
  setTnFilterType: Dispatch<SetStateAction<string>>;
  selectedTnValue: string;
  setSelectedTnValue: Dispatch<SetStateAction<string>>;
  regionDateMetadata: { datesList: string[]; monthsList: string[] };
  tnDateLabel: string;
  regionKpiMetrics: {
    engineerCount: number;
    enggPresents: number;
    openCalls: number;
    actionable: number;
    planned: number;
    closedCalls: number;
    enggOnsite: number;
    toBeSchedule: number;
    cxReschedule: number;
    sscPending: number;
    elevateTech: number;
    underObservation: number;
    toBeYank: number;
    closedCancelled: number;
    addPartOrdered: number;
    toBeCancel: number;
    newCalls: number;
    tradeOpenCalls: number;
  } | null;
  tnFilteredRows: ReportRow[];
  getParsedDateForExcel: (filterType: string, selectedValue: string) => string;
  isSuperAdmin: boolean;
}>) {
  // If no region is selected (e.g. selectedRegion is null or "ALL") and the user is a Super Admin
  const hasNoRegionSelected = !selectedRegion || selectedRegion === "ALL";

  return (
    <div className="panel" style={{ display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "16px", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>📊 TN VIEW Status Summary ({tnViewMode} View)</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            {!hasNoRegionSelected ? `Showing metrics breakdown for ${activeRegionName}` : "Select a region to view its metrics breakdown"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Region Picker for Super Admin */}
          {isSuperAdmin && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Region:</span>
              <select
                value={selectedRegion ?? "ALL"}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedRegion(val === "ALL" ? null : val);
                }}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              >
                <option value="ALL">Select Region</option>
                {activeRegionBreakdown
                  .filter((entry) => entry.count > 0)
                  .map((entry) => (
                    <option key={entry.aspCode || entry.regionName} value={entry.aspCode}>
                      {entry.regionName}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {!hasNoRegionSelected && (
            <>
              {/* EOD/BOD Toggle Segment */}
              <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: "8px", padding: "2px", border: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  onClick={() => setTnViewMode("BOD")}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "700",
                    border: "none",
                    cursor: "pointer",
                    background: tnViewMode === "BOD" ? "#ffffff" : "transparent",
                    color: tnViewMode === "BOD" ? "#0284c7" : "#475569",
                    boxShadow: tnViewMode === "BOD" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  🌅 BOD View
                </button>
                <button
                  type="button"
                  onClick={() => setTnViewMode("EOD")}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "700",
                    border: "none",
                    cursor: "pointer",
                    background: tnViewMode === "EOD" ? "#ffffff" : "transparent",
                    color: tnViewMode === "EOD" ? "#0284c7" : "#475569",
                    boxShadow: tnViewMode === "EOD" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  🌃 EOD View
                </button>
              </div>

              {/* Filter Type */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Filter:</span>
                <select
                  value={tnFilterType}
                  onChange={(e) => setTnFilterType(e.target.value)}
                  style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
                >
                  <option value="Today">Today</option>
                  <option value="Specific Date">Specific Date</option>
                  <option value="Specific Month">Specific Month</option>
                  <option value="All Dates">All History</option>
                </select>
              </div>

              {/* Conditional Specific Date / Specific Month value */}
              {(tnFilterType === "Specific Date" || tnFilterType === "Specific Month") && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                    {tnFilterType === "Specific Date" ? "Date:" : "Month:"}
                  </span>
                  <select
                    value={selectedTnValue}
                    onChange={(e) => setSelectedTnValue(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
                  >
                    {tnFilterType === "Specific Date"
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
                style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", borderColor: "#0284c7", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff", minHeight: "36px", padding: "0 14px", fontSize: "13px" }}
                onClick={() => {
                  downloadRegionSummaryExcel(activeRegionName, getParsedDateForExcel(tnFilterType, selectedTnValue), tnFilteredRows, false, tnViewMode === "BOD");
                }}
              >
                📥 Download Summary Excel
              </button>
            </>
          )}
        </div>
      </div>

      <div>
        {hasNoRegionSelected ? (
          <div style={{ padding: "40px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", background: "#f8fafc" }}>
            <span style={{ fontSize: "24px" }}>🗺️</span>
            <p style={{ margin: "10px 0 0 0", fontSize: "14px", fontWeight: "600", color: "var(--muted)" }}>
              Please select a region from the dropdown menu to view the TN VIEW Status metrics summary.
            </p>
          </div>
        ) : regionKpiMetrics ? (
          <div style={{ overflowX: "auto" }}>
            <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0284c7", color: "#ffffff", fontWeight: "bold" }}>
                  <td colSpan={2} style={{ padding: "12px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: "700" }}>Applied Period: {tnDateLabel} ({tnViewMode})</td>
                  <td style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "right", fontSize: "14px", fontWeight: "700" }}>{activeRegionName}</td>
                </tr>
                <tr style={{ background: "#fef08a", color: "#854d0e", fontWeight: "bold" }}>
                  <td style={{ width: "80px", padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>S.No</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Description</td>
                  <td style={{ width: "150px", padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Count</td>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 1, desc: "Engineer Count", val: regionKpiMetrics.engineerCount },
                  { id: 2, desc: "No.of Engg Presents", val: regionKpiMetrics.enggPresents },
                  { id: 3, desc: "Open Calls", val: regionKpiMetrics.openCalls },
                  { id: 4, desc: "Actionable Calls", val: regionKpiMetrics.actionable },
                  { id: 5, desc: "Planned Calls", val: regionKpiMetrics.planned },
                  { id: 6, desc: "Attended", val: regionKpiMetrics.planned },
                  { id: 7, desc: "Closed Calls", val: regionKpiMetrics.closedCalls, alert: true },
                  { id: 8, desc: "Engg onsite", val: regionKpiMetrics.enggOnsite },
                  { id: 9, desc: "To be schedule", val: regionKpiMetrics.toBeSchedule },
                  { id: 10, desc: "CX Reschedule Calls", val: regionKpiMetrics.cxReschedule },
                  { id: 11, desc: "SSC Pending Calls", val: regionKpiMetrics.sscPending },
                  { id: 12, desc: "Elevate/Tech Support Calls", val: regionKpiMetrics.elevateTech },
                  { id: 13, desc: "Under observation Calls", val: regionKpiMetrics.underObservation },
                  { id: 14, desc: "To be Yank", val: regionKpiMetrics.toBeYank },
                  { id: 15, desc: "Closed cancelled", val: regionKpiMetrics.closedCancelled },
                  { id: 16, desc: "Add.Part ordered", val: regionKpiMetrics.addPartOrdered, alert: true },
                  { id: 17, desc: "To be Cancel", val: regionKpiMetrics.toBeCancel },
                  { id: 18, desc: "New calls", val: regionKpiMetrics.newCalls, alert: true },
                  { id: 19, desc: "Trade Open Calls", val: regionKpiMetrics.tradeOpenCalls },
                ].map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{m.id}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#334155" }}>{m.desc}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", background: m.alert ? "#fef08a" : "transparent", color: m.alert ? "#854d0e" : "#0f172a", fontWeight: "bold" }}>{m.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "20px", textAlign: "center", border: "1px solid var(--border)", borderRadius: "8px", background: "#f8fafc" }}>
            <p style={{ margin: 0, color: "var(--danger)", fontWeight: "bold" }}>Error loading KPI Summary data for this region.</p>
          </div>
        )}
      </div>
    </div>
  );
}
