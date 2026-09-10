import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { ReportRow } from "../types";
import { formatNumber } from "../utils";
import {
  billCycleFor,
  billCycleForKey,
  formatMonthKey,
  prevMonthKey,
  type BillCycle,
} from "../utils/billCycle";
import {
  buildBillCycleOptions,
  useClosedCallsPeriod,
  type ClosedCallsPeriodPreset,
} from "../utils/closedCallsPeriod";
import { useClosedCallCounts } from "../hooks/useClosedCallCounts";
import { useClosedCallSources } from "../hooks/useClosedCallSources";
import {
  ClosedCallsHeader,
  FeedbackModal,
  LedgerTable,
  OursDrill,
  PeriodBar,
  ReconciliationPanel,
  RecordsDrill,
  RegionCardGrid,
  RepeatVisitsPanel,
  SourceComparison,
  fieldezCoverage,
  oursCoverage,
  rawCoverage,
  readClosureFreshness,
  rowMatchesQuery,
  rowOutput,
  type DrillState,
} from "./closedCalls";

// The bill cycle helpers live in ../utils/billCycle so Engineer Productivity can use the
// same definition. Re-exported here because this module was their home and its importers
// (and their tests) still reach for them through it.
export { billCycleFor, billCycleForKey, formatMonthKey, prevMonthKey };
export type { BillCycle };

/** The ledger renders a page at a time; every count and the export use the full set. */
const LEDGER_PAGE_SIZE = 100;

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
  openRecordsWithFilter: (filter: {
    region?: string | null;
    closedOnly?: boolean;
    ticketIds?: string[];
  }) => void;
  onOpenCaseDetail?: ((row: ReportRow) => void) | undefined;
  // Session token + a callback fired after a successful closure-date import, so the parent
  // can refresh the report and pull in the new Case Closed Date values. When absent, the
  // Import / Sync buttons are hidden (e.g. view-only sessions).
  closureImportToken?: string | null | undefined;
  onClosureDatesImported?: (() => void) | undefined;
  // Token used to save Customer Feedback. When absent the Feedback button is hidden.
  feedbackToken?: string | null | undefined;
  // Read-only token for the comparison counts, the repeat-visit report and the
  // reconciliation. When absent those sections are not rendered — our own closed count is
  // unaffected either way.
  summaryToken?: string | null | undefined;
}

/**
 * Closed Calls.
 *
 * Composition and page state only: the pieces live in ./closedCalls, the imported sources
 * in ../hooks/useClosedCallSources, and the period in ../utils/closedCallsPeriod. What is
 * kept here is what more than one piece needs — the period, the region, the search, and
 * the single count resolver they all read.
 *
 * THE ONE RULE OF THIS PAGE: the four closed counts come from four systems with different
 * coverage and they will not match. `closedCountFor` is the only resolver for OUR number,
 * so region cards always sum to the rollup; the others are labelled with where they came
 * from and what period they can actually answer for. Do not reconcile them into one.
 */
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
  const period = useClosedCallsPeriod();
  const { dateLo, dateHi, rangeActive, periodPreset, rowInPeriod } = period;

  // Whether the custom date inputs are on screen. UI only: the counting rule still comes
  // from `periodPreset`, which is derived from the bounds, so a chip can never claim a
  // period the numbers are not answering for.
  const [customOpen, setCustomOpen] = useState(periodPreset === "custom");
  useEffect(() => {
    if (periodPreset === "custom") setCustomOpen(true);
  }, [periodPreset]);

  const [searchQuery, setSearchQuery] = useState("");
  const [ledgerPage, setLedgerPage] = useState(0);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [feedbackRow, setFeedbackRow] = useState<ReportRow | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [rawSyncing, setRawSyncing] = useState(false);
  const [rawSyncMessage, setRawSyncMessage] = useState<string | null>(null);
  // Bumped after an import/sync so the summaries refetch without reloading the report.
  const [summaryNonce, setSummaryNonce] = useState(0);

  const selectedAsp = selectedRegion && selectedRegion !== "ALL" ? selectedRegion : "";
  const selectedEntry = closedRegionBreakdown.find(
    (entry) => entry.aspCode === selectedAsp,
  );

  const regionAspCodes = useMemo(
    () => closedRegionBreakdown.map((entry) => entry.aspCode),
    [closedRegionBreakdown],
  );

  const sources = useClosedCallSources({
    summaryToken,
    dateLo,
    dateHi,
    rangeActive,
    selectedAsp,
    regionAspCodes,
    refreshNonce: summaryNonce,
  });

  const counts = useClosedCallCounts({
    closedRows,
    rowInPeriod,
    periodPreset,
    selectedAsp,
  });
  const { closedCountFor, oursOutcomeFor, periodRegionRows } = counts;

  // ------------------------------------------------------------------ the ledger

  // Search narrows the TABLE and nothing else. It used to feed the headline count and the
  // share percentage too, so typing a customer name quietly rewrote numbers that were
  // supposed to describe the whole period.
  const ledgerRows = useMemo(
    () => periodRegionRows.filter((row) => rowMatchesQuery(row, searchQuery)),
    [periodRegionRows, searchQuery],
  );

  const ledgerPageCount = Math.max(1, Math.ceil(ledgerRows.length / LEDGER_PAGE_SIZE));
  // Any filter change can shrink the list past the current page; clamp rather than showing
  // an empty table with rows that exist.
  const safeLedgerPage = Math.min(ledgerPage, ledgerPageCount - 1);
  const ledgerStart = safeLedgerPage * LEDGER_PAGE_SIZE;
  const visibleLedgerRows = useMemo(
    () => ledgerRows.slice(ledgerStart, ledgerStart + LEDGER_PAGE_SIZE),
    [ledgerRows, ledgerStart],
  );

  useEffect(() => {
    setLedgerPage(0);
  }, [selectedRegion, dateLo, dateHi, searchQuery]);

  const repeatWoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of sources.repeatVisits?.rows ?? []) {
      if (row.woId) ids.add(row.woId.trim().toUpperCase());
    }
    return ids;
  }, [sources.repeatVisits]);

  const rowByTicket = useMemo(() => {
    const map = new Map<string, ReportRow>();
    for (const row of closedRows) {
      const ticket = String(rowOutput(row)["Ticket ID"] ?? "")
        .trim()
        .toUpperCase();
      if (ticket && !map.has(ticket)) map.set(ticket, row);
    }
    return map;
  }, [closedRows]);

  const billCycleOptions = useMemo(
    () =>
      buildBillCycleOptions({
        rows: closedRows,
        months: sources.months,
        currentCycleKey: period.currentBillCycle.key,
      }),
    [closedRows, sources.months, period.currentBillCycle],
  );

  // ------------------------------------------------------------------ actions

  async function handleClosureFile(file: File | null) {
    if (!file || !closureImportToken) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const { importClosureDates } = await import("../../../lib/closureDateApiClient");
      const result = await importClosureDates(closureImportToken, file);
      // The file has one row per PART ORDER, so the work-order count is the number that
      // means anything to a human; the "no closure date" ones are Flex's cancellations,
      // which are stored, not skipped.
      setImportMessage(
        `Imported ${result.imported} work orders from ${result.totalRows} rows ` +
          `(${result.byStatus.closed} closed, ${result.byStatus.cancelled} cancelled` +
          `${
            result.withoutClosureDate > 0
              ? `, ${result.withoutClosureDate} with no closure date`
              : ""
          }).`,
      );
      setSummaryNonce((nonce) => nonce + 1);
      onClosureDatesImported?.();
    } catch (error) {
      setImportMessage(
        `Import failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleSyncRawData() {
    if (!closureImportToken) return;
    setRawSyncing(true);
    setRawSyncMessage(null);
    try {
      const { syncFlexRawData } = await import("../../../lib/flexRawApiClient");
      const result = await syncFlexRawData(closureImportToken);
      setRawSyncMessage(
        `Synced ${formatNumber(result.imported)} rows — ${formatNumber(
          result.closed,
        )} closed.`,
      );
      setSummaryNonce((nonce) => nonce + 1);
    } catch (error) {
      setRawSyncMessage(
        `Sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setRawSyncing(false);
    }
  }

  /** Exports every filtered record, not just the visible page. */
  function handleExport() {
    if (ledgerRows.length === 0) return;
    const sheet = XLSX.utils.json_to_sheet(ledgerRows.map((row) => row.output));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Closed Calls");
    XLSX.writeFile(
      book,
      `Closed_Calls_Ledger_${selectedAsp || "ALL"}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`,
    );
  }

  function openCase(row: ReportRow) {
    if (onOpenCaseDetail) {
      onOpenCaseDetail(row);
      return;
    }
    const ticketId = String(rowOutput(row)["Ticket ID"] ?? "").trim();
    openRecordsWithFilter({ ticketIds: [ticketId], closedOnly: true });
  }

  function onPreset(preset: ClosedCallsPeriodPreset) {
    setCustomOpen(preset === "custom");
    period.applyPreset(preset);
  }

  // ------------------------------------------------------------------- render

  const freshness = readClosureFreshness(sources.closureStatus);
  const scopeLabel = selectedEntry?.regionName ?? selectedAsp;
  const oursCount = closedCountFor(
    selectedAsp,
    selectedAsp ? selectedEntry?.closedCount ?? 0 : overallClosedCount,
  );

  const regionNameFor = useMemo(() => {
    const names = new Map(
      closedRegionBreakdown.map((entry) => [entry.aspCode, entry.regionName]),
    );
    return (aspCode: string) => names.get(aspCode) ?? aspCode ?? "(no region)";
  }, [closedRegionBreakdown]);

  const repeatVisits = sources.repeatVisits;
  const showRepeats = Boolean(repeatVisits && repeatVisits.unpaid > 0);
  const reconciliation = summaryToken ? (
    <ReconciliationPanel
      token={summaryToken}
      aspCode={selectedAsp}
      freshness={freshness}
      refreshNonce={summaryNonce}
    />
  ) : null;

  return (
    <div className="closedCalls">
      <ClosedCallsHeader
        freshness={freshness}
        canImport={Boolean(closureImportToken)}
        importing={importing}
        importMessage={importMessage}
        onImportFile={(file) => void handleClosureFile(file)}
        rawSyncing={rawSyncing}
        rawSyncMessage={rawSyncMessage}
        onSyncRaw={() => void handleSyncRawData()}
        exportDisabled={ledgerRows.length === 0}
        onExport={handleExport}
        onOpenRecords={() =>
          openRecordsWithFilter({ region: selectedRegion, closedOnly: true })
        }
      />

      <PeriodBar
        periodPreset={periodPreset}
        customOpen={customOpen}
        onPreset={onPreset}
        dateLo={dateLo}
        dateHi={dateHi}
        periodFrom={period.periodFrom}
        periodTo={period.periodTo}
        setPeriodFrom={period.setPeriodFrom}
        setPeriodTo={period.setPeriodTo}
        billCycle={period.billCycle}
        billCycleOptions={billCycleOptions}
        currentCycleKey={period.currentBillCycle.key}
        onSelectCycle={period.selectCycle}
        regions={closedRegionBreakdown}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
      />

      <SourceComparison
        ours={oursCount}
        oursSplit={oursOutcomeFor(selectedAsp, oursCount)}
        oursCoverage={oursCoverage(periodPreset)}
        fieldez={sources.fieldezOutcomeFor(selectedAsp)}
        fieldezCoverage={fieldezCoverage(periodPreset)}
        fieldezUnmatched={sources.fieldezUnmatched}
        fieldezUndated={sources.fieldezUndated}
        raw={sources.rawOutcomeFor(selectedAsp)}
        rawCoverage={rawCoverage({
          preset: periodPreset,
          dayPrecise: sources.rawDayPrecise,
          monthLo: sources.monthLo,
          monthHi: sources.monthHi,
        })}
        rawNoRegion={sources.rawNoRegion}
        regionLabel={scopeLabel}
        onDrill={setDrill}
      />

      <RegionCardGrid
        regions={closedRegionBreakdown}
        allTimeCount={overallClosedCount}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        closedCountFor={closedCountFor}
        oursOutcomeFor={oursOutcomeFor}
        fieldezOutcomeFor={sources.fieldezOutcomeFor}
        rawOutcomeFor={sources.rawOutcomeFor}
        rawMonthLevel={rangeActive && !sources.rawDayPrecise}
        onDrill={setDrill}
      />

      {/* Repeat visits are only shown when the period actually holds one: a panel reading
          "0 unpaid" every day trains people to stop looking, and the number that matters
          is the one that is not zero. */}
      {showRepeats && repeatVisits ? (
        <div className="ccTwo ccSec">
          <RepeatVisitsPanel
            summary={repeatVisits}
            regionName={regionNameFor}
            onOpenWo={(woId) => {
              const row = rowByTicket.get(woId.trim().toUpperCase());
              if (row) openCase(row);
            }}
          />
          {reconciliation}
        </div>
      ) : (
        <div className="ccSec">{reconciliation}</div>
      )}

      <LedgerTable
        rows={visibleLedgerRows}
        startIndex={ledgerStart}
        totalInPeriod={periodRegionRows.length}
        matchingCount={ledgerRows.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        page={safeLedgerPage}
        pageCount={ledgerPageCount}
        pageSize={LEDGER_PAGE_SIZE}
        setPage={setLedgerPage}
        preset={periodPreset}
        repeatWoIds={repeatWoIds}
        onOpenCase={openCase}
        onFeedback={feedbackToken ? (row) => setFeedbackRow(row) : null}
      />

      {drill?.kind === "ours" && (
        <OursDrill
          rows={counts.oursDrillRows(drill)}
          title={
            drill.outcome === "all"
              ? "Our closed count"
              : `Our closed count — ${drill.outcome}`
          }
          scope={`${drill.label || "All Regions"} · ${
            periodPreset === "all" ? "all dates" : `${dateLo || "…"} → ${dateHi || "…"}`
          }`}
          onOpenCase={openCase}
          onClose={() => setDrill(null)}
        />
      )}

      {drill && (drill.kind === "fieldez" || drill.kind === "raw") && summaryToken && (
        <RecordsDrill
          token={summaryToken}
          kind={drill.kind}
          outcome={drill.outcome}
          aspCode={drill.aspCode}
          regionLabel={drill.label || "All Regions"}
          closureFrom={dateLo}
          closureTo={dateHi}
          rawMonthFrom={sources.monthLo}
          rawMonthTo={sources.monthHi}
          rawDateFrom={sources.rawDayPrecise ? dateLo : ""}
          rawDateTo={sources.rawDayPrecise ? dateHi : ""}
          onClose={() => setDrill(null)}
        />
      )}

      {feedbackRow && feedbackToken && (
        <FeedbackModal
          row={feedbackRow}
          token={feedbackToken}
          onClose={() => setFeedbackRow(null)}
          onSaved={() => {
            setFeedbackRow(null);
            // Refresh the report so the Customer status column picks the save up.
            onClosureDatesImported?.();
          }}
        />
      )}
    </div>
  );
}
