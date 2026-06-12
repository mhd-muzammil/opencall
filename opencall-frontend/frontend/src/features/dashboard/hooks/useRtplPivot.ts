// Derived RTPL/WIP pivot memos extracted from app/page.tsx (Phase 5).
// useMemo bodies and dependency arrays preserved verbatim — no behavior changes.
import { useMemo } from "react";
import { PIVOT_LOCATION_OPTIONS } from "../constants";
import type { ReportRow, RtplCaseScope } from "../types";
import { isWarrantyCase, isTradeCase, buildRtplWipAgingPivot } from "../utils";

export function useRtplPivot(params: {
  activeRows: ReportRow[];
  selectedPivotCaseScope: RtplCaseScope;
  selectedPivotLocations: string[] | null;
  selectedPivotSegments: string[] | null;
  draftPivotSegments: string[] | null;
  draftPivotLocations: string[] | null;
}) {
  const {
    activeRows,
    selectedPivotCaseScope,
    selectedPivotLocations,
    selectedPivotSegments,
    draftPivotSegments,
    draftPivotLocations,
  } = params;

  const pivotCaseRows = useMemo(() => {
    switch (selectedPivotCaseScope) {
      case "warranty":
        return activeRows.filter(isWarrantyCase);
      case "trade":
        return activeRows.filter(isTradeCase);
      case "overall":
      default:
        return activeRows;
    }
  }, [activeRows, selectedPivotCaseScope]);

  const pivotBaseRows = useMemo(() => {
    if (selectedPivotLocations === null) {
      return pivotCaseRows;
    }

    const selectedLocationSet = new Set(selectedPivotLocations);
    return pivotCaseRows.filter((row) =>
      selectedLocationSet.has(String(row.output["Work Location"] ?? "").trim().toUpperCase()),
    );
  }, [pivotCaseRows, selectedPivotLocations]);

  const rtplWipPivot = useMemo(
    () => buildRtplWipAgingPivot(pivotBaseRows, selectedPivotSegments),
    [pivotBaseRows, selectedPivotSegments],
  );

  const draftPivotSegmentSet = useMemo(
    () => new Set(draftPivotSegments ?? []),
    [draftPivotSegments],
  );

  const draftPivotLocationSet = useMemo(
    () => new Set(draftPivotLocations ?? []),
    [draftPivotLocations],
  );

  const pivotAllSegmentCount = useMemo(
    () =>
      rtplWipPivot.segmentOptions.reduce(
        (total, option) => total + option.count,
        0,
      ),
    [rtplWipPivot.segmentOptions],
  );

  const pivotLocationOptions = useMemo(
    () =>
      PIVOT_LOCATION_OPTIONS.map((option) => ({
        ...option,
        count: pivotCaseRows.filter(
          (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === option.value,
        ).length,
      })),
    [pivotCaseRows],
  );

  const pivotAllLocationCount = useMemo(
    () => pivotLocationOptions.reduce((total, option) => total + option.count, 0),
    [pivotLocationOptions],
  );

  return {
    pivotCaseRows,
    pivotBaseRows,
    rtplWipPivot,
    draftPivotSegmentSet,
    draftPivotLocationSet,
    pivotAllSegmentCount,
    pivotLocationOptions,
    pivotAllLocationCount,
  };
}
