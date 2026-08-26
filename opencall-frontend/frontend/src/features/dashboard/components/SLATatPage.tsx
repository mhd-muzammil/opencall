// SLA TaT — adherence for PC, Print and Install cases, from what FieldEZ actually promised.
import type { ReportRow, PrintCaseFilter } from "../types";
import {
  BREACHING_SOON_HOURS,
  calculateFieldezSlaMetrics,
  type FieldezSlaMetrics,
  type SlaLookup,
} from "../../../lib/slaTat";
import type { FieldezSlaFreshness } from "../../../lib/fieldezSlaApiClient";

/**
 * The numbers here used to be a reconstruction.
 *
 * They took the TAT column we hold, compared it to the clock, and called the difference
 * adherence — the best available answer while FieldEZ's own SLA was locked inside its ticket
 * pages, and one that disagreed with it. Different dates, different rules, and no notion at
 * all of a call FieldEZ makes no promise about.
 *
 * FieldEZ's own numbers are now read every fifteen minutes and this page reads those. What
 * is on screen is what a person would see opening the ticket in FieldEZ, which is the only
 * version of these numbers anybody can act on or argue with HP about.
 *
 * The countdown is computed here, from the stored deadline, on every render. FieldEZ's
 * status was true when the worker asked; the deadline is a fixed instant and is true now.
 */

interface SLATatPageProps {
  selectedRegion: string | null;
  activeRegionName: string;
  pcRows: ReportRow[];
  printFixRows: ReportRow[];
  printInstallationRows: ReportRow[];
  /** Keyed by the work order with punctuation stripped. */
  slaByTicket: ReadonlyMap<string, SlaLookup>;
  slaFreshness: FieldezSlaFreshness | null;
  slaLoading: boolean;
  slaError: string | null;
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

/** "12 minutes ago" — how old the FieldEZ answer is. */
function ageLabel(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

export function SLATatPage({
  selectedRegion,
  activeRegionName,
  pcRows,
  printFixRows,
  printInstallationRows,
  slaByTicket,
  slaFreshness,
  slaLoading,
  slaError,
  openRecordsWithFilter,
}: Readonly<SLATatPageProps>) {
  const filterByRegion = (rows: ReportRow[]) => {
    if (!selectedRegion || selectedRegion === "ALL") return rows;
    const target = selectedRegion.trim().toUpperCase();
    return rows.filter(
      (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === target,
    );
  };

  const pcMetrics = calculateFieldezSlaMetrics(filterByRegion(pcRows), slaByTicket);
  const printMetrics = calculateFieldezSlaMetrics(filterByRegion(printFixRows), slaByTicket);
  const installMetrics = calculateFieldezSlaMetrics(filterByRegion(printInstallationRows), slaByTicket);

  const stat = (
    label: string,
    value: number,
    colors: { bg: string; border: string; label: string; value: string },
    onClick: () => void,
    title: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="slaItemButton"
      style={{
        padding: "12px",
        borderRadius: "8px",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: "11px", fontWeight: 700, color: colors.label, textTransform: "uppercase" }}>
        {label}
      </span>
      <strong style={{ fontSize: "20px", fontWeight: 800, color: colors.value, marginTop: "4px" }}>
        {value}
      </strong>
    </button>
  );

  const renderCard = (
    title: string,
    icon: string,
    metrics: FieldezSlaMetrics,
    themeColor: string,
    scope: Readonly<{ segment?: string | null; printCase?: PrintCaseFilter | null }>,
  ) => {
    const drill = (ticketIds: readonly string[] | null) =>
      openRecordsWithFilter({ region: selectedRegion, ...scope, ticketIds });

    return (
      <div
        className="panel"
        style={{
          padding: "20px",
          display: "grid",
          gap: "16px",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>{icon}</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{title}</h3>
          </div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#64748b",
              background: "#f1f5f9",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            {metrics.total} call{metrics.total === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0" }}>
          <strong style={{ fontSize: "36px", fontWeight: 800, color: themeColor }}>
            {metrics.adherence}%
          </strong>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
            SLA Adherence
          </span>
        </div>

        <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ width: `${metrics.adherence}%`, height: "100%", background: themeColor, borderRadius: "4px" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" }}>
          {stat(
            "Within SLA",
            metrics.within,
            { bg: "#f0fdf4", border: "#bbf7d0", label: "#166534", value: "#15803d" },
            () => drill(metrics.withinTickets),
            "Still inside the deadline FieldEZ recorded",
          )}
          {stat(
            "Breached",
            metrics.breached,
            { bg: "#fef2f2", border: "#fecaca", label: "#991b1b", value: "#b91c1c" },
            () => drill(metrics.breachedTickets),
            "Past the deadline FieldEZ recorded",
          )}
          {/* A subset of Within, surfaced separately because it is the only number on this
              page that is actionable today — everything else is a score, this is a list of
              calls somebody still has time to save. */}
          {stat(
            `< ${BREACHING_SOON_HOURS}h left`,
            metrics.soon,
            { bg: "#fff7ed", border: "#fed7aa", label: "#9a3412", value: "#c2410c" },
            () => drill(metrics.soonTickets),
            `Within SLA, but under ${BREACHING_SOON_HOURS} hours remain`,
          )}
          {stat(
            "No SLA",
            metrics.noSla,
            { bg: "#fafafa", border: "#e2e8f0", label: "#64748b", value: "#475569" },
            () => drill(metrics.noSlaTickets),
            "FieldEZ records no SLA for these — they are left out of the percentage",
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel" style={{ display: "grid", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>⏰ SLA TaT Dashboard</h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
          FieldEZ&apos;s own SLA for every open call{" "}
          {selectedRegion && selectedRegion !== "ALL" ? `in ${activeRegionName}` : "across all regions"}.
          The countdown is worked out from each call&apos;s recorded deadline, so it is right at
          the moment you look.
        </p>
        {/* The age of the answer sits with the answer. An SLA figure contains a date, so one
            drawn from a table that stopped refreshing is not merely stale — it is confidently
            wrong, and it looks exactly like a current one. */}
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: slaError ? "#b91c1c" : "var(--muted)" }}>
          {slaError
            ? `FieldEZ SLA could not be loaded — ${slaError}`
            : slaLoading
              ? "Loading FieldEZ SLA…"
              : `FieldEZ SLA for ${slaFreshness?.rows ?? 0} call(s), last refreshed ${ageLabel(
                  slaFreshness?.lastFetchedAt ?? null,
                )}.`}
        </p>
      </div>

      <div
        className="caseTypeGrid compactThree"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}
      >
        {renderCard("PC Cases", "💻", pcMetrics, "#ea580c", { segment: "PC" })}
        {renderCard("Print Cases", "🖨️", printMetrics, "#0284c7", { printCase: "fix" })}
        {renderCard("Install Cases", "🔧", installMetrics, "#8b5cf6", { printCase: "installation" })}
      </div>
    </div>
  );
}
