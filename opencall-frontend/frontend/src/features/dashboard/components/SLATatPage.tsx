// SLA TaT — FieldEZ's live SLA for every open call, ordered by what needs doing first.
import { useMemo } from "react";
import type { ReportRow, PrintCaseFilter } from "../types";
import type { FieldezSlaFreshness } from "../../../lib/fieldezSlaApiClient";
import type { SlaLookup } from "../../../lib/slaTat";

/**
 * A dashboard that answers "which calls do I chase, in what order".
 *
 * What it replaces was three identical cards of counters. Every number on them was true and
 * none of them told anybody what to do next: a service manager reading "8 breached" still had
 * to go and find out which eight. Counters are a report card, and this is a work queue —
 * so the calls themselves are the page, and the totals are a strip above them.
 *
 * The clock is the source of truth. FieldEZ's own status was correct when the worker read
 * it, up to fifteen minutes ago; the deadline it recorded is a fixed instant, so every
 * countdown here is worked out at render and is right at the moment somebody looks. A call
 * that breached four minutes ago appears as breached, not as "Within SLA" until the next
 * sweep catches up.
 */

interface SLATatPageProps {
  selectedRegion: string | null;
  activeRegionName: string;
  pcRows: ReportRow[];
  printFixRows: ReportRow[];
  printInstallationRows: ReportRow[];
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

type Urgency = "breached" | "soon" | "today" | "healthy" | "none";

interface SlaCall {
  ticketId: string;
  customer: string;
  location: string;
  segment: "PC" | "Print" | "Install";
  /** Null when FieldEZ records no deadline for this call. */
  secondsLeft: number | null;
  urgency: Urgency;
  policy: string;
}

const HOUR = 3600;

/** The work order reduced to what two spellings share, for joining to the SLA table. */
function key(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cell(row: ReportRow, ...names: string[]): string {
  for (const name of names) {
    const value = String(row.output[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/**
 * Four bands, because four is what a person can hold while looking at a list.
 *
 * `today` is the useful middle: not urgent enough to drop everything, close enough that
 * leaving it until tomorrow means missing it.
 */
function urgencyOf(secondsLeft: number | null): Urgency {
  if (secondsLeft === null) return "none";
  if (secondsLeft < 0) return "breached";
  if (secondsLeft <= 4 * HOUR) return "soon";
  if (secondsLeft <= 24 * HOUR) return "today";
  return "healthy";
}

const URGENCY_STYLE: Record<Urgency, { fg: string; bg: string; border: string; label: string }> = {
  breached: { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca", label: "Breached" },
  soon: { fg: "#c2410c", bg: "#fff7ed", border: "#fed7aa", label: "Under 4h" },
  today: { fg: "#a16207", bg: "#fefce8", border: "#fde68a", label: "Today" },
  healthy: { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", label: "In hand" },
  none: { fg: "#64748b", bg: "#f8fafc", border: "#e2e8f0", label: "No SLA" },
};

/** "5h 20m", or "overdue 5h 20m". Seconds are dropped — nobody acts on them. */
function formatLeft(seconds: number | null): string {
  if (seconds === null) return "—";
  const overdue = seconds < 0;
  const total = Math.abs(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const body = days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
  return overdue ? `overdue ${body}` : body;
}

function ageLabel(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} min ago`;
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
  const calls = useMemo<SlaCall[]>(() => {
    const now = Date.now();
    const inRegion = (row: ReportRow) => {
      if (!selectedRegion || selectedRegion === "ALL") return true;
      return (
        String(row.output["Work Location"] ?? "").trim().toUpperCase() ===
        selectedRegion.trim().toUpperCase()
      );
    };

    // One entry per call. The Flex WIP export is part-level, so a call waiting on three
    // spare parts arrives as three rows under one work order — three lines in this queue
    // would be three people chasing the same job.
    const seen = new Set<string>();
    const out: SlaCall[] = [];
    const groups: Array<[SlaCall["segment"], ReportRow[]]> = [
      ["PC", pcRows],
      ["Print", printFixRows],
      ["Install", printInstallationRows],
    ];

    for (const [segment, rows] of groups) {
      for (const row of rows) {
        if (!inRegion(row)) continue;
        const ticketId = cell(row, "Ticket ID");
        const k = key(ticketId);
        if (!k || seen.has(k)) continue;
        seen.add(k);

        const sla = slaByTicket.get(k);
        let secondsLeft: number | null = null;
        if (sla?.slaEndTime) {
          const end = new Date(sla.slaEndTime).getTime();
          if (!Number.isNaN(end)) secondsLeft = Math.round((end - now) / 1000);
        }
        out.push({
          ticketId,
          customer: cell(row, "Customer Name", "Account Name"),
          location: cell(row, "Location", "Customer City", "Work Location"),
          segment,
          secondsLeft,
          urgency: urgencyOf(secondsLeft),
          policy: sla?.slaStatus ?? "",
        });
      }
    }
    return out;
  }, [pcRows, printFixRows, printInstallationRows, slaByTicket, selectedRegion]);

  const counts = useMemo(() => {
    const tally: Record<Urgency, number> = { breached: 0, soon: 0, today: 0, healthy: 0, none: 0 };
    for (const call of calls) tally[call.urgency] += 1;
    return tally;
  }, [calls]);

  /** The queue: everything already missed or about to be, worst first. */
  const queue = useMemo(
    () =>
      calls
        .filter((call) => call.urgency === "breached" || call.urgency === "soon")
        .sort((a, b) => (a.secondsLeft ?? 0) - (b.secondsLeft ?? 0)),
    [calls],
  );

  const judgeable = counts.breached + counts.soon + counts.today + counts.healthy;
  const adherence = judgeable > 0 ? Math.round(((judgeable - counts.breached) / judgeable) * 100) : 100;

  const drill = (urgency: Urgency) =>
    openRecordsWithFilter({
      region: selectedRegion,
      ticketIds: calls.filter((call) => call.urgency === urgency).map((call) => call.ticketId),
    });

  const bySegment = useMemo(() => {
    const rows: Array<{ segment: string; total: number; breached: number; soon: number }> = [];
    for (const segment of ["PC", "Print", "Install"] as const) {
      const scoped = calls.filter((call) => call.segment === segment);
      rows.push({
        segment,
        total: scoped.length,
        breached: scoped.filter((call) => call.urgency === "breached").length,
        soon: scoped.filter((call) => call.urgency === "soon").length,
      });
    }
    return rows;
  }, [calls]);

  const byLocation = useMemo(() => {
    const map = new Map<string, { total: number; breached: number; soon: number }>();
    for (const call of calls) {
      const name = call.location || "—";
      const held = map.get(name) ?? { total: 0, breached: 0, soon: 0 };
      held.total += 1;
      if (call.urgency === "breached") held.breached += 1;
      if (call.urgency === "soon") held.soon += 1;
      map.set(name, held);
    }
    // Worst first: a location with breaches is what somebody needs to look at, not the one
    // with the most calls.
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.breached - a.breached || b.soon - a.soon || b.total - a.total)
      .slice(0, 8);
  }, [calls]);

  const tile = (urgency: Urgency, caption: string) => {
    const style = URGENCY_STYLE[urgency];
    const value = counts[urgency];
    return (
      <button
        type="button"
        onClick={() => drill(urgency)}
        title={`Show these ${value} call${value === 1 ? "" : "s"} in the report`}
        style={{
          flex: "1 1 150px",
          minWidth: 0,
          textAlign: "left",
          padding: "14px 16px",
          borderRadius: 12,
          border: `1px solid ${style.border}`,
          background: style.bg,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: style.fg, textTransform: "uppercase" }}>
          {style.label}
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: style.fg, lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{caption}</div>
      </button>
    );
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{
          padding: "18px 20px",
          borderRadius: 14,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-.01em" }}>
            SLA · live
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            From FieldEZ, {selectedRegion && selectedRegion !== "ALL" ? activeRegionName : "all regions"} ·
            counted down from each call&apos;s own deadline, so it is right as you read it.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: counts.breached > 0 ? "#b91c1c" : "#15803d" }}>
              {adherence}%
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>kept</div>
          </div>
          {/* The age of the answer sits with the answer: an SLA figure contains a date, so
              one from a table that stopped refreshing is confidently wrong, not merely old. */}
          <div
            style={{
              fontSize: 11.5,
              color: slaError ? "#b91c1c" : "var(--muted)",
              maxWidth: 210,
              textAlign: "right",
            }}
          >
            {slaError
              ? `FieldEZ SLA unavailable — ${slaError}`
              : slaLoading
                ? "refreshing…"
                : `${slaFreshness?.rows ?? 0} calls held · ${ageLabel(slaFreshness?.lastFetchedAt ?? null)}`}
          </div>
        </div>
      </div>

      {/* ── the strip ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {tile("breached", "past the deadline")}
        {tile("soon", "act today")}
        {tile("today", "due within 24h")}
        {tile("healthy", "time in hand")}
        {tile("none", "FieldEZ tracks none")}
      </div>

      {/* ── the queue ──────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
        <div
          style={{
            padding: "13px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 13.5, letterSpacing: ".02em" }}>NEEDS ATTENTION NOW</strong>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {queue.length === 0 ? "nothing overdue or close" : `${queue.length} call${queue.length === 1 ? "" : "s"}, worst first`}
          </span>
        </div>

        {queue.length === 0 ? (
          <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {slaLoading
              ? "Loading FieldEZ SLA…"
              : counts.none === calls.length && calls.length > 0
                ? "No SLA has come back from FieldEZ for these calls yet."
                : "Every call is comfortably inside its SLA. ✅"}
          </div>
        ) : (
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {queue.map((call) => {
              const style = URGENCY_STYLE[call.urgency];
              // How much of the last four hours is gone — a bar that only means something
              // where it matters, rather than a percentage of a deadline days away.
              const spent =
                call.secondsLeft === null
                  ? 100
                  : Math.max(0, Math.min(100, Math.round(((4 * HOUR - call.secondsLeft) / (4 * HOUR)) * 100)));
              return (
                <button
                  key={call.ticketId}
                  type="button"
                  onClick={() => openRecordsWithFilter({ region: selectedRegion, ticketIds: [call.ticketId] })}
                  title="Open this call in the report"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "grid",
                    gridTemplateColumns: "112px 1fr auto",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 18px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: style.fg,
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      borderRadius: 999,
                      padding: "3px 9px",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatLeft(call.secondsLeft)}
                  </span>

                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
                      {call.ticketId}
                      <span style={{ fontWeight: 500, color: "var(--muted)" }}>
                        {call.customer ? ` · ${call.customer}` : ""}
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>
                      {[call.segment, call.location].filter(Boolean).join(" · ")}
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 5,
                        height: 4,
                        borderRadius: 999,
                        background: "var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{ display: "block", width: `${spent}%`, height: "100%", background: style.fg }} />
                    </span>
                  </span>

                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>open →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── breakdowns ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div className="panel" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 700 }}>
            BY CASE TYPE
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {bySegment.map((entry) => (
                <tr key={entry.segment} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 18px", fontWeight: 600 }}>{entry.segment}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: "var(--muted)" }}>{entry.total}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: entry.breached > 0 ? "#b91c1c" : "var(--muted)", fontWeight: entry.breached > 0 ? 700 : 400 }}>
                    {entry.breached} breached
                  </td>
                  <td style={{ padding: "10px 18px", textAlign: "right", color: entry.soon > 0 ? "#c2410c" : "var(--muted)", fontWeight: entry.soon > 0 ? 700 : 400 }}>
                    {entry.soon} soon
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ padding: 0, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 700 }}>
            WHERE THE TROUBLE IS
          </div>
          {byLocation.length === 0 ? (
            <div style={{ padding: "20px 18px", color: "var(--muted)", fontSize: 13 }}>Nothing to show yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {byLocation.map((entry) => (
                  <tr key={entry.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 18px", fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.name}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "var(--muted)" }}>{entry.total}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: entry.breached > 0 ? "#b91c1c" : "var(--muted)", fontWeight: entry.breached > 0 ? 700 : 400 }}>
                      {entry.breached} breached
                    </td>
                    <td style={{ padding: "10px 18px", textAlign: "right", color: entry.soon > 0 ? "#c2410c" : "var(--muted)", fontWeight: entry.soon > 0 ? 700 : 400 }}>
                      {entry.soon} soon
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
