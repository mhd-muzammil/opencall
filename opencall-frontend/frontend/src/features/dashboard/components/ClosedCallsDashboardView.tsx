import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import type { ReportRow } from "../types";
import { formatNumber } from "../utils";

function getRowAspCode(output: Record<string, unknown> = {}): string {
  return String(
    output["Work Location"] ??
    output["ASP Code"] ??
    output["Region"] ??
    output["ASP"] ??
    ""
  ).trim().toUpperCase();
}

function getRowRegionName(aspCode: string): string {
  if (!aspCode) return "-";
  return ASP_CODE_REGION_MAP[aspCode as keyof typeof ASP_CODE_REGION_MAP] || aspCode;
}

export interface ClosedCallsDashboardViewProps {
  overallClosedCount: number;
  closedRegionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    closedCount: number;
    activeCount: number;
  }>;
  closedRows: ReportRow[];
  selectedRegion: string | null;
  setSelectedRegion: (region: string | null) => void;
  openRecordsWithFilter: (filter: { region?: string | null; closedOnly?: boolean; ticketIds?: string[] }) => void;
  onOpenCaseDetail?: (row: ReportRow) => void;
}

export function ClosedCallsDashboardView({
  overallClosedCount,
  closedRegionBreakdown,
  closedRows,
  selectedRegion,
  setSelectedRegion,
  openRecordsWithFilter,
  onOpenCaseDetail,
}: Readonly<ClosedCallsDashboardViewProps>) {
  const [searchQuery, setSearchQuery] = useState("");

  // Total active WIP count across all regions
  const totalActiveWipCount = useMemo(() => {
    return closedRegionBreakdown.reduce((sum, item) => sum + item.activeCount, 0);
  }, [closedRegionBreakdown]);

  // Total calls (Closed + Active WIP)
  const totalCallsCount = overallClosedCount + totalActiveWipCount;
  const closedPercentage = totalCallsCount > 0 ? ((overallClosedCount / totalCallsCount) * 100).toFixed(1) : "0.0";

  // Filtered closed rows based on selected region and search query
  const filteredClosedRows = useMemo(() => {
    return closedRows.filter((row) => {
      const output = (row.output ?? {}) as Record<string, unknown>;
      const rowAsp = getRowAspCode(output);
      const rowRegionName = getRowRegionName(rowAsp).toUpperCase();

      // Region filter
      if (selectedRegion && selectedRegion !== "ALL") {
        const target = selectedRegion.trim().toUpperCase();
        const matchesAsp = rowAsp === target;
        const matchesName = rowRegionName === target;
        if (!matchesAsp && !matchesName) {
          return false;
        }
      }

      // Search query filter
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      const ticketId = String(output["Ticket ID"] ?? "").toLowerCase();
      const woOtc = String(output["WO OTC CODE"] ?? output["WO OTC Code"] ?? "").toLowerCase();
      const engineer = String(output["Engineer"] ?? "").toLowerCase();
      const customer = String(output["Customer Name"] ?? output["Customer"] ?? "").toLowerCase();
      const status = String(output["RTPL status"] ?? "").toLowerCase();
      const asp = rowAsp.toLowerCase();
      const regName = rowRegionName.toLowerCase();
      const segment = String(output["Segment"] ?? "").toLowerCase();
      const contact = String(output["Contact"] ?? "").toLowerCase();
      const customerMail = String(output["Customer Mail"] ?? "").toLowerCase();
      const accountName = String(output["Account Name"] ?? "").toLowerCase();

      return (
        ticketId.includes(query) ||
        woOtc.includes(query) ||
        engineer.includes(query) ||
        customer.includes(query) ||
        status.includes(query) ||
        asp.includes(query) ||
        regName.includes(query) ||
        segment.includes(query) ||
        contact.includes(query) ||
        customerMail.includes(query) ||
        accountName.includes(query)
      );
    });
  }, [closedRows, selectedRegion, searchQuery]);

  // Regional stats for active selection
  const activeRegionStats = useMemo(() => {
    if (!selectedRegion || selectedRegion === "ALL") {
      return {
        closed: overallClosedCount,
        wip: totalActiveWipCount,
        label: "All Operational Regions",
      };
    }
    const targetUpper = selectedRegion.trim().toUpperCase();
    const match = closedRegionBreakdown.find(
      (item) => item.aspCode.toUpperCase() === targetUpper || item.regionName.toUpperCase() === targetUpper
    );
    return {
      closed: match ? match.closedCount : filteredClosedRows.length,
      wip: match ? match.activeCount : 0,
      label: match ? `${match.regionName} (${match.aspCode})` : selectedRegion,
    };
  }, [selectedRegion, overallClosedCount, totalActiveWipCount, closedRegionBreakdown, filteredClosedRows.length]);

  // Handle Exporting Closed Calls to Excel
  const handleExportClosedCalls = () => {
    if (filteredClosedRows.length === 0) return;

    const rowsToExport = filteredClosedRows.map((r) => r.output);
    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Closed Calls");
    XLSX.writeFile(
      wb,
      `Closed_Calls_Ledger_${selectedRegion || "ALL"}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="closedCallsDashboardContainer" style={{ padding: "20px 24px", width: "100%", maxWidth: "100%", overflowX: "hidden", minWidth: 0 }}>
      {/* Top Header Bar */}
      <div
        className="closedCallsHeaderBar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-color, #e5e7eb)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                background: "#f3f4f6",
                color: "#374151",
                fontSize: "11px",
                fontWeight: "700",
                padding: "4px 10px",
                borderRadius: "20px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Ledger Workspace
            </span>
            <span
              style={{
                background: "#10b98115",
                color: "#059669",
                fontSize: "12px",
                fontWeight: "700",
                padding: "3px 10px",
                borderRadius: "12px",
                border: "1px solid #10b98130",
              }}
            >
              ✓ {formatNumber(overallClosedCount)} Total Closed
            </span>
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--heading-color, #111827)", margin: "6px 0 2px 0" }}>
            Closed Calls Dashboard
          </h2>
          <p style={{ fontSize: "13px", color: "var(--muted-color, #6b7280)", margin: 0 }}>
            Dedicated ledger for reviewing completed work orders across all operational contract codes.
          </p>
        </div>

        {/* Header Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Region Select */}
          <select
            value={selectedRegion ?? "ALL"}
            onChange={(e) => setSelectedRegion(e.target.value === "ALL" ? null : e.target.value)}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #d1d5db)",
              background: "var(--card-bg, #ffffff)",
              color: "var(--text-color, #1f2937)",
              cursor: "pointer",
            }}
          >
            <option value="ALL">All Regions ({closedRegionBreakdown.length})</option>
            {closedRegionBreakdown.map((item) => (
              <option key={item.aspCode} value={item.aspCode}>
                {item.regionName} ({item.aspCode}) — {item.closedCount} Closed
              </option>
            ))}
          </select>

          {/* Export Button */}
          <button
            type="button"
            className="secondaryButton"
            onClick={handleExportClosedCalls}
            disabled={filteredClosedRows.length === 0}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: filteredClosedRows.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            <span>📥 Export Excel</span>
          </button>

          {/* Switch to Full Editable Table Button */}
          <button
            type="button"
            className="primaryButton"
            onClick={() => openRecordsWithFilter({ region: selectedRegion, closedOnly: true })}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "600",
              borderRadius: "8px",
              background: "#3b82f6",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(59, 130, 246, 0.2)",
            }}
          >
            📋 Open Records Table
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div
        className="closedCallsKpiGrid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        {/* Total Closed Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Closed Calls
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#10b981", marginTop: "4px" }}>
            {formatNumber(activeRegionStats.closed)}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Scope: {activeRegionStats.label}
          </div>
        </div>

        {/* Active Regions Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Regions Breakdown
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#3b82f6", marginTop: "4px" }}>
            {closedRegionBreakdown.filter((r) => r.closedCount > 0).length} / {closedRegionBreakdown.length}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Regions with closed calls
          </div>
        </div>

        {/* Active WIP Comparison Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Active WIP Comparison
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#f59e0b", marginTop: "4px" }}>
            {formatNumber(activeRegionStats.wip)}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Active work order calls
          </div>
        </div>

        {/* Closed Share % Card */}
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: "12px",
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Closed Share Ratio
          </div>
          <div style={{ fontSize: "28px", fontWeight: "900", color: "#8b5cf6", marginTop: "4px" }}>
            {closedPercentage}%
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            Of total operations volume
          </div>
        </div>
      </div>

      {/* Regional Closed Call Ledger Section */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "var(--heading-color, #111827)" }}>
              Regional Closed Ledger Cards
            </h3>
            <p style={{ fontSize: "12px", color: "var(--muted-color, #6b7280)", margin: "2px 0 0 0" }}>
              Click any region card below to filter closed call records to that specific operational region.
            </p>
          </div>
          {selectedRegion && selectedRegion !== "ALL" && (
            <button
              type="button"
              className="textButton"
              onClick={() => setSelectedRegion(null)}
              style={{ fontSize: "12px", fontWeight: "600", color: "#3b82f6", cursor: "pointer", background: "none", border: "none" }}
            >
              Clear Region Filter (Show All)
            </button>
          )}
        </div>

        {/* Region Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {/* Total All Card */}
          <button
            type="button"
            onClick={() => setSelectedRegion(null)}
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              border: !selectedRegion || selectedRegion === "ALL" ? "2px solid #10b981" : "1px solid var(--border-color, #e5e7eb)",
              background: !selectedRegion || selectedRegion === "ALL" ? "#ecfdf5" : "var(--card-bg, #ffffff)",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: !selectedRegion || selectedRegion === "ALL" ? "#047857" : "#374151" }}>
              ALL REGIONS
            </div>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#10b981", margin: "4px 0" }}>
              {formatNumber(overallClosedCount)}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>
              {formatNumber(totalActiveWipCount)} active WIP
            </div>
          </button>

          {closedRegionBreakdown.map((entry) => {
            const isSelected = selectedRegion === entry.aspCode;
            return (
              <button
                key={entry.aspCode}
                type="button"
                onClick={() => setSelectedRegion(entry.aspCode)}
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: isSelected ? "2px solid #3b82f6" : "1px solid var(--border-color, #e5e7eb)",
                  background: isSelected ? "#eff6ff" : "var(--card-bg, #ffffff)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: "700", color: isSelected ? "#1d4ed8" : "#374151" }}>
                  {entry.regionName}
                </div>
                <div style={{ fontSize: "20px", fontWeight: "800", color: isSelected ? "#2563eb" : "#10b981", margin: "4px 0" }}>
                  {formatNumber(entry.closedCount)}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>
                  {entry.aspCode} | {formatNumber(entry.activeCount)} WIP
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Closed Calls Ledger Data Table Section */}
      <div
        style={{
          background: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* Table Controls Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>
              Closed Call Records Ledger ({filteredClosedRows.length})
            </h3>
            <p style={{ fontSize: "12px", color: "#6b7280", margin: "2px 0 0 0" }}>
              Showing {filteredClosedRows.length} of {closedRows.length} total closed records
            </p>
          </div>

          {/* Search Box */}
          <div style={{ width: "320px", maxWidth: "100%" }}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Ticket ID, WO, ASP, Engineer, Status..."
              style={{
                width: "100%",
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #d1d5db)",
                background: "var(--input-bg, #f9fafb)",
              }}
            />
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-color, #e5e7eb)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--th-bg, #f3f4f6)", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>S.No</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Ticket ID</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>ASP / Region</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>WO OTC Code</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Engineer</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer / Segment</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>RTPL Status</th>
                <th style={{ padding: "10px 14px", fontWeight: "700", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "32px 14px", textAlign: "center", color: "#6b7280" }}>
                    {searchQuery.trim()
                      ? `No closed call records matching "${searchQuery}"`
                      : "No closed call records available for the selected filter."}
                  </td>
                </tr>
              ) : (
                filteredClosedRows.slice(0, 100).map((row, idx) => {
                  const out = (row.output ?? {}) as Record<string, unknown>;
                  const ticketId = String(out["Ticket ID"] ?? "-");
                  const rowAsp = getRowAspCode(out);
                  const rowRegionName = getRowRegionName(rowAsp);
                  const aspDisplay = rowRegionName !== "-" && rowRegionName !== rowAsp
                    ? `${rowRegionName} (${rowAsp})`
                    : rowAsp || "-";
                  const woOtc = String(out["WO OTC CODE"] ?? out["WO OTC Code"] ?? "-");
                  const engineer = String(out["Engineer"] ?? "-");
                  const customer = String(out["Customer Name"] ?? out["Customer"] ?? "-");
                  const status = String(out["RTPL status"] ?? "Closed");
                  const segment = String(out["Segment"] ?? "-");
                  const contact = String(out["Contact"] ?? "-");
                  const customerMail = String(out["Customer Mail"] ?? "-");
                  const accountName = String(out["Account Name"] ?? "-");

                  return (
                    <tr
                      key={row.serialNo ?? idx}
                      style={{
                        borderBottom: "1px solid var(--border-color, #f3f4f6)",
                        transition: "background 0.15s",
                      }}
                    >
                      <td style={{ padding: "10px 14px", color: "#6b7280" }}>{idx + 1}</td>
                      <td style={{ padding: "10px 14px", fontWeight: "600", color: "#1d4ed8" }}>{ticketId}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: "#f3f4f6",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                          }}
                        >
                          {aspDisplay}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{woOtc}</td>
                      <td style={{ padding: "10px 14px", fontWeight: "500" }}>{engineer}</td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        <div style={{ fontWeight: "600" }}>{customer}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                          {segment && segment !== "-" && (
                            <span style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: "4px", fontWeight: "500" }}>
                              {segment}
                            </span>
                          )}
                          {accountName && accountName !== "-" && (
                            <span>• Account: {accountName}</span>
                          )}
                          {contact && contact !== "-" && (
                            <span>• Contact: {contact}</span>
                          )}
                          {customerMail && customerMail !== "-" && (
                            <span>• Mail: {customerMail}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: "#ecfdf5",
                            color: "#047857",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            border: "1px solid #a7f3d0",
                          }}
                        >
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenCaseDetail) {
                              onOpenCaseDetail(row);
                            } else {
                              openRecordsWithFilter({ ticketIds: [ticketId], closedOnly: true });
                            }
                          }}
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#2563eb",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredClosedRows.length > 100 && (
          <div style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#6b7280" }}>
            Showing top 100 closed call records in preview.{" "}
            <button
              type="button"
              onClick={() => openRecordsWithFilter({ region: selectedRegion, closedOnly: true })}
              style={{ color: "#2563eb", fontWeight: "600", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Open full interactive table ({filteredClosedRows.length} rows)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
