import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import type { ReportRow } from "../types";
import { formatNumber } from "../utils";
import {
  CALL_STATUS_OPTIONS,
  CUSTOMER_FEEDBACK_OPTIONS,
} from "../../../lib/customerFeedbackApiClient";

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

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-06" -> "Jun 2026". */
function formatMonthKey(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const monthIndex = Number(match[2]) - 1;
  return `${MONTH_NAMES[monthIndex] ?? match[2]} ${match[1]}`;
}

/** "2026-06-05" -> "05-06-2026". */
function formatDateKey(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : key;
}

/** Human label for a from/to range: "05-06-2026 → 20-08-2026", "onwards", "up to", etc. */
function formatRangeLabel(
  lo: string,
  hi: string,
  fmt: (v: string) => string,
  allLabel: string,
): string {
  if (!lo && !hi) return allLabel;
  if (lo && hi) return lo === hi ? fmt(lo) : `${fmt(lo)} → ${fmt(hi)}`;
  return lo ? `${fmt(lo)} onwards` : `up to ${fmt(hi)}`;
}

/**
 * The two imported comparison counts shown under a region card's own closed count:
 *
 *   Closure import — rows in the last Flex Closure ASP Report import that trace back to
 *                    this ASP (that report has no region column, so the server resolves
 *                    it from the report rows / raw data)
 *   Raw data       — rows in the last Flex RAW export import whose Call Status is closed
 *
 * Each line only renders once its source has actually been imported, so a card looks
 * exactly as it always did until there is something to compare against. The two numbers
 * cover different periods from the live closed count and from each other — they are a
 * reconciliation aid, not a total.
 */
function ComparisonCounts({
  closureCount,
  rawCount,
  closureHint,
  onDrill,
}: Readonly<{
  closureCount: number | null;
  rawCount: number | null;
  closureHint?: string | null;
  /** Opens the record list for that source; only wired when the count is clickable. */
  onDrill?: (kind: "closure" | "raw") => void;
}>) {
  if (closureCount === null && rawCount === null) return null;

  const line = (
    label: string,
    count: number,
    color: string,
    kind: "closure" | "raw",
  ) => {
    const clickable = Boolean(onDrill) && count > 0;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={(e) => {
          // The card itself is clickable (region filter) — don't also select the region.
          e.stopPropagation();
          onDrill?.(kind);
        }}
        title={clickable ? "View records" : undefined}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "8px",
          fontSize: "11px",
          lineHeight: 1.7,
          padding: 0,
          border: "none",
          background: "none",
          font: "inherit",
          textAlign: "left",
          cursor: clickable ? "pointer" : "default",
        }}
      >
        <span style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: "4px" }}>
          {label}
          {clickable && <span style={{ fontSize: "9px", opacity: 0.7 }}>▸</span>}
        </span>
        <span style={{ fontWeight: 700, color, textDecoration: clickable ? "underline dotted" : "none", textUnderlineOffset: "2px" }}>
          {formatNumber(count)}
        </span>
      </button>
    );
  };

  return (
    <div
      style={{
        marginTop: "8px",
        paddingTop: "8px",
        borderTop: "1px dashed var(--border-color, #e5e7eb)",
      }}
    >
      {closureCount !== null && line("Closure import", closureCount, "#7c3aed", "closure")}
      {rawCount !== null && line("Raw data closed", rawCount, "#ea580c", "raw")}
      {closureHint && (
        <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>
          {closureHint}
        </div>
      )}
    </div>
  );
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
  // Session token + a callback fired after a successful closure-date import, so the
  // parent can refresh the report and pull in the new Case Closed Date values. When
  // absent, the "Import Closure Dates" button is hidden (e.g. view-only sessions).
  closureImportToken?: string | null;
  onClosureDatesImported?: () => void;
  // Token used to save Customer Feedback. When absent, the Feedback button is hidden
  // (view-only sessions). A successful save fires onClosureDatesImported to refresh.
  feedbackToken?: string | null;
  // Read-only token used to fetch the two comparison counts shown under each region
  // card (imported closure dates, imported Flex raw data). When absent those lines are
  // simply not rendered — the existing closed count is unaffected either way.
  summaryToken?: string | null;
}

export function ClosedCallsDashboardView({
  overallClosedCount,
  closedRegionBreakdown,
  closedRows,
  selectedRegion,
  setSelectedRegion,
  openRecordsWithFilter,
  onOpenCaseDetail,
  closureImportToken,
  onClosureDatesImported,
  feedbackToken,
  summaryToken,
}: Readonly<ClosedCallsDashboardViewProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  // Case Closed Date range filter (YYYY-MM-DD from the date inputs). When either bound
  // is set, rows without a Case Closed Date, or outside the range, are hidden.
  const [closedFrom, setClosedFrom] = useState("");
  const [closedTo, setClosedTo] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const closureFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // The two comparison sources shown under each region card. Both are independent of the
  // live closed count: they come from their own import/sync and only ever ADD lines to a
  // card — a failed fetch leaves the card exactly as it was before. The full per-ASP /
  // per-month payload is kept so the month dropdown can rescope the cards with no refetch.
  const [closureSummary, setClosureSummary] = useState<import("../../../lib/closureDateApiClient").ClosureDateSummary | null>(null);
  const [rawSummary, setRawSummary] = useState<import("../../../lib/flexRawApiClient").FlexRawSummary | null>(null);
  // Day-precise date range for the comparison counts, typed into date inputs. Each is ""
  // (unbounded) or a "YYYY-MM-DD" value. Both empty = all dates.
  const [comparisonFrom, setComparisonFrom] = useState("");
  const [comparisonTo, setComparisonTo] = useState("");
  const [rawSyncing, setRawSyncing] = useState(false);
  const [rawSyncMessage, setRawSyncMessage] = useState<string | null>(null);
  // The record-list drill-down opened from a card's "Closure import" / "Raw data closed".
  const [drill, setDrill] = useState<{ kind: "closure" | "raw"; aspCode: string; label: string } | null>(null);
  // Bumped after an import/sync so the summaries refetch without reloading the report.
  const [summaryNonce, setSummaryNonce] = useState(0);

  React.useEffect(() => {
    if (!summaryToken) return;
    let cancelled = false;
    void (async () => {
      const [{ getClosureDatesSummary }, { getFlexRawSummary }] = await Promise.all([
        import("../../../lib/closureDateApiClient"),
        import("../../../lib/flexRawApiClient"),
      ]);

      try {
        const summary = await getClosureDatesSummary(summaryToken);
        if (!cancelled) setClosureSummary(summary);
      } catch {
        // No closure dates imported yet (or the endpoint is unavailable) — the card
        // simply omits that line.
      }

      try {
        const summary = await getFlexRawSummary(summaryToken);
        if (!cancelled) setRawSummary(summary);
      } catch {
        // No raw data synced yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, summaryNonce]);

  // Month options — union of both sources, newest first. Empty until something imported.
  const comparisonMonths = useMemo(() => {
    const set = new Set<string>();
    for (const m of closureSummary?.months ?? []) set.add(m);
    for (const m of rawSummary?.months ?? []) set.add(m);
    return [...set].sort().reverse();
  }, [closureSummary, rawSummary]);

  // Normalised date bounds — a reversed From/To is swapped so order never matters.
  const [dateLo, dateHi] = useMemo(() => {
    if (comparisonFrom && comparisonTo && comparisonFrom > comparisonTo) {
      return [comparisonTo, comparisonFrom];
    }
    return [comparisonFrom, comparisonTo];
  }, [comparisonFrom, comparisonTo]);
  const rangeActive = Boolean(dateLo || dateHi);

  // Raw data only has month granularity, so a date range maps to the months it spans.
  const monthLo = dateLo ? dateLo.slice(0, 7) : "";
  const monthHi = dateHi ? dateHi.slice(0, 7) : "";
  const inMonthRange = useMemo(() => {
    return (m: string): boolean => {
      if (!monthLo && !monthHi) return true;
      if (!m) return false;
      if (monthLo && m < monthLo) return false;
      if (monthHi && m > monthHi) return false;
      return true;
    };
  }, [monthLo, monthHi]);

  // Date-input bounds — first day of the earliest month to the last day of the latest.
  const [minDate, maxDate] = useMemo(() => {
    if (comparisonMonths.length === 0) return ["", ""];
    const asc = [...comparisonMonths].sort();
    const earliest = asc[0]!;
    const latest = asc[asc.length - 1]!;
    const [ly, lm] = latest.split("-").map(Number);
    const lastDay = new Date(ly!, lm!, 0).getDate();
    return [`${earliest}-01`, `${latest}-${String(lastDay).padStart(2, "0")}`];
  }, [comparisonMonths]);

  // Closure is day-precise: when a date range is active the monthly byAspMonth cannot
  // answer a mid-month boundary, so a scoped summary is fetched for the exact range.
  // Cleared when no range is active (the cards then use the full summary).
  const [closureScoped, setClosureScoped] =
    useState<import("../../../lib/closureDateApiClient").ClosureDateSummary | null>(null);
  React.useEffect(() => {
    if (!summaryToken || !rangeActive) {
      setClosureScoped(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { getClosureDatesSummary } = await import("../../../lib/closureDateApiClient");
        const scoped = await getClosureDatesSummary(summaryToken, { from: dateLo, to: dateHi });
        if (!cancelled) setClosureScoped(scoped);
      } catch {
        // Keep whatever the cards last showed on a transient failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaryToken, rangeActive, dateLo, dateHi, summaryNonce]);

  // Per-ASP closure count. Day-precise via the scoped summary when a range is active,
  // otherwise the full all-dates summary. aspCode "" is the "All Regions" rollup (which
  // includes closure dates with no matched region).
  const closureCountFor = useMemo(() => {
    const src = rangeActive ? closureScoped : closureSummary;
    return (aspCode: string): number | null => {
      if (!src) return null;
      if (aspCode === "") return src.total;
      return src.byAsp.find((e) => e.aspCode === aspCode)?.count ?? 0;
    };
  }, [closureSummary, closureScoped, rangeActive]);

  // Closure unmatched count from whichever summary is active (for the ALL card hint).
  const closureUnmatched = (rangeActive ? closureScoped : closureSummary)?.unmatched ?? 0;

  // Per-ASP raw CLOSED count for the range (month-mapped) or all months.
  const rawClosedFor = useMemo(() => {
    return (aspCode: string): number | null => {
      if (!rawSummary) return null;
      if (!rangeActive) {
        if (aspCode === "") return rawSummary.closed;
        return rawSummary.byAsp.find((e) => e.aspCode === aspCode)?.closed ?? 0;
      }
      return rawSummary.byAspMonth
        .filter((e) => inMonthRange(e.month) && (aspCode === "" || e.aspCode === aspCode))
        .reduce((sum, e) => sum + e.closed, 0);
    };
  }, [rawSummary, rangeActive, inMonthRange]);

  async function handleSyncRawData() {
    if (!closureImportToken) return;
    setRawSyncing(true);
    setRawSyncMessage(null);
    try {
      const { syncFlexRawData } = await import("../../../lib/flexRawApiClient");
      const result = await syncFlexRawData(closureImportToken);
      setRawSyncMessage(
        `Synced ${formatNumber(result.imported)} rows — ${formatNumber(result.closed)} closed.`,
      );
      setSummaryNonce((n) => n + 1);
    } catch (error) {
      setRawSyncMessage(
        `Sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setRawSyncing(false);
    }
  }

  // Customer feedback modal state. `feedbackRow` is the row currently being edited.
  const [feedbackRow, setFeedbackRow] = useState<ReportRow | null>(null);
  const [fbCallStatus, setFbCallStatus] = useState("");
  const [fbFeedback, setFbFeedback] = useState("");
  const [fbRemarks, setFbRemarks] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  function openFeedback(row: ReportRow) {
    const out = (row.output ?? {}) as Record<string, unknown>;
    const existing = out["Customer Feedback"] as
      | { callStatus?: string; feedback?: string; remarks?: string }
      | undefined;
    setFeedbackRow(row);
    setFbCallStatus(String(existing?.callStatus ?? ""));
    setFbFeedback(String(existing?.feedback ?? ""));
    setFbRemarks(String(existing?.remarks ?? ""));
    setFbError(null);
  }

  async function saveFeedback() {
    if (!feedbackRow || !feedbackToken) return;
    if (!fbCallStatus && !fbFeedback) {
      setFbError("Pick a call status or a feedback value.");
      return;
    }
    const out = (feedbackRow.output ?? {}) as Record<string, unknown>;
    setFbSaving(true);
    setFbError(null);
    try {
      const { saveCustomerFeedback } = await import(
        "../../../lib/customerFeedbackApiClient"
      );
      await saveCustomerFeedback(feedbackToken, {
        woId: String(out["Ticket ID"] ?? out["WO ID"] ?? ""),
        caseId: String(out["Case ID"] ?? ""),
        callStatus: fbCallStatus,
        feedback: fbFeedback,
        remarks: fbRemarks.trim(),
      });
      setFeedbackRow(null);
      onClosureDatesImported?.(); // refresh the report so Customer Status updates
    } catch (error) {
      setFbError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setFbSaving(false);
    }
  }

  async function handleClosureFile(file: File | null) {
    if (!file || !closureImportToken) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const { importClosureDates } = await import("../../../lib/closureDateApiClient");
      const result = await importClosureDates(closureImportToken, file);
      setImportMessage(
        `Imported ${result.imported} closure dates (skipped ${result.skippedNoDate} without a date).`,
      );
      setSummaryNonce((n) => n + 1);
      onClosureDatesImported?.();
    } catch (error) {
      setImportMessage(
        `Import failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setImporting(false);
      if (closureFileInputRef.current) closureFileInputRef.current.value = "";
    }
  }

  // Total active WIP count across all regions
  const totalActiveWipCount = useMemo(() => {
    return closedRegionBreakdown.reduce((sum, item) => sum + item.activeCount, 0);
  }, [closedRegionBreakdown]);

  // Total calls (Closed + Active WIP)
  // Closed count that the cards reflect — the date-filtered count when a range is set,
  // otherwise the full total. Defined below `dateFilterActive`/`filteredClosedRows`.
  const totalCallsCount = overallClosedCount + totalActiveWipCount;

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

      // Case Closed Date range filter. The value is DD-MM-YYYY; convert to YYYY-MM-DD
      // for a lexical comparison against the (already YYYY-MM-DD) date-input bounds.
      if (closedFrom || closedTo) {
        const raw = String(output["Case Closed Date"] ?? "").trim();
        const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
        if (!dmy) return false; // no closed date → excluded once a bound is set
        const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        if (closedFrom && iso < closedFrom) return false;
        if (closedTo && iso > closedTo) return false;
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
  }, [closedRows, selectedRegion, searchQuery, closedFrom, closedTo]);

  const dateInputStyle: React.CSSProperties = {
    padding: "7px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    border: "1px solid var(--border-color, #d1d5db)",
    background: "var(--input-bg, #f9fafb)",
  };

  // Closed share % — uses the date-filtered closed count when a range is applied.
  const shareClosed =
    closedFrom || closedTo ? filteredClosedRows.length : overallClosedCount;
  const closedPercentage =
    totalCallsCount > 0 ? ((shareClosed / totalCallsCount) * 100).toFixed(1) : "0.0";

  // When a Closed Date range is applied, the counts follow what the table shows
  // (filteredClosedRows), so the stat cards + region cards move with the filter.
  const dateFilterActive = Boolean(closedFrom || closedTo);

  // Per-region closed count for the active Closed Date range (ignores the region
  // selection so every region card still shows its own date-filtered number). Only
  // computed while a range is set; otherwise the cards use the full breakdown counts.
  const dateFilteredCountByAsp = useMemo(() => {
    const counts = new Map<string, number>();
    if (!dateFilterActive) return counts;
    for (const row of closedRows) {
      const output = (row.output ?? {}) as Record<string, unknown>;
      const raw = String(output["Case Closed Date"] ?? "").trim();
      const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
      if (!dmy) continue;
      const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      if (closedFrom && iso < closedFrom) continue;
      if (closedTo && iso > closedTo) continue;
      const asp = getRowAspCode(output);
      counts.set(asp, (counts.get(asp) ?? 0) + 1);
    }
    return counts;
  }, [closedRows, dateFilterActive, closedFrom, closedTo]);

  // Total across all regions for the active range (the ALL card's number).
  const dateFilteredTotal = useMemo(() => {
    let sum = 0;
    for (const v of dateFilteredCountByAsp.values()) sum += v;
    return sum;
  }, [dateFilteredCountByAsp]);

  // Regional stats for active selection
  const activeRegionStats = useMemo(() => {
    if (!selectedRegion || selectedRegion === "ALL") {
      return {
        closed: dateFilterActive ? filteredClosedRows.length : overallClosedCount,
        wip: totalActiveWipCount,
        label: "All Operational Regions",
      };
    }
    const targetUpper = selectedRegion.trim().toUpperCase();
    const match = closedRegionBreakdown.find(
      (item) => item.aspCode.toUpperCase() === targetUpper || item.regionName.toUpperCase() === targetUpper
    );
    return {
      // Date filter always narrows to the visible rows; otherwise use the region total.
      closed: dateFilterActive
        ? filteredClosedRows.length
        : match
          ? match.closedCount
          : filteredClosedRows.length,
      wip: match ? match.activeCount : 0,
      label: match ? `${match.regionName} (${match.aspCode})` : selectedRegion,
    };
  }, [selectedRegion, overallClosedCount, totalActiveWipCount, closedRegionBreakdown, filteredClosedRows.length, dateFilterActive]);

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
              ✓ {formatNumber(dateFilterActive ? dateFilteredTotal : overallClosedCount)} Total Closed
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

          {/* Closed Date range filter — drives the cards, region cards AND the table */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", marginBottom: "3px" }}>Closed from</label>
              <input type="date" value={closedFrom} onChange={(e) => setClosedFrom(e.target.value)} style={dateInputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "#6b7280", marginBottom: "3px" }}>Closed to</label>
              <input type="date" value={closedTo} onChange={(e) => setClosedTo(e.target.value)} style={dateInputStyle} />
            </div>
            {(closedFrom || closedTo) && (
              <button
                type="button"
                onClick={() => { setClosedFrom(""); setClosedTo(""); }}
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  color: "#374151",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Clear dates
              </button>
            )}
          </div>
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
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            {/* Comparison date range (typed) for the Closure-import / Raw-data-closed
                lines. Closure filters by exact date; raw uses the months the range spans.
                Only rendered once at least one of those sources has data. */}
            {comparisonMonths.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", fontSize: "12px", color: "#6b7280", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: "10px", fontWeight: 600, marginBottom: "3px" }}>Comparison from</label>
                  <input
                    type="date"
                    value={comparisonFrom}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                    onChange={(e) => setComparisonFrom(e.target.value)}
                    style={dateInputStyle}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: "10px", fontWeight: 600, marginBottom: "3px" }}>Comparison to</label>
                  <input
                    type="date"
                    value={comparisonTo}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                    onChange={(e) => setComparisonTo(e.target.value)}
                    style={dateInputStyle}
                  />
                </div>
                {rangeActive && (
                  <button
                    type="button"
                    onClick={() => { setComparisonFrom(""); setComparisonTo(""); }}
                    title="Clear comparison dates"
                    style={{
                      padding: "8px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "8px",
                      border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedRegion(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedRegion(null); }
            }}
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
              {formatNumber(dateFilterActive ? dateFilteredTotal : overallClosedCount)}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>
              {formatNumber(totalActiveWipCount)} active WIP
            </div>
            <ComparisonCounts
              closureCount={closureCountFor("")}
              rawCount={rawClosedFor("")}
              closureHint={
                closureUnmatched > 0 ? `${formatNumber(closureUnmatched)} unmatched` : null
              }
              onDrill={(kind) => setDrill({ kind, aspCode: "", label: "All Regions" })}
            />
          </div>

          {closedRegionBreakdown.map((entry) => {
            const isSelected = selectedRegion === entry.aspCode;
            return (
              <div
                key={entry.aspCode}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRegion(entry.aspCode)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedRegion(entry.aspCode); }
                }}
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
                  {formatNumber(
                    dateFilterActive
                      ? dateFilteredCountByAsp.get(entry.aspCode) ?? 0
                      : entry.closedCount,
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>
                  {entry.aspCode} | {formatNumber(entry.activeCount)} WIP
                </div>
                <ComparisonCounts
                  closureCount={closureCountFor(entry.aspCode)}
                  rawCount={rawClosedFor(entry.aspCode)}
                  onDrill={(kind) => setDrill({ kind, aspCode: entry.aspCode, label: entry.regionName })}
                />
              </div>
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

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Import Closure Dates (matches by WO ID / Case ID from the Flex Closure ASP Report) */}
            {closureImportToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <input
                  ref={closureFileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={(e) => void handleClosureFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => closureFileInputRef.current?.click()}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    border: "1px solid #c7d2fe",
                    background: importing ? "#eef2ff" : "#4f46e5",
                    color: importing ? "#6366f1" : "#ffffff",
                    cursor: importing ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {importing ? "Importing…" : "⬆ Import Closure Dates"}
                </button>
                {importMessage && (
                  <span style={{ fontSize: "11px", color: "#6b7280", maxWidth: "260px", textAlign: "right" }}>
                    {importMessage}
                  </span>
                )}
              </div>
            )}

            {/* Sync Raw Data — pulls the Flex RAW closed-call rows from the raw-data
                project's API (no file upload). Feeds the "Raw data closed" card line.
                Same permissions as the closure-date import. */}
            {closureImportToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <button
                  type="button"
                  disabled={rawSyncing}
                  onClick={() => void handleSyncRawData()}
                  style={{
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    border: "1px solid #fed7aa",
                    background: rawSyncing ? "#fff7ed" : "#ea580c",
                    color: rawSyncing ? "#ea580c" : "#ffffff",
                    cursor: rawSyncing ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rawSyncing ? "Syncing…" : "🔄 Sync Raw Data"}
                </button>
                {rawSyncMessage && (
                  <span style={{ fontSize: "11px", color: "#6b7280", maxWidth: "260px", textAlign: "right" }}>
                    {rawSyncMessage}
                  </span>
                )}
              </div>
            )}

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
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Name</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Mail</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Contact</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>WIP Aging</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Case Created Time</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Case Closed Date</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>Customer Status</th>
                <th style={{ padding: "10px 14px", fontWeight: "700", textAlign: "center" }}>Customer Feedback</th>
                <th style={{ padding: "10px 14px", fontWeight: "700" }}>RTPL Status</th>
                <th style={{ padding: "10px 14px", fontWeight: "700", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosedRows.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ padding: "32px 14px", textAlign: "center", color: "#6b7280" }}>
                    {searchQuery.trim()
                      ? `No closed call records matching "${searchQuery}"`
                      : "No closed call records available for the selected filter."}
                  </td>
                </tr>
              ) : (
                filteredClosedRows.map((row, idx) => {
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
                  const wipAging = String(out["WIP aging"] ?? out["WIP Aging"] ?? "-");
                  const caseCreatedTime = String(out["Case Created Time"] ?? "-");
                  // Closure date comes from the imported Closure-Date Excel (matched by
                  // WO ID / Case ID), not a calculation. "-" until an import supplies it.
                  const caseClosedDate = String(out["Case Closed Date"] ?? "-");
                  // Customer Status is derived server-side from saved customer feedback.
                  const customerStatus = String(out["Customer Status"] ?? "-");

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
                      <td style={{ padding: "10px 14px", fontWeight: "500", color: "#374151" }}>
                        {customer}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        {customerMail}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>
                        {contact}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {wipAging !== "-" ? `${wipAging} days` : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {caseCreatedTime}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>
                        {caseClosedDate}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151", maxWidth: "220px" }}>
                        {customerStatus}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {feedbackToken ? (
                          <button
                            type="button"
                            onClick={() => openFeedback(row)}
                            style={{
                              padding: "5px 10px",
                              fontSize: "12px",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #c7d2fe",
                              background: "#eef2ff",
                              color: "#4f46e5",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {customerStatus !== "-" ? "Edit feedback" : "+ Feedback"}
                          </button>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "12px" }}>—</span>
                        )}
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

        {filteredClosedRows.length > 0 && (
          <div style={{ marginTop: "12px", textAlign: "center", fontSize: "12px", color: "#6b7280" }}>
            Showing all {filteredClosedRows.length} closed call records.{" "}
            <button
              type="button"
              onClick={() => openRecordsWithFilter({ region: selectedRegion, closedOnly: true })}
              style={{ color: "#2563eb", fontWeight: "600", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Open full interactive table
            </button>
          </div>
        )}
      </div>

      {/* Customer Feedback modal — portaled to <body> so an ancestor with
          backdrop-filter (the glassy cards) cannot hijack its position:fixed. */}
      {feedbackRow &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          onClick={() => !fbSaving && setFeedbackRow(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "12px",
              padding: "24px",
              width: "440px",
              maxWidth: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 4px 0", fontSize: "17px", fontWeight: 700 }}>
              Customer Feedback
            </h3>
            <p style={{ margin: "0 0 18px 0", fontSize: "12px", color: "#6b7280" }}>
              {String(
                (feedbackRow.output as Record<string, unknown>)["Ticket ID"] ?? "",
              )}
            </p>

            {(() => {
              const selectStyle: React.CSSProperties = {
                width: "100%",
                padding: "9px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                background: "var(--input-bg, #f9fafb)",
                fontFamily: "inherit",
                color: "#111827",
              };
              return (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                      Call Status
                    </label>
                    <select
                      value={fbCallStatus}
                      onChange={(e) => setFbCallStatus(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select call status…</option>
                      {CALL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                      Customer Feedback
                    </label>
                    <select
                      value={fbFeedback}
                      onChange={(e) => setFbFeedback(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select feedback…</option>
                      {CUSTOMER_FEEDBACK_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                Remarks <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={fbRemarks}
                onChange={(e) => setFbRemarks(e.target.value)}
                rows={3}
                placeholder="Any extra notes…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "var(--input-bg, #f9fafb)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {fbError && (
              <div style={{ color: "#dc2626", fontSize: "12px", marginBottom: "12px" }}>
                {fbError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setFeedbackRow(null)}
                disabled={fbSaving}
                style={{
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveFeedback()}
                disabled={fbSaving}
                style={{
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  background: fbSaving ? "#a5b4fc" : "#4f46e5",
                  color: "#ffffff",
                  cursor: fbSaving ? "default" : "pointer",
                }}
              >
                {fbSaving ? "Saving…" : "Save feedback"}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}

      {/* Record-list drill-down for a card's Closure-import / Raw-data-closed count. */}
      {drill && summaryToken && (
        <RecordsDrillModal
          token={summaryToken}
          kind={drill.kind}
          aspCode={drill.aspCode}
          closureFrom={dateLo}
          closureTo={dateHi}
          rawMonthFrom={monthLo}
          rawMonthTo={monthHi}
          regionLabel={drill.label}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

/**
 * Portaled modal listing the individual records behind a card's "Closure import" or
 * "Raw data closed" count, scoped to the same ASP + month the card showed. Fetches its
 * own data so opening it never blocks the cards.
 */
function RecordsDrillModal({
  token, kind, aspCode, closureFrom, closureTo, rawMonthFrom, rawMonthTo, regionLabel, onClose,
}: Readonly<{
  token: string;
  kind: "closure" | "raw";
  aspCode: string;
  /** Day-precise date bounds ("YYYY-MM-DD") used for the closure records. */
  closureFrom: string;
  closureTo: string;
  /** Month bounds ("YYYY-MM") used for the raw records (raw has no day granularity). */
  rawMonthFrom: string;
  rawMonthTo: string;
  regionLabel: string;
  onClose: () => void;
}>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (kind === "closure") {
          const { getClosureDateRecords } = await import("../../../lib/closureDateApiClient");
          const res = await getClosureDateRecords(token, { asp: aspCode, from: closureFrom, to: closureTo });
          if (cancelled) return;
          setRows(
            res.rows.map((r) => ({
              "WO ID": r.woId || "-",
              "Case ID": r.caseId || "-",
              "Closure Date": r.closureDate,
              Region: r.aspCode || "(unmatched)",
            })),
          );
          setTotal(res.total);
        } else {
          const { getFlexRawRecords } = await import("../../../lib/flexRawApiClient");
          const res = await getFlexRawRecords(token, { asp: aspCode, from: rawMonthFrom, to: rawMonthTo, status: "closed" });
          if (cancelled) return;
          setRows(
            res.rows.map((r) => ({
              Ticket: r.ticketNo || "-",
              "Case ID": r.caseId || "-",
              "Work Location": r.workLocation || "-",
              "Call Status": r.callStatus || "-",
              Month: r.month ? formatMonthKey(r.month) : "-",
            })),
          );
          setTotal(res.total);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kind, aspCode, closureFrom, closureTo, rawMonthFrom, rawMonthTo]);

  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  const title = kind === "closure" ? "Closure import" : "Raw data closed";
  // Closure shows the exact date range typed; raw shows the months it maps to.
  const rangeLabel =
    kind === "closure"
      ? formatRangeLabel(closureFrom, closureTo, formatDateKey, "All dates")
      : formatRangeLabel(rawMonthFrom, rawMonthTo, formatMonthKey, "All months");
  const scope = `${regionLabel} · ${rangeLabel}`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #ffffff)", borderRadius: "12px", width: "760px",
          maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: kind === "closure" ? "#7c3aed" : "#ea580c" }}>
              {title}
            </h3>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
              {scope} · {formatNumber(total)} record{total === 1 ? "" : "s"}
              {total > rows.length && ` (showing first ${formatNumber(rows.length)})`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WO, Case ID, status…"
            style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-color, #d1d5db)", background: "var(--input-bg, #f9fafb)" }}
          />
        </div>

        <div style={{ overflow: "auto", padding: "12px 20px 20px", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280", fontSize: "13px" }}>Loading records…</div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280", fontSize: "13px" }}>
              {rows.length === 0 ? "No records for this scope." : "No records match the search."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--border-color, #e5e7eb)", position: "sticky", top: 0, background: "var(--card-bg, #ffffff)", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-color, #f0f1f4)", color: "#1f2937", whiteSpace: "nowrap" }}>
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
