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

  // Locations the current report actually covers. For a region admin the report is
  // already scoped server-side to their region, so only that region appears here —
  // this keeps the dropdown from listing other regions with a hard-coded 0 count.
  const availableLocationValues = useMemo(() => {
    const present = new Set(
      activeRows.map((row) =>
        String(row.output["Work Location"] ?? "").trim().toUpperCase(),
      ),
    );
    return PIVOT_LOCATION_OPTIONS.filter((option) => present.has(option.value)).map(
      (option) => option.value,
    );
  }, [activeRows]);

  const pivotLocationOptions = useMemo(
    () =>
      PIVOT_LOCATION_OPTIONS.filter((option) =>
        availableLocationValues.includes(option.value),
      ).map((option) => ({
        ...option,
        count: pivotCaseRows.filter(
          (row) => String(row.output["Work Location"] ?? "").trim().toUpperCase() === option.value,
        ).length,
      })),
    [pivotCaseRows, availableLocationValues],
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
    availableLocationValues,
  };
}
