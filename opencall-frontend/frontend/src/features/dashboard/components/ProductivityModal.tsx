// Engineer Productivity dashboard modal extracted from app/page.tsx (Phase 6.5).
// JSX preserved verbatim; props passed explicitly (no logic/state/handler changes
// and no productivity-calculation or export-function changes). The
// `isProductivityModalOpen` render guard stays in page.tsx.
import type { Dispatch, SetStateAction } from "react";
import { downloadEngineerProductivityExcel } from "../../../lib/excelExport";

export function ProductivityModal({
  selectedRegion,
  activeRegionName,
  productivityFilterType,
  setProductivityFilterType,
  selectedProductivityValue,
  setSelectedProductivityValue,
  engineerProductivityMetrics,
  productivityDateLabel,
  setIsProductivityModalOpen,
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
  setIsProductivityModalOpen: Dispatch<SetStateAction<boolean>>;
}>) {
  return (
    <div className="drawerOverlay" style={{ zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15, 23, 42, 0.45)" }} onClick={() => setIsProductivityModalOpen(false)}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          width: "min(900px, 95vw)",
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
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>📊 Engineer Productivity Dashboard</h2>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              Showing status breakdown {selectedRegion && selectedRegion !== "ALL" ? `for ${activeRegionName}` : "globally across all regions"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Filter Type */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Filter:</span>
              <select
                value={productivityFilterType}
                onChange={(e) => setProductivityFilterType(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
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
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                  {productivityFilterType === "Specific Date" ? "Date:" : "Month:"}
                </span>
                <select
                  value={selectedProductivityValue}
                  onChange={(e) => setSelectedProductivityValue(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
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
              className="secondaryButton"
              style={{ minHeight: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "13px" }}
              onClick={() => setIsProductivityModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
          <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
                <td colSpan={8} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px", fontWeight: "800" }}>
                  Filter Applied: {productivityDateLabel}
                </td>
              </tr>
              <tr style={{ background: "#ffedd5", color: "#7c2d12", fontWeight: "bold" }}>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", width: "60px" }}>S.No</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontSize: "12px" }}>Engineer Name</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Assigned</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Attended</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Closed</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Part ordered</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>Under Observation</td>
                <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>CX Reschedule</td>
              </tr>
            </thead>
            <tbody>
              {engineerProductivityMetrics.list.length > 0 ? (
                engineerProductivityMetrics.list.map((item, index) => (
                  <tr key={item.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{index + 1}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontWeight: "600", color: "#0f172a" }}>{item.name}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#334155" }}>{item.assigned}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontWeight: "bold", color: "#0f172a", background: "#f1f5f9" }}>{item.attended}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#166534", fontWeight: "600" }}>{item.closed}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#92400e" }}>{item.partOrdered || ""}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#1e3a8a" }}>{item.underObservation || ""}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#701a75" }}>{item.cxReschedule || ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: "20px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--text-muted)" }}>
                    No engineer productivity records found for this period.
                  </td>
                </tr>
              )}
              {engineerProductivityMetrics.list.length > 0 && (
                <tr style={{ background: "#f8fafc", fontWeight: "bold" }}>
                  <td colSpan={3} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", color: "#334155" }}>Total Attended</td>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
                    {engineerProductivityMetrics.totalAttended}
                  </td>
                  <td colSpan={4} style={{ border: "1px solid #cbd5e1", background: "transparent" }}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => setIsProductivityModalOpen(false)}
          >
            Close
          </button>
          <button
            type="button"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", borderColor: "#f97316", display: "inline-flex", alignItems: "center", gap: "6px", color: "#ffffff" }}
            onClick={() => {
              downloadEngineerProductivityExcel(
                activeRegionName || "Global",
                productivityDateLabel,
                engineerProductivityMetrics.list,
                engineerProductivityMetrics.totalAttended
              );
            }}
          >
            📥 Download Productivity Excel
          </button>
        </div>
      </div>
    </div>
  );
}
