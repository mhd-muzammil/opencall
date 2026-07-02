// Engineer Productivity dashboard page extracted from app/page.tsx (Phase 6.5) and updated to render as a separate page view.
import { useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { downloadEngineerProductivityExcel } from "../../../lib/excelExport";

export function ProductivityPage({
  selectedRegion,
  setSelectedRegion,
  activeRegionName,
  productivityFilterType,
  setProductivityFilterType,
  selectedProductivityValue,
  setSelectedProductivityValue,
  engineerProductivityMetrics,
  productivityDateLabel,
  regionsList,
  isSuperAdmin,
  openRecordsWithFilter,
}: Readonly<{
  selectedRegion: string | null;
  setSelectedRegion: Dispatch<SetStateAction<string | null>>;
  activeRegionName: string;
  productivityFilterType: string;
  setProductivityFilterType: Dispatch<SetStateAction<string>>;
  selectedProductivityValue: string;
  setSelectedProductivityValue: Dispatch<SetStateAction<string>>;
  engineerProductivityMetrics: {
    list: Array<{
      name: string;
      regionCode?: string;
      regionName?: string;
      assigned: number;
      assignedTickets?: readonly string[];
      attended: number;
      attendedTickets?: readonly string[];
      closed: number;
      closedTickets?: readonly string[];
      partOrdered: number;
      partOrderedTickets?: readonly string[];
      underObservation: number;
      underObservationTickets?: readonly string[];
      cxReschedule: number;
      cxRescheduleTickets?: readonly string[];
    }>;
    totalAttended: number;
    monthsList: string[];
    datesList: string[];
  };
  productivityDateLabel: string;
  regionsList: Array<{ aspCode: string; regionName: string; count: number }>;
  isSuperAdmin: boolean;
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    woOtcCode?: string | null;
    rtplStatus?: string | null;
    rtplStatuses?: readonly string[] | null;
    flexStatus?: string | null;
    segment?: string | null;
    segments?: readonly string[] | null;
    workLocations?: readonly string[] | null;
    wipAging?: string | null;
    wipAgings?: readonly string[] | null;
    engineers?: readonly string[] | null;
    ticketIds?: readonly string[] | null;
  }>) => void;
}>) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter list locally by search query (checks engineer name or region name)
  const filteredList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return engineerProductivityMetrics.list;
    return engineerProductivityMetrics.list.filter(item =>
      item.name.toLowerCase().includes(query) ||
      (item.regionName && item.regionName.toLowerCase().includes(query)) ||
      (item.regionCode && item.regionCode.toLowerCase().includes(query))
    );
  }, [engineerProductivityMetrics.list, searchQuery]);

  // Recalculate KPIs based on filtered results
  const filteredTotalAttended = useMemo(() => {
    return filteredList.reduce((sum, item) => sum + item.attended, 0);
  }, [filteredList]);

  const filteredActiveEngineers = filteredList.length;

  const filteredAvgProductivity = useMemo(() => {
    return filteredActiveEngineers > 0
      ? (filteredTotalAttended / filteredActiveEngineers).toFixed(1)
      : "0.0";
  }, [filteredTotalAttended, filteredActiveEngineers]);

  const allAttendedTickets = useMemo(() => {
    return filteredList.reduce<string[]>((acc, item) => {
      if (item.attendedTickets) {
        acc.push(...item.attendedTickets);
      }
      return acc;
    }, []);
  }, [filteredList]);

  const showRegionColumn = !selectedRegion || selectedRegion === "ALL";

  const renderClickableCell = (
    count: number,
    ticketIds?: readonly string[],
    isBold: boolean = false,
    color?: string,
    backgroundColor?: string
  ) => {
    const hasTickets = ticketIds && ticketIds.length > 0;
    const displayVal = count === 0 ? "" : count;

    return (
      <td
        style={{
          padding: "10px",
          border: "1px solid #cbd5e1",
          textAlign: "center",
          fontWeight: isBold || hasTickets ? "bold" : "normal",
          color: color || "#334155",
          background: backgroundColor || "transparent",
          cursor: hasTickets ? "pointer" : "default",
          textDecoration: hasTickets ? "underline" : "none",
          userSelect: "none"
        }}
        onClick={() => {
          if (hasTickets) {
            openRecordsWithFilter({
              region: selectedRegion === "ALL" ? null : selectedRegion,
              ticketIds
            });
          }
        }}
        title={hasTickets ? `Click to view all ${count} records` : undefined}
      >
        {displayVal}
      </td>
    );
  };

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
          {/* Region Filter for Super Admins */}
          {isSuperAdmin && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Region:</span>
              <select
                value={selectedRegion || "ALL"}
                onChange={(e) => setSelectedRegion(e.target.value === "ALL" ? "ALL" : e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              >
                <option value="ALL">All Regions</option>
                {regionsList.map(r => (
                  <option key={r.aspCode} value={r.aspCode}>{r.regionName} ({r.aspCode})</option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", position: "relative" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Search:</span>
            <input
              type="text"
              placeholder="Search engg or region..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                fontSize: "13px",
                outline: "none",
                background: "#ffffff",
                width: "180px"
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                &times;
              </button>
            )}
          </div>

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
                filteredList,
                filteredTotalAttended
              );
            }}
          >
            📥 Download Excel
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        {/* Card 1: Total Attended */}
        <div style={{
          background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.02)"
        }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.5px" }}>📞 Total Attended Calls</span>
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#1e3a8a" }}>{filteredTotalAttended}</strong>
          <span style={{ fontSize: "11px", color: "#60a5fa" }}>Across filtered engineers</span>
        </div>

        {/* Card 2: Active Engineers */}
        <div style={{
          background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
          border: "1px solid #bbf7d0",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.02)"
        }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>👥 Active Engineers</span>
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#14532d" }}>{filteredActiveEngineers}</strong>
          <span style={{ fontSize: "11px", color: "#4ade80" }}>In selected view</span>
        </div>

        {/* Card 3: Avg Productivity */}
        <div style={{
          background: "linear-gradient(135deg, #faf5ff, #f3e8ff)",
          border: "1px solid #e9d5ff",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.02)"
        }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#6b21a8", textTransform: "uppercase", letterSpacing: "0.5px" }}>⚡ Avg Calls / Engineer</span>
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#581c87" }}>{filteredAvgProductivity}</strong>
          <span style={{ fontSize: "11px", color: "#c084fc" }}>Average attended per active engg</span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
              <td colSpan={showRegionColumn ? 9 : 8} style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "14px", fontWeight: "800" }}>
                Filter Applied: {productivityDateLabel}
              </td>
            </tr>
            <tr style={{ background: "#ffedd5", color: "#7c2d12", fontWeight: "bold" }}>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px", width: "70px" }}>S.No</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Engineer Name</td>
              {showRegionColumn && (
                <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Region</td>
              )}
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Assigned</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Attended</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Closed</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Part ordered</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Under Observation</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>CX Reschedule</td>
            </tr>
          </thead>
          <tbody>
            {filteredList.length > 0 ? (
              filteredList.map((item, index) => (
                <tr key={item.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc", fontWeight: "600", color: "#334155" }}>{index + 1}</td>
                  
                  {/* Engineer Name (Clickable to show all engineer tickets) */}
                  <td 
                    style={{ 
                      padding: "10px", 
                      border: "1px solid #cbd5e1", 
                      fontWeight: "600", 
                      color: "#1e40af", 
                      cursor: "pointer", 
                      textDecoration: "underline" 
                    }}
                    onClick={() => {
                      openRecordsWithFilter({
                        region: selectedRegion === "ALL" ? null : selectedRegion,
                        engineers: [item.name],
                      });
                    }}
                    title={`Click to view all records for ${item.name}`}
                  >
                    {item.name}
                  </td>

                  {showRegionColumn && (
                    <td style={{ padding: "10px", border: "1px solid #cbd5e1", color: "#475569", fontSize: "12px", fontWeight: "500" }}>{item.regionName || item.regionCode || "—"}</td>
                  )}

                  {/* Clickable Status Counts */}
                  {renderClickableCell(item.assigned, item.assignedTickets, false, "#334155")}
                  {renderClickableCell(item.attended, item.attendedTickets, true, "#0f172a", "#f1f5f9")}
                  {renderClickableCell(item.closed, item.closedTickets, true, "#166534")}
                  {renderClickableCell(item.partOrdered, item.partOrderedTickets, false, "#92400e")}
                  {renderClickableCell(item.underObservation, item.underObservationTickets, false, "#1e3a8a")}
                  {renderClickableCell(item.cxReschedule, item.cxRescheduleTickets, false, "#701a75")}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showRegionColumn ? 9 : 8} style={{ padding: "24px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--muted)" }}>
                  No engineer productivity records found for this period.
                </td>
              </tr>
            )}
            {filteredList.length > 0 && (
              <tr style={{ background: "#f8fafc", fontWeight: "bold" }}>
                <td colSpan={showRegionColumn ? 4 : 3} style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "right", color: "#334155" }}>Total Attended</td>
                <td
                  style={{
                    padding: "12px",
                    border: "1px solid #cbd5e1",
                    textAlign: "center",
                    background: "#fed7aa",
                    color: "#7c2d12",
                    fontWeight: "bold",
                    textDecoration: allAttendedTickets.length > 0 ? "underline" : "none",
                    cursor: allAttendedTickets.length > 0 ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (allAttendedTickets.length > 0) {
                      openRecordsWithFilter({
                        region: selectedRegion === "ALL" ? null : selectedRegion,
                        ticketIds: allAttendedTickets,
                      });
                    }
                  }}
                  title={allAttendedTickets.length > 0 ? `Click to view all ${filteredTotalAttended} attended records` : undefined}
                >
                  {filteredTotalAttended}
                </td>
                <td colSpan={showRegionColumn ? 5 : 4} style={{ border: "1px solid #cbd5e1", background: "transparent" }}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
