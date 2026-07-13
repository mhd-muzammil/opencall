// Derived record row-set memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
import { useMemo } from "react";
import { isRecordsPageVisibleRow } from "../../../lib/reportDashboardAnalytics";
import type { GeneratedReportResponse } from "../../../lib/apiClient";
import type { PrintCaseFilter } from "../types";
import {
  isCissCase,
  isPcCase,
  isPrintCase,
  isPrintInstallationCase,
  isPrintFixCase,
  isRcaCase,
  isConsumerCase,
  isWarrantyCase,
  isTradeCase,
} from "../utils";

export function useRecordRowSets(params: {
  report: GeneratedReportResponse | null;
  showClosedOnly: boolean;
  showConsumerOnly: boolean;
  showCommercialOnly: boolean;
  showWarrantyOnly: boolean;
  showNonWarrantyOnly: boolean;
  showCissOnly: boolean;
  showRcaOnly: boolean;
  showTradeOnly: boolean;
  showPcOnly: boolean;
  printCaseFilter: PrintCaseFilter | null;
  selectedRegion: string | null;
  selectedWoOtcCode: string | null;
}) {
  const {
    report,
    showClosedOnly,
    showConsumerOnly,
    showCommercialOnly,
    showWarrantyOnly,
    showNonWarrantyOnly,
    showCissOnly,
    showRcaOnly,
    showTradeOnly,
    showPcOnly,
    printCaseFilter,
    selectedRegion,
    selectedWoOtcCode,
  } = params;

  // Everything the Records page lists, and the base for every category chip and count
  // on it. Includes calls that closed on a same-day re-upload: they stay listed until
  // the next day's first upload, so the table and its chips agree with each other. The
  // KPI tiles and the backend region breakdown still count them as closed.
  const activeRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter(isRecordsPageVisibleRow);
  }, [report]);

  const cissRows = useMemo(() => {
    return activeRows.filter(isCissCase);
  }, [activeRows]);

  const pcRows = useMemo(() => {
    if (!report) return [];
    return activeRows.filter(isPcCase);
  }, [activeRows, report]);

  const printInstallationRows = useMemo(() => {
    return activeRows.filter(isPrintInstallationCase);
  }, [activeRows]);

  const printFixRows = useMemo(() => {
    return activeRows.filter(isPrintFixCase);
  }, [activeRows]);

  const rcaRows = useMemo(() => {
    return activeRows.filter(isRcaCase);
  }, [activeRows]);

  const tradeRows = useMemo(() => {
    return activeRows.filter(isTradeCase);
  }, [activeRows]);

  const closedRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((row) => row.carryForward.closedSyntheticRow);
  }, [report]);

  const consumerRows = useMemo(() => {
    return activeRows.filter(isConsumerCase);
  }, [activeRows]);

  const commercialRows = useMemo(() => {
    return activeRows.filter((row) => !isConsumerCase(row));
  }, [activeRows]);

  const warrantyRows = useMemo(() => {
    return activeRows.filter(isWarrantyCase);
  }, [activeRows]);

  const nonWarrantyRows = useMemo(() => {
    return activeRows.filter(isTradeCase);
  }, [activeRows]);

  const tableBaseRows = useMemo(() => {
    if (!report) return [];
    if (showClosedOnly) return closedRows;

    // Customer / warranty / special-case scope (mutually exclusive).
    const scopeRows = showConsumerOnly
      ? consumerRows
      : showCommercialOnly
        ? commercialRows
        : showWarrantyOnly
          ? warrantyRows
          : showNonWarrantyOnly
            ? nonWarrantyRows
            : showCissOnly
              ? cissRows
              : showRcaOnly
                ? rcaRows
                : showTradeOnly
                  ? tradeRows
                  : activeRows;

    // The segment-product filter composes on top of the scope above so that
    // e.g. "warranty + PC" shows only warranty PC cases, and "trade + PC" shows
    // only trade PC cases. It uses the same isPcCase/isPrint* predicates the
    // card counts are built from, so the records shown match the displayed count.
    if (showPcOnly) return scopeRows.filter(isPcCase);
    if (printCaseFilter === "all") return scopeRows.filter(isPrintCase);
    if (printCaseFilter === "installation") return scopeRows.filter(isPrintInstallationCase);
    if (printCaseFilter === "fix") return scopeRows.filter(isPrintFixCase);
    return scopeRows;
  }, [
    activeRows,
    cissRows,
    closedRows,
    consumerRows,
    commercialRows,
    warrantyRows,
    nonWarrantyRows,
    printCaseFilter,
    rcaRows,
    showCissOnly,
    showClosedOnly,
    showConsumerOnly,
    showCommercialOnly,
    showWarrantyOnly,
    showNonWarrantyOnly,
    showPcOnly,
    showRcaOnly,
    showTradeOnly,
    tradeRows,
  ]);

  const regionFilteredRows = useMemo(() => {
    if (!report) return [];

    return tableBaseRows.filter((row) => {
      const rowRegion = String(row.output["Work Location"] ?? "").trim().toUpperCase();
      const targetRegion = String(selectedRegion ?? "").trim().toUpperCase();
      const matchRegion = selectedRegion === "ALL" || !selectedRegion || rowRegion === targetRegion;

      const rowCode = String(row.output["WO OTC CODE"] ?? "").trim().toUpperCase();
      const targetCode = String(selectedWoOtcCode ?? "").trim().toUpperCase();
      const matchCode = !selectedWoOtcCode || rowCode === targetCode;

      return matchRegion && matchCode;
    });
  }, [report, selectedRegion, selectedWoOtcCode, tableBaseRows]);

  return {
    activeRows,
    cissRows,
    pcRows,
    printInstallationRows,
    printFixRows,
    rcaRows,
    tradeRows,
    closedRows,
    consumerRows,
    commercialRows,
    warrantyRows,
    nonWarrantyRows,
    tableBaseRows,
    regionFilteredRows,
  };
}
