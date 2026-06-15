// Derived export/visible-row memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
//
// useColumnFilters stays in page.tsx; its result (colFilters) is passed in, so this
// hook must be called after colFilters.
import { useMemo } from "react";
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
} from "../utils";

export function useExportRows(params: {
  colFilters: UseColumnFiltersResult<ReportRow>;
  regionFilteredRows: ReportRow[];
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
    recordsSearchQuery,
    wipAgingSort,
    closedRows,
    selectedRegion,
    selectedWoOtcCode,
    preview,
    selectedPreviewCategory,
    upload,
  } = params;

  const columnFilteredRows = useMemo(
    () => colFilters.filteredRows(regionFilteredRows),
    [colFilters, regionFilteredRows],
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
