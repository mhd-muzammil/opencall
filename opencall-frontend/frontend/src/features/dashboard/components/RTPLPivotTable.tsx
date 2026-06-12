// RTPL Status by WIP Aging pivot section extracted from app/page.tsx (Phase 6.11).
// JSX preserved verbatim; props passed explicitly (no pivot-calculation, filter-
// behavior, drill-down, state, or handler changes). The pivot handlers
// (openPivotSegmentFilter / toggleDraftPivotSegment / applyPivotSegmentFilter /
// openPivotLocationFilter / toggleDraftPivotLocation / applyPivotLocationFilter /
// openPivotRecords) are passed in unchanged. This section renders unconditionally.
import type { Dispatch, SetStateAction } from "react";
import { formatNumber } from "../utils";
import { RTPL_CASE_SCOPE_OPTIONS, PIVOT_LOCATION_OPTIONS } from "../constants";
import type { RtplWipPivot, RtplCaseScope } from "../types";

export function RTPLPivotTable({
  rtplWipPivot,
  draftPivotSegmentSet,
  draftPivotLocationSet,
  pivotAllSegmentCount,
  pivotLocationOptions,
  pivotAllLocationCount,
  pivotSegmentFilterActive,
  appliedPivotSegmentLabel,
  isPivotSegmentFilterOpen,
  setIsPivotSegmentFilterOpen,
  draftPivotSegments,
  setDraftPivotSegments,
  selectedPivotSegments,
  selectedPivotCaseScope,
  setSelectedPivotCaseScope,
  pivotLocationFilterActive,
  appliedPivotLocationLabel,
  isPivotLocationFilterOpen,
  setIsPivotLocationFilterOpen,
  draftPivotLocations,
  setDraftPivotLocations,
  selectedPivotLocations,
  openPivotSegmentFilter,
  toggleDraftPivotSegment,
  applyPivotSegmentFilter,
  openPivotLocationFilter,
  toggleDraftPivotLocation,
  applyPivotLocationFilter,
  openPivotRecords,
}: Readonly<{
  rtplWipPivot: RtplWipPivot;
  draftPivotSegmentSet: Set<string>;
  draftPivotLocationSet: Set<string>;
  pivotAllSegmentCount: number;
  pivotLocationOptions: Array<{ value: string; label: string; count: number }>;
  pivotAllLocationCount: number;
  pivotSegmentFilterActive: boolean;
  appliedPivotSegmentLabel: string | undefined;
  isPivotSegmentFilterOpen: boolean;
  setIsPivotSegmentFilterOpen: Dispatch<SetStateAction<boolean>>;
  draftPivotSegments: string[] | null;
  setDraftPivotSegments: Dispatch<SetStateAction<string[] | null>>;
  selectedPivotSegments: string[] | null;
  selectedPivotCaseScope: RtplCaseScope;
  setSelectedPivotCaseScope: Dispatch<SetStateAction<RtplCaseScope>>;
  pivotLocationFilterActive: boolean;
  appliedPivotLocationLabel: string | undefined;
  isPivotLocationFilterOpen: boolean;
  setIsPivotLocationFilterOpen: Dispatch<SetStateAction<boolean>>;
  draftPivotLocations: string[] | null;
  setDraftPivotLocations: Dispatch<SetStateAction<string[] | null>>;
  selectedPivotLocations: string[] | null;
  openPivotSegmentFilter: () => void;
  toggleDraftPivotSegment: (segment: string) => void;
  applyPivotSegmentFilter: () => void;
  openPivotLocationFilter: () => void;
  toggleDraftPivotLocation: (location: string) => void;
  applyPivotLocationFilter: () => void;
  openPivotRecords: (args: Readonly<{ rtplStatus?: string; wipAging?: string }>) => void;
}>) {
  return (
    <div className="pivotSection">
      <div className="sectionHeader pivotHeader">
        <div>
          <h3>RTPL Status by WIP Aging Pivot</h3>
          <p>
            Segment filter, WIP Aging columns, RTPL status rows, and Ticket ID count values.
          </p>
        </div>
        <span className="statusBadge neutral">
          {formatNumber(rtplWipPivot.grandTotal)} tickets
        </span>
      </div>

      <div className="pivotFilterRow">
      <div className="pivotDropdownFilter" aria-label="Pivot segment filter">
        <span>Segment</span>
        <div className="pivotDropdownWrap">
          <button
            type="button"
            className={`pivotDropdownTrigger ${pivotSegmentFilterActive ? "active" : ""}`}
            onClick={() => {
              if (isPivotSegmentFilterOpen) {
                setIsPivotSegmentFilterOpen(false);
              } else {
                openPivotSegmentFilter();
              }
            }}
          >
            <span>{appliedPivotSegmentLabel}</span>
            <strong>{formatNumber(rtplWipPivot.grandTotal)}</strong>
            <small>▾</small>
          </button>

          {isPivotSegmentFilterOpen ? (
            <div className="pivotSegmentDropdown">
              <div className="pivotSegmentList">
                <label className="pivotSegmentDropdownItem pivotSegmentDropdownItemAll">
                  <input
                    type="checkbox"
                    checked={draftPivotSegments === null}
                    onChange={() => setDraftPivotSegments(null)}
                  />
                  <span>(Select All)</span>
                  <strong>{formatNumber(pivotAllSegmentCount)}</strong>
                </label>

                {rtplWipPivot.segmentOptions.map((option) => (
                  <label className="pivotSegmentDropdownItem" key={option.value}>
                    <input
                      type="checkbox"
                      checked={draftPivotSegments === null || draftPivotSegmentSet.has(option.value)}
                      onChange={() => toggleDraftPivotSegment(option.value)}
                    />
                    <span>{option.label}</span>
                    <strong>{formatNumber(option.count)}</strong>
                  </label>
                ))}
              </div>

              <div className="pivotSegmentActions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDraftPivotSegments(null)}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDraftPivotSegments([])}
                >
                  Unselect All
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDraftPivotSegments(null)}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={applyPivotSegmentFilter}
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

        <div className="pivotCaseScopeFilter" aria-label="Pivot warranty trade filter">
          <span>Case Type</span>
          <div className="pivotCaseScopeGroup">
            {RTPL_CASE_SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`pivotCaseScopeButton ${selectedPivotCaseScope === option.value ? "active" : ""}`}
                onClick={() => setSelectedPivotCaseScope(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pivotDropdownFilter" aria-label="Pivot location filter">
          <span>Location</span>
          <div className="pivotDropdownWrap pivotLocationWrap">
            <button
              type="button"
              className={`pivotDropdownTrigger ${pivotLocationFilterActive ? "active" : ""}`}
              onClick={() => {
                if (isPivotLocationFilterOpen) {
                  setIsPivotLocationFilterOpen(false);
                } else {
                  openPivotLocationFilter();
                }
              }}
            >
              <span>{appliedPivotLocationLabel}</span>
              <strong>{formatNumber(rtplWipPivot.grandTotal)}</strong>
              <small>▾</small>
            </button>

            {isPivotLocationFilterOpen ? (
              <div className="pivotSegmentDropdown pivotLocationDropdown">
                <div className="pivotSegmentList pivotLocationList">
                  <label className="pivotSegmentDropdownItem pivotSegmentDropdownItemAll pivotLocationDropdownItem">
                    <input
                      type="checkbox"
                      checked={draftPivotLocations === null}
                      onChange={() => setDraftPivotLocations(null)}
                    />
                    <span>All locations</span>
                    <strong>{formatNumber(pivotAllLocationCount)}</strong>
                  </label>

                  {pivotLocationOptions.map((option) => (
                    <label className="pivotSegmentDropdownItem pivotLocationDropdownItem" key={option.value}>
                      <input
                        type="checkbox"
                        checked={draftPivotLocations === null || draftPivotLocationSet.has(option.value)}
                        onChange={() => toggleDraftPivotLocation(option.value)}
                      />
                      <span>{option.label}</span>
                      <strong>{formatNumber(option.count)}</strong>
                    </label>
                  ))}
                </div>

                <div className="pivotSegmentActions pivotLocationActions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setDraftPivotLocations(null)}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setDraftPivotLocations([])}
                  >
                    None
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setDraftPivotLocations(null)}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={applyPivotLocationFilter}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {rtplWipPivot.rows.length > 0 && rtplWipPivot.columns.length > 0 ? (
        <div className="pivotTableWrap">
          <table className="pivotTable">
            <thead>
              <tr className="pivotContextRow">
                <th scope="col">Filters</th>
                <th scope="col" colSpan={rtplWipPivot.columns.length + 1}>
                  Segment:{" "}
                  {selectedPivotSegments === null
                    ? "All Segments"
                    : selectedPivotSegments.length > 0
                      ? selectedPivotSegments.join(", ")
                      : "No Segments"}
                  {" | "}
                  Case Type:{" "}
                  {RTPL_CASE_SCOPE_OPTIONS.find((option) => option.value === selectedPivotCaseScope)?.label ?? "Overall"}
                  {" | "}
                  Location:{" "}
                  {selectedPivotLocations === null
                    ? "All Locations"
                    : selectedPivotLocations.length > 0
                      ? selectedPivotLocations
                          .map((location) => PIVOT_LOCATION_OPTIONS.find((option) => option.value === location)?.label ?? location)
                          .join(", ")
                      : "No Locations"}
                </th>
              </tr>
              <tr>
                <th scope="col" className="pivotRowHeader">
                  Count of Ticket ID
                </th>
                {rtplWipPivot.columns.map((column) => (
                  <th key={column.key} scope="col">
                    <button
                      type="button"
                      className="pivotHeaderButton"
                      onClick={() => openPivotRecords({ wipAging: column.label })}
                      title={`Open WIP aging ${column.label} records`}
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
                <th scope="col" className="pivotGrandColumn">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rtplWipPivot.rows.map((pivotRow) => (
                <tr key={pivotRow.key}>
                  <th scope="row" className="pivotRowLabel">
                    <button
                      type="button"
                      onClick={() => openPivotRecords({ rtplStatus: pivotRow.status })}
                      title={`Open ${pivotRow.status} records`}
                    >
                      {pivotRow.status}
                    </button>
                  </th>
                  {rtplWipPivot.columns.map((column) => {
                    const count = pivotRow.cells[column.key] ?? 0;

                    return (
                      <td key={`${pivotRow.key}-${column.key}`}>
                        {count > 0 ? (
                          <button
                            type="button"
                            className="pivotValueButton"
                            onClick={() =>
                              openPivotRecords({
                                rtplStatus: pivotRow.status,
                                wipAging: column.label,
                              })
                            }
                            title={`Open ${pivotRow.status}, WIP aging ${column.label}`}
                          >
                            {formatNumber(count)}
                          </button>
                        ) : (
                          <span className="pivotEmptyCell">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="pivotGrandColumn">
                    <button
                      type="button"
                      className="pivotTotalButton"
                      onClick={() => openPivotRecords({ rtplStatus: pivotRow.status })}
                    >
                      {formatNumber(pivotRow.total)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Grand Total</th>
                {rtplWipPivot.columns.map((column) => (
                  <td key={`total-${column.key}`}>
                    <button
                      type="button"
                      className="pivotTotalButton"
                      onClick={() => openPivotRecords({ wipAging: column.label })}
                    >
                      {formatNumber(column.total)}
                    </button>
                  </td>
                ))}
                <td className="pivotGrandColumn">
                  <button
                    type="button"
                    className="pivotTotalButton"
                    onClick={() => openPivotRecords({})}
                  >
                    {formatNumber(rtplWipPivot.grandTotal)}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rtplEmptyState">
          No pivot data for the selected Segment filter.
        </div>
      )}
    </div>
  );
}
