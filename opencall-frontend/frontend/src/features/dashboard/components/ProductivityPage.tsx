// Engineer Productivity dashboard page extracted from app/page.tsx (Phase 6.5) and updated to render as a separate page view.
import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { getRoster } from "../../../lib/payrollTrackingApiClient";
import { readSession } from "../../../lib/session";
import { productivityReportDay } from "../utils/productivityReportDay";
import { downloadEngineerProductivityExcel } from "../../../lib/excelExport";
import { EngineerTargetTab } from "./EngineerTargetTab";
import { LocationPerformancePanel } from "./LocationPerformancePanel";
import type { BillCycle } from "../utils/billCycle";

export function ProductivityPage({
  selectedRegion,
  setSelectedRegion,
  activeRegionName,
  productivityFilterType,
  setProductivityFilterType,
  selectedProductivityValue,
  setSelectedProductivityValue,
  productivityFromDate,
  setProductivityFromDate,
  productivityToDate,
  setProductivityToDate,
  engineerProductivityMetrics,
  productivityDateLabel,
  loading = false,
  rangeError = null,
  billCycles = [],
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
  productivityFromDate: string;
  setProductivityFromDate: Dispatch<SetStateAction<string>>;
  productivityToDate: string;
  setProductivityToDate: Dispatch<SetStateAction<string>>;
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
      engineerDelay?: number;
      engineerDelayTickets?: readonly string[];
    }>;
    totalAttended: number;
    monthsList: string[];
    datesList: string[];
    /** Calls each region had in the period, booked or not. Keyed by region name. */
    callsByRegion: ReadonlyMap<string, number>;
  };
  productivityDateLabel: string;
  /** True while a past day's or a date range's productivity is being fetched. */
  loading?: boolean;
  /**
   * Why the selected date range could not be loaded (e.g. it is longer than the
   * backend will read in one request). Shown in place of the empty state, so a
   * refused range never reads as "this period had no work".
   */
  rangeError?: string | null;
  /**
   * Bill cycles this view can answer for, newest first. Same 25th-to-24th cycle
   * the Closed Calls dashboard bills by — imported from one definition, not a
   * second one that could drift from it.
   */
  billCycles?: readonly BillCycle[];
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
  // Which tab of this page is showing. "target" renders the self-contained Engineer
  // Target view; everything else on this page is untouched.
  const [activeTab, setActiveTab] = useState<"productivity" | "target">("productivity");


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

  // Column totals for the footer row. Each keeps its own pooled ticket list so
  // the total cell drills into every underlying record, just like a body cell.
  const columnTotals = useMemo(() => {
    const empty = {
      assigned: 0,
      attended: 0,
      closed: 0,
      partOrdered: 0,
      underObservation: 0,
      cxReschedule: 0,
      engineerDelay: 0,
      assignedTickets: [] as string[],
      attendedTickets: [] as string[],
      closedTickets: [] as string[],
      partOrderedTickets: [] as string[],
      underObservationTickets: [] as string[],
      cxRescheduleTickets: [] as string[],
      engineerDelayTickets: [] as string[],
    };
    return filteredList.reduce((acc, item) => {
      acc.assigned += item.assigned;
      acc.attended += item.attended;
      acc.closed += item.closed;
      acc.partOrdered += item.partOrdered ?? 0;
      acc.underObservation += item.underObservation ?? 0;
      acc.cxReschedule += item.cxReschedule ?? 0;
      acc.engineerDelay += item.engineerDelay ?? 0;
      if (item.assignedTickets) acc.assignedTickets.push(...item.assignedTickets);
      if (item.attendedTickets) acc.attendedTickets.push(...item.attendedTickets);
      if (item.closedTickets) acc.closedTickets.push(...item.closedTickets);
      if (item.partOrderedTickets) acc.partOrderedTickets.push(...item.partOrderedTickets);
      if (item.underObservationTickets) acc.underObservationTickets.push(...item.underObservationTickets);
      if (item.cxRescheduleTickets) acc.cxRescheduleTickets.push(...item.cxRescheduleTickets);
      if (item.engineerDelayTickets) acc.engineerDelayTickets.push(...item.engineerDelayTickets);
      return acc;
    }, empty);
  }, [filteredList]);

  const showRegionColumn = !selectedRegion || selectedRegion === "ALL";

  /**
   * How far each engineer travelled, from Payroll's tracking.
   *
   * Only for a SINGLE day. Distance is recorded per day, and this view can be
   * pointed at a month or a range -- showing one day's kilometres beside a
   * month's calls would be a number that looks like it belongs to the row and
   * does not. When the range is wider than a day the column says so instead of
   * guessing.
   *
   * Keyed on the lower-cased name because that is the only thing the two
   * systems share here; Payroll matches the name to an employee at its end and
   * hands back the id, which is what the link needs.
   */
  // Extracted, because getting this wrong is invisible: the page said one date
  // while every KM cell said dash, and nothing explained the disagreement.
  // productivityReportDay.test.ts pins it.
  const reportDay = useMemo(
    () =>
      productivityReportDay({
        filterType: productivityFilterType,
        selectedValue: selectedProductivityValue,
        fromDate: productivityFromDate,
        toDate: productivityToDate,
      }),
    [
      productivityFilterType,
      selectedProductivityValue,
      productivityFromDate,
      productivityToDate,
    ],
  );

  const [kmByEngineer, setKmByEngineer] = useState<Map<string, { km: number; id: number | null }>>(
    new Map(),
  );
  const [kmUnavailable, setKmUnavailable] = useState(false);

  useEffect(() => {
    if (!reportDay) {
      setKmByEngineer(new Map());
      setKmUnavailable(false);
      return;
    }
    const token = readSession()?.token;
    if (!token) return;

    let alive = true;
    getRoster(token, reportDay)
      .then((result) => {
        if (!alive) return;
        const next = new Map<string, { km: number; id: number | null }>();
        for (const row of result.engineers ?? []) {
          const key = String(row.engineer_name || "").trim().toLowerCase();
          if (key) next.set(key, { km: row.distance_km ?? 0, id: row.engineer_id });
        }
        setKmByEngineer(next);
        setKmUnavailable(!result.configured);
      })
      .catch(() => {
        // Tracking being unreachable must not take the productivity table with
        // it. The column goes quiet; every other number on the page is intact.
        if (alive) {
          setKmByEngineer(new Map());
          setKmUnavailable(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [reportDay]);

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

  // A footer total cell: the sum for one column, drilling into the pooled
  // tickets of every engineer for that column. Emphasised (bold + tinted) so
  // the totals row reads as a summary, not another engineer.
  const renderTotalCell = (
    count: number,
    ticketIds: readonly string[],
    color: string = "#0f172a",
  ) => {
    const hasTickets = ticketIds.length > 0;
    return (
      <td
        style={{
          padding: "12px",
          border: "1px solid #cbd5e1",
          textAlign: "center",
          fontWeight: "bold",
          color,
          background: "#fef3c7",
          cursor: hasTickets ? "pointer" : "default",
          textDecoration: hasTickets ? "underline" : "none",
          userSelect: "none",
        }}
        onClick={() => {
          if (hasTickets) {
            openRecordsWithFilter({
              region: selectedRegion === "ALL" ? null : selectedRegion,
              ticketIds,
            });
          }
        }}
        title={hasTickets ? `Click to view all ${count} records` : undefined}
      >
        {count === 0 ? "" : count}
      </td>
    );
  };

  const tabButton = (key: "productivity" | "target", label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      style={{
        padding: "7px 16px",
        minHeight: "34px",
        borderRadius: "999px",
        border: `1px solid ${activeTab === key ? "#4f46e5" : "#d1d5db"}`,
        background: activeTab === key ? "#4f46e5" : "#ffffff",
        color: activeTab === key ? "#ffffff" : "#374151",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  if (activeTab === "target") {
    return (
      <div className="panel" style={{ display: "grid", gap: "20px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tabButton("productivity", "Productivity")}
          {tabButton("target", "Target")}
        </div>
        <EngineerTargetTab />
      </div>
    );
  }

  return (
    <div className="panel" style={{ display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {tabButton("productivity", "Productivity")}
        {tabButton("target", "Target")}
      </div>
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
              <option value="Date Range">Date Range</option>
              <option value="Bill Cycle">Bill Cycle</option>
              <option value="All Dates">All History</option>
            </select>
          </div>

          {/* Conditional From / To date range */}
          {productivityFilterType === "Date Range" && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>From:</span>
              <input
                type="date"
                value={productivityFromDate}
                max={productivityToDate || undefined}
                onChange={(e) => setProductivityFromDate(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              />
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>To:</span>
              <input
                type="date"
                value={productivityToDate}
                min={productivityFromDate || undefined}
                onChange={(e) => setProductivityToDate(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              />
            </div>
          )}

          {/* Conditional bill cycle picker (25th → 24th, named by the month it ends in) */}
          {productivityFilterType === "Bill Cycle" && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Cycle:</span>
              <select
                value={selectedProductivityValue}
                onChange={(e) => setSelectedProductivityValue(e.target.value)}
                title="Productivity across one bill cycle — the 25th of a month to the 24th of the next"
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", fontWeight: "600", outline: "none", background: "#f8fafc", cursor: "pointer" }}
              >
                {billCycles.map((cycle) => (
                  <option key={cycle.key} value={cycle.key}>
                    {cycle.monthLabel} ({cycle.label})
                  </option>
                ))}
              </select>
            </div>
          )}

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
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#1e3a8a" }}>{loading ? "…" : filteredTotalAttended}</strong>
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
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#14532d" }}>{loading ? "…" : filteredActiveEngineers}</strong>
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
          <strong style={{ fontSize: "28px", fontWeight: "900", color: "#581c87" }}>{loading ? "…" : filteredAvgProductivity}</strong>
          <span style={{ fontSize: "11px", color: "#c084fc" }}>Average attended per active engg</span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="kpiSummaryTable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fed7aa", color: "#7c2d12", fontWeight: "bold" }}>
              <td colSpan={showRegionColumn ? 10 : 9} style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "14px", fontWeight: "800" }}>
                Filter Applied: {productivityDateLabel}
              </td>
            </tr>
            <tr style={{ background: "#ffedd5", color: "#7c2d12", fontWeight: "bold" }}>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px", width: "70px" }}>S.No</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Engineer Name</td>
              {showRegionColumn && (
                <td style={{ padding: "10px", border: "1px solid #cbd5e1", fontSize: "13px" }}>Region</td>
              )}
              <td
                style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}
                title={
                  reportDay
                    ? "Distance travelled on this day, from the engineer's phone. Click a figure to open their tracking."
                    : "Distance is recorded per day - pick a single date to see it"
                }
              >
                KM
              </td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Assigned</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Attended</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Closed</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Part ordered</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Under Observation/Elevation</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Customer Pending</td>
              <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "13px" }}>Engineer Delay</td>
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

                  {/* How far they went, and the way into their day.
                      Only a link when Payroll matched the name to an employee:
                      without an id there is no tracking page to open, and a
                      link that goes nowhere is worse than plain text. */}
                  {(() => {
                    const found = kmByEngineer.get(item.name.trim().toLowerCase());
                    if (!reportDay) {
                      return (
                        <td
                          style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#94a3b8" }}
                          title="Distance is recorded per day - pick a single date to see it"
                        >
                          &mdash;
                        </td>
                      );
                    }
                    if (!found) {
                      return (
                        <td
                          style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#94a3b8" }}
                          title={
                            kmUnavailable
                              ? "Tracking is unavailable right now"
                              : `No tracking record for ${item.name} on this day`
                          }
                        >
                          &mdash;
                        </td>
                      );
                    }
                    const km = `${found.km.toFixed(1)} km`;
                    if (found.id == null) {
                      return (
                        <td
                          style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center", color: "#334155", fontWeight: "600" }}
                          title={`${item.name} is not linked to a Payroll employee, so their tracking cannot be opened`}
                        >
                          {km}
                        </td>
                      );
                    }
                    return (
                      <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "center" }}>
                        <a
                          href={`/admin/tracking?engineer=${found.id}&date=${reportDay}`}
                          style={{ color: "#1e40af", fontWeight: "700", textDecoration: "underline" }}
                          title={`Open ${item.name}'s tracking for ${reportDay}`}
                        >
                          {km}
                        </a>
                      </td>
                    );
                  })()}

                  {/* Clickable Status Counts */}
                  {renderClickableCell(item.assigned, item.assignedTickets, false, "#334155")}
                  {renderClickableCell(item.attended, item.attendedTickets, true, "#0f172a", "#f1f5f9")}
                  {renderClickableCell(item.closed, item.closedTickets, true, "#166534")}
                  {renderClickableCell(item.partOrdered, item.partOrderedTickets, false, "#92400e")}
                  {renderClickableCell(item.underObservation, item.underObservationTickets, false, "#1e3a8a")}
                  {renderClickableCell(item.cxReschedule, item.cxRescheduleTickets, false, "#701a75")}
                  {renderClickableCell(item.engineerDelay ?? 0, item.engineerDelayTickets, false, "#9a3412")}
                </tr>
              ))
            ) : loading ? (
              <tr>
                <td colSpan={showRegionColumn ? 10 : 9} style={{ padding: "24px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--muted)" }}>
                  Loading productivity for this period…
                </td>
              </tr>
            ) : rangeError ? (
              <tr>
                <td colSpan={showRegionColumn ? 10 : 9} style={{ padding: "24px", border: "1px solid #cbd5e1", textAlign: "center", color: "#b91c1c" }}>
                  {rangeError}
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={showRegionColumn ? 10 : 9} style={{ padding: "24px", border: "1px solid #cbd5e1", textAlign: "center", color: "var(--muted)" }}>
                  No engineer productivity records found for this period.
                </td>
              </tr>
            )}
            {filteredList.length > 0 && (
              <tr style={{ background: "#fffbeb", fontWeight: "bold" }}>
                {/* +1 for the KM column. The label stretches over it rather
                    than the row carrying a fleet total: distance only means
                    anything per engineer here, and a summed figure beside
                    per-engineer call counts would invite the wrong reading. */}
                <td
                  colSpan={showRegionColumn ? 4 : 3}
                  style={{ padding: "12px", border: "1px solid #cbd5e1", textAlign: "right", color: "#334155" }}
                >
                  Total ({filteredActiveEngineers} {filteredActiveEngineers === 1 ? "engineer" : "engineers"})
                </td>
                {renderTotalCell(columnTotals.assigned, columnTotals.assignedTickets, "#334155")}
                {renderTotalCell(columnTotals.attended, columnTotals.attendedTickets, "#0f172a")}
                {renderTotalCell(columnTotals.closed, columnTotals.closedTickets, "#166534")}
                {renderTotalCell(columnTotals.partOrdered, columnTotals.partOrderedTickets, "#92400e")}
                {renderTotalCell(columnTotals.underObservation, columnTotals.underObservationTickets, "#1e3a8a")}
                {renderTotalCell(columnTotals.cxReschedule, columnTotals.cxRescheduleTickets, "#701a75")}
                {renderTotalCell(columnTotals.engineerDelay, columnTotals.engineerDelayTickets, "#9a3412")}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Location-wise ratios + charts. Additive only — it reads the same
          filtered list the table above renders and changes nothing in it. */}
      <LocationPerformancePanel
        list={filteredList}
        loading={loading}
        callsByRegion={engineerProductivityMetrics.callsByRegion}
      />
    </div>
  );
}
