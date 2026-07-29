// Derived export/visible-row memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim from that extraction.
// Since then this hook also wires the records search box into the column-filter
// dropdown cascade (setCascadePredicate below).
//
// useColumnFilters stays in page.tsx; its result (colFilters) is passed in, so this
// hook must be called after colFilters.
import { useEffect, useMemo } from "react";
import type { UseColumnFiltersResult } from "../../../lib/useColumnFilters";
import type { WipAgingSortDirection } from "../../../lib/columnFilter";
import type {
  MatchPreviewResponse,
  UploadResponse,
} from "../../../lib/apiClient";
import type { ReportRow } from "../types";
import {
  sortRowsByWipAging,
  rowMatchesRecordSearch,
  countManualRequiredCells,
  batchIdBySource,
  selectRecordSearchBaseRows,
} from "../utils";

export function useExportRows(params: {
  colFilters: UseColumnFiltersResult<ReportRow>;
  regionFilteredRows: ReportRow[];
  /**
   * Base rows used while a records search is active: all Records-page rows
   * matching the selected region only (no category/OTC scope), so a search can
   * surface cases outside the active card scope. When the search query is
   * empty, regionFilteredRows is used and behavior is unchanged.
   */
  searchScopeRows: ReportRow[];
  recordsSearchQuery: string;
  wipAgingSort: WipAgingSortDirection | null;
  closedRows: ReportRow[];
  selectedRegion: string | null;
  selectedWoOtcCode: string | null;
  preview: MatchPreviewResponse | null;
  selectedPreviewCategory: string | null;
  upload: UploadResponse | null;
}) {
  const {
    colFilters,
    regionFilteredRows,
    searchScopeRows,
    recordsSearchQuery,
    wipAgingSort,
    closedRows,
    selectedRegion,
    selectedWoOtcCode,
    preview,
    selectedPreviewCategory,
    upload,
  } = params;

  // Fold the global search box into the column-filter dropdown cascade so
  // each dropdown's options/counts reflect only rows matching the search
  // (Excel-style faceted filters). Uses the same predicate as filteredRows
  // below, so dropdown counts agree with the rows actually shown.
  const { setCascadePredicate } = colFilters;
  useEffect(() => {
    const query = recordsSearchQuery;
    setCascadePredicate(
      query.trim() === ""
        ? null
        : (row: ReportRow) => rowMatchesRecordSearch(row, query),
    );
  }, [recordsSearchQuery, setCascadePredicate]);

  // With no search this is exactly the old behavior (category/OTC/region-scoped
  // rows through the column filters). While a search is active the base widens
  // to searchScopeRows so matches outside the active category/OTC scope are
  // shown; column filters still apply. The search banner's "N of M" denominator
  // reads columnFilteredRows, so during a search it honestly counts the widened,
  // column-filtered search base rather than the narrower card scope.
  const columnFilteredRows = useMemo(
    () =>
      colFilters.filteredRows(
        selectRecordSearchBaseRows(recordsSearchQuery, regionFilteredRows, searchScopeRows),
      ),
    [colFilters, recordsSearchQuery, regionFilteredRows, searchScopeRows],
  );

  const filteredRows = useMemo(
    () =>
      sortRowsByWipAging(
        columnFilteredRows.filter((row) =>
          rowMatchesRecordSearch(row, recordsSearchQuery),
        ),
        wipAgingSort,
      ),
    [columnFilteredRows, recordsSearchQuery, wipAgingSort],
  );

  const scopedClosedRows = useMemo(
    () =>
      closedRows.filter((row) => {
        const rowRegion = String(row.output["Work Location"] ?? "").trim().toUpperCase();
        const targetRegion = String(selectedRegion ?? "").trim().toUpperCase();
        const matchRegion = selectedRegion === "ALL" || !selectedRegion || rowRegion === targetRegion;

        const rowCode = String(row.output["WO OTC CODE"] ?? "").trim().toUpperCase();
        const targetCode = String(selectedWoOtcCode ?? "").trim().toUpperCase();
        const matchCode = !selectedWoOtcCode || rowCode === targetCode;

        return matchRegion && matchCode;
      }),
    [closedRows, selectedRegion, selectedWoOtcCode],
  );

  const scopedManualCellCount = useMemo(
    () => countManualRequiredCells(filteredRows),
    [filteredRows],
  );

  const selectedRecords = useMemo(() => {
    if (!preview || !selectedPreviewCategory) return null;
    const { enrichedRows } = preview;
    switch (selectedPreviewCategory) {
      case "Renderways":
        return enrichedRows;
      case "Flex matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "CALLPLAN_MISSING",
        );
      case "Call Plan matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "FLEX_MISSING",
        );
      case "Flex missing":
        return enrichedRows.filter(
          (r) => r.match_status === "FLEX_MISSING" || r.match_status === "BOTH_MISSING",
        );
      case "Call Plan missing":
        return enrichedRows.filter(
          (r) => r.match_status === "CALLPLAN_MISSING" || r.match_status === "BOTH_MISSING",
        );
      default:
        return null;
    }
  }, [preview, selectedPreviewCategory]);

  const batchIds = useMemo(() => {
    const batches = upload?.batches ?? [];

    return {
      flexUploadBatchId: batchIdBySource(batches, "FLEX_WIP"),
      renderwaysUploadBatchId: batchIdBySource(batches, "RENDERWAYS"),
      callPlanUploadBatchId: batchIdBySource(batches, "CALL_PLAN"),
    };
  }, [upload]);

  return {
    columnFilteredRows,
    filteredRows,
    scopedClosedRows,
    scopedManualCellCount,
    selectedRecords,
    batchIds,
  };
}
