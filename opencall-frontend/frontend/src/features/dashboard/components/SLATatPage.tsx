// SLA TaT page component that displays Turnaround Time metrics for PC, Print, and Install cases.
import type { ReportRow, PrintCaseFilter } from "../types";
import { formatNumber } from "../utils";

interface SLATatPageProps {
  selectedRegion: string | null;
  activeRegionName: string;
  pcRows: ReportRow[];
  printFixRows: ReportRow[];
  printInstallationRows: ReportRow[];
  openRecordsWithFilter: (args: Readonly<{
    region?: string | null;
    printCase?: PrintCaseFilter | null;
    segment?: string | null;
    ticketIds?: readonly string[] | null;
    cissOnly?: boolean;
    tradeOnly?: boolean;
    rcaOnly?: boolean;
  }>) => void;
}

export function SLATatPage({
  selectedRegion,
  activeRegionName,
  pcRows,
  printFixRows,
  printInstallationRows,
  openRecordsWithFilter,
}: Readonly<SLATatPageProps>) {
  // Helper to filter rows by region
  const filterByRegion = (rows: ReportRow[]) => {
    if (!selectedRegion || selectedRegion === "ALL") return rows;
    const target = selectedRegion.trim().toUpperCase();
    return rows.filter(
      (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === target
    );
  };

  const regionalPcRows = filterByRegion(pcRows);
  const regionalPrintRows = filterByRegion(printFixRows);
  const regionalInstallRows = filterByRegion(printInstallationRows);

  // Helper to calculate SLA metrics
  const calculateSlaMetrics = (rows: ReportRow[]) => {
    const now = new Date();
    let withinSlaCount = 0;
    let breachedSlaCount = 0;
    let pendingCount = 0;

    const withinSlaTickets: string[] = [];
    const breachedSlaTickets: string[] = [];
    const pendingTickets: string[] = [];
    const allTickets: string[] = [];

    for (const row of rows) {
      const ticketId = String(row.output["Ticket ID"] ?? "").trim();
      if (!ticketId) continue;
      allTickets.push(ticketId);

      const tatVal = row.output["TAT"];
      if (!tatVal || String(tatVal).trim() === "Manual Entry Required" || String(tatVal).trim() === "") {
        pendingCount += 1;
        pendingTickets.push(ticketId);
        continue;
      }

      const tatDate = new Date(String(tatVal));
      if (Number.isNaN(tatDate.getTime())) {
        pendingCount += 1;
        pendingTickets.push(ticketId);
        continue;
      }

      if (now < tatDate) {
        withinSlaCount += 1;
        withinSlaTickets.push(ticketId);
      } else {
        breachedSlaCount += 1;
        breachedSlaTickets.push(ticketId);
      }
    }

    const totalValid = withinSlaCount + breachedSlaCount;
    const adherencePercent = totalValid > 0 ? Math.round((withinSlaCount / totalValid) * 100) : 100;

    return {
      total: rows.length,
      withinSla: withinSlaCount,
      breached: breachedSlaCount,
      pending: pendingCount,
      adherence: adherencePercent,
      withinSlaTickets,
      breachedSlaTickets,
      pendingTickets,
      allTickets,
    };
  };

  const pcMetrics = calculateSlaMetrics(regionalPcRows);
  const printMetrics = calculateSlaMetrics(regionalPrintRows);
  const installMetrics = calculateSlaMetrics(regionalInstallRows);

  const renderCard = (
    title: string,
    icon: string,
    metrics: ReturnType<typeof calculateSlaMetrics>,
    themeColor: string,
    clickHandlers: {
      onTotal: () => void;
      onWithin: () => void;
      onBreached: () => void;
      onPending: () => void;
    }
  ) => {
    return (
      <div className="panel" style={{ padding: "20px", display: "grid", gap: "16px", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>{icon}</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>{title}</h3>
          </div>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px" }}>
            Active Calls
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0" }}>
          <strong style={{ fontSize: "36px", fontWeight: "800", color: themeColor }}>{metrics.adherence}%</strong>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--muted)" }}>SLA Adherence</span>
        </div>

        {/* Progress Bar */}
        <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ width: `${metrics.adherence}%`, height: "100%", background: themeColor, borderRadius: "4px" }} />
        </div>

        {/* Counts Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" }}>
          <button
            type="button"
            onClick={clickHandlers.onWithin}
            className="slaItemButton"
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#f0fdf4",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              textAlign: "center"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", textTransform: "uppercase" }}>Within SLA</span>
            <strong style={{ fontSize: "20px", fontWeight: "800", color: "#15803d", marginTop: "4px" }}>{metrics.withinSla}</strong>
          </button>

          <button
            type="button"
            onClick={clickHandlers.onBreached}
            className="slaItemButton"
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              textAlign: "center"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b", textTransform: "uppercase" }}>Breached</span>
            <strong style={{ fontSize: "20px", fontWeight: "800", color: "#b91c1c", marginTop: "4px" }}>{metrics.breached}</strong>
          </button>

          <button
            type="button"
            onClick={clickHandlers.onPending}
            className="slaItemButton"
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              textAlign: "center"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Pending TAT</span>
            <strong style={{ fontSize: "20px", fontWeight: "800", color: "#475569", marginTop: "4px" }}>{metrics.pending}</strong>
          </button>

          <button
            type="button"
            onClick={clickHandlers.onTotal}
            className="slaItemButton"
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              textAlign: "center"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#334155", textTransform: "uppercase" }}>Total Calls</span>
            <strong style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>{metrics.total}</strong>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel" style={{ display: "grid", gap: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>⏰ SLA TaT Dashboard</h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
          Showing SLA Adherence and target completion turnaround times (TAT) {selectedRegion && selectedRegion !== "ALL" ? `for ${activeRegionName}` : "across all regions"}.
        </p>
      </div>

      <div className="caseTypeGrid compactThree" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
        {renderCard(
          "PC Cases",
          "💻",
          pcMetrics,
          "#ea580c", // Orange
          {
            onTotal: () => openRecordsWithFilter({ region: selectedRegion, segment: "PC" }),
            onWithin: () => openRecordsWithFilter({ region: selectedRegion, segment: "PC", ticketIds: pcMetrics.withinSlaTickets }),
            onBreached: () => openRecordsWithFilter({ region: selectedRegion, segment: "PC", ticketIds: pcMetrics.breachedSlaTickets }),
            onPending: () => openRecordsWithFilter({ region: selectedRegion, segment: "PC", ticketIds: pcMetrics.pendingTickets }),
          }
        )}

        {renderCard(
          "Print Cases",
          "🖨️",
          printMetrics,
          "#0284c7", // Blue
          {
            onTotal: () => openRecordsWithFilter({ region: selectedRegion, printCase: "fix" }),
            onWithin: () => openRecordsWithFilter({ region: selectedRegion, printCase: "fix", ticketIds: printMetrics.withinSlaTickets }),
            onBreached: () => openRecordsWithFilter({ region: selectedRegion, printCase: "fix", ticketIds: printMetrics.breachedSlaTickets }),
            onPending: () => openRecordsWithFilter({ region: selectedRegion, printCase: "fix", ticketIds: printMetrics.pendingTickets }),
          }
        )}

        {renderCard(
          "Install Cases",
          "🔧",
          installMetrics,
          "#8b5cf6", // Purple
          {
            onTotal: () => openRecordsWithFilter({ region: selectedRegion, printCase: "installation" }),
            onWithin: () => openRecordsWithFilter({ region: selectedRegion, printCase: "installation", ticketIds: installMetrics.withinSlaTickets }),
            onBreached: () => openRecordsWithFilter({ region: selectedRegion, printCase: "installation", ticketIds: installMetrics.breachedSlaTickets }),
            onPending: () => openRecordsWithFilter({ region: selectedRegion, printCase: "installation", ticketIds: installMetrics.pendingTickets }),
          }
        )}
      </div>
    </div>
  );
}
