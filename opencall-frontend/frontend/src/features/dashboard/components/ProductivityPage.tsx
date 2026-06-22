// Engineer Productivity dashboard page extracted from app/page.tsx (Phase 6.5) and updated to render as a separate page view.
import type { Dispatch, SetStateAction } from "react";
import { downloadEngineerProductivityExcel } from "../../../lib/excelExport";

export function ProductivityPage({
  selectedRegion,
  activeRegionName,
  productivityFilterType,
  setProductivityFilterType,
  selectedProductivityValue,
  setSelectedProductivityValue,
  engineerProductivityMetrics,
  productivityDateLabel,
}: Readonly<{
  selectedRegion: string | null;
  activeRegionName: string;
  productivityFilterType: string;
  setProductivityFilterType: Dispatch<SetStateAction<string>>;
  selectedProductivityValue: string;
  setSelectedProductivityValue: Dispatch<SetStateAction<string>>;
  engineerProductivityMetrics: {
    list: Array<{
      name: string;
      assigned: number;
      attended: number;
      closed: number;
      partOrdered: number;
      underObservation: number;
      cxReschedule: number;
    }>;
    totalAttended: number;
    monthsList: string[];
    datesList: string[];
  };
  productivityDateLabel: string;
}>) {
  return (
    <div className="panel" style={{ display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "16px", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>👥 Engineer Productivity Dashboard</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            Showing status breakdown {selectedRegion && selectedRegion !== "ALL" ? `for ${activeRegionName}` : "globally across all regions"}
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Filter Type */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Filter:</span>
            <select
              value={productivityFilterType}
              onChange={(e) => setProductivityFilterType(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
            >
              <option value="Today">Today</option>
              <option value="Specific Date">Specific Date</option>
              <option value="Specific Month">Specific Month</option>
              <option value="All Dates">All History</option>
            </select>
          </div>

          {/* Conditional Specific Date / Specific Month value */}
          {(productivityFilterType === "Specific Date" || productivityFilterType === "Specific Month") && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                {productivityFilterType === "Specific Date" ? "Date:" : "Month:"}
              </span>
              <select
                value={selectedProductivityValue}
                onChange={(e) => setSelectedProductivityValue(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              >
                {productivityFilterType === "Specific Date"
                  ? engineerProductivityMetrics.datesList.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))
                  : engineerProductivityMetrics.monthsList.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))
                }
              </select>
            </div>
          )}

          <button
            type="button"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderColor: "#f97316", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff", minHeight: "36px", padding: "0 14px", fontSize: "13px" }}
            onClick={() => {
              downloadEngineerProductivityExcel(
                activeRegionName || "Global",
                productivityDateLabel,
                engineerProductivityMetrics.list,
                engineerProductivityMetrics.totalAttended
              );
            }}
          >
            📥 Download Excel
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
              <td colSpan={8} style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "14px", fontWeight: "800" }}>
                Filter Applied: {productivityDateLabel}
              </td>
            </tr>
            <tr style={{ background: "#ffedd5", color: "#7c2d12", fontWeight: "bold" }}>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px", width: "70px" }}>S.No</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Engineer Name</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Assigned</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Attended</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Closed</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Part ordered</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Under Observation</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>CX Reschedule</td>
            </tr>
          </thead>
          <tbody>
            {engineerProductivityMetrics.list.length > 0 ? (
              engineerProductivityMetrics.list.map((item, index) => (
                <tr key={item.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{index + 1}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontWeight: "600", color: "#0f172a" }}>{item.name}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#334155" }}>{item.assigned}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontWeight: "bold", color: "#0f172a", background: "#f1f5f9" }}>{item.attended}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#166534", fontWeight: "600" }}>{item.closed}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#92400e" }}>{item.partOrdered || ""}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#1e3a8a" }}>{item.underObservation || ""}</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#701a75" }}>{item.cxReschedule || ""}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "24px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--muted)" }}>
                  No engineer productivity records found for this period.
                </td>
              </tr>
            )}
            {engineerProductivityMetrics.list.length > 0 && (
              <tr style={{ background: "#f8fafc", fontWeight: "bold" }}>
                <td colSpan={3} style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "right", color: "#334155" }}>Total Attended</td>
                <td style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "center", background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
                  {engineerProductivityMetrics.totalAttended}
                </td>
                <td colSpan={4} style={{ border: "1px solid #cbd5e1", background: "transparent" }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
