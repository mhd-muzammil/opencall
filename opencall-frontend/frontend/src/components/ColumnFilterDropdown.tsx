"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import {
  BLANKS_OPTION_LABEL,
  isBlankLikeFilterValue,
  selectWipAgingRangeValues,
  sortWipAgingFilterValues,
  type ColumnUniqueEntry,
  type WipAgingSortDirection,
} from "../lib/columnFilter";

export interface ColumnFilterDropdownProps {
  column: string;
  isOpen: boolean;
  uniqueValues: ColumnUniqueEntry[];
  selectedValues: Set<string> | undefined;
  isFiltered: boolean;
  wipAgingSort: WipAgingSortDirection | null;
  onToggleValue: (column: string, value: string) => void;
  onSelectAll: (column: string) => void;
  onClearAll: (column: string) => void;
  onApply: (column: string, values: Set<string>) => void;
  onWipAgingSortChange: (direction: WipAgingSortDirection) => void;
  onOpen: (column: string) => void;
  onClose: () => void;
}

export function ColumnFilterDropdown({
  column,
  isOpen,
  uniqueValues,
  selectedValues,
  isFiltered,
  wipAgingSort,
  onSelectAll,
  onApply,
  onWipAgingSortChange,
  onOpen,
  onClose,
}: ColumnFilterDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [draftSelectedValues, setDraftSelectedValues] = useState<Set<string>>(
    () => new Set(uniqueValues.map((entry) => entry.value)),
  );
  const [wipAgingValueSort, setWipAgingValueSort] =
    useState<WipAgingSortDirection>("lowToHigh");
  const isWipAgingColumn = column === "WIP aging";
  const allValues = useMemo(
    () => uniqueValues.map((entry) => entry.value),
    [uniqueValues],
  );
  // Display-only relabelling; the underlying filter value never changes.
  // - Blank-like values (empty cells, the stored "Manual Entry Required"
  //   placeholder) show as Excel-style "(Blanks)".
  // - Work Location is stored/filtered by ASP code but shown as region name.
  // Search matches the label as well as the value (see visibleEntries), so
  // typing "blank" finds a "(Blanks)" entry.
  const labelFor = useCallback(
    (value: string) => {
      if (isBlankLikeFilterValue(value)) return BLANKS_OPTION_LABEL;
      return column === "Work Location"
        ? ASP_CODE_REGION_MAP[value.trim()] ?? value
        : value;
    },
    [column],
  );

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setWipAgingValueSort(wipAgingSort ?? "lowToHigh");
      setDraftSelectedValues(new Set(selectedValues ?? allValues));
      selectAllPressed.current = false;
    }
  }, [allValues, isOpen, selectedValues, wipAgingSort]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const visibleEntries = useMemo(() => {
    const sortedValues = isWipAgingColumn
      ? sortWipAgingFilterValues(uniqueValues, wipAgingValueSort)
      : uniqueValues;

    if (!search.trim()) return sortedValues;
    const lowerSearch = search.toLowerCase();
    return sortedValues.filter(
      (entry) =>
        entry.value.toLowerCase().includes(lowerSearch) ||
        labelFor(entry.value).toLowerCase().includes(lowerSearch),
    );
  }, [isWipAgingColumn, uniqueValues, search, wipAgingValueSort, labelFor]);

  const toggleDraft = useCallback(
    (value: string) => {
      setDraftSelectedValues((current) => {
        const next = new Set(current);

        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }

        return next;
      });
    },
    [],
  );

  // Whether the user actually pressed Select All this time round. Since the
  // options are cascaded, "everything listed is ticked" no longer implies "no
  // filter" — another column's filter can narrow this list down to exactly what
  // is already selected, and collapsing on that silently deleted the filter.
  const selectAllPressed = useRef(false);

  const selectAllDraft = useCallback(() => {
    selectAllPressed.current = true;
    setDraftSelectedValues(new Set(allValues));
  }, [allValues]);

  const unselectAllDraft = useCallback(() => {
    setDraftSelectedValues(new Set());
  }, []);

  const selectWipRangeDraft = useCallback(
    (min: number, max: number) => {
      setDraftSelectedValues(selectWipAgingRangeValues(uniqueValues, min, max));
    },
    [uniqueValues],
  );

  const applyDraft = useCallback(() => {
    const coversEveryOption = draftSelectedValues.size === allValues.length;
    if (coversEveryOption && (selectedValues === undefined || selectAllPressed.current)) {
      onSelectAll(column);
    } else {
      onApply(column, new Set(draftSelectedValues));
    }

    onClose();
  }, [
    allValues.length,
    column,
    draftSelectedValues,
    onApply,
    onClose,
    onSelectAll,
    selectedValues,
  ]);

  const isAllSelected = draftSelectedValues.size === allValues.length;
  const totalUniqueCount = uniqueValues.length;

  return (
    <div className="colFilterWrap" ref={wrapperRef}>
      <button
        type="button"
        className={`colFilterBtn ${isFiltered ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            onClose();
          } else {
            onOpen(column);
          }
        }}
        title={`Filter ${column}`}
        aria-label={`Filter ${column}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z"
            fill="currentColor"
          />
        </svg>
        {isFiltered && <span className="colFilterDot" />}
      </button>

      {isOpen && (
        <div className="colFilterDropdown">
          <div className="colFilterSearch">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${column}...`}
              autoFocus
            />
          </div>

          {isWipAgingColumn && (
            <div className="wipFilterTools">
              <div className="wipFilterToolGroup" aria-label="WIP aging value order">
                <button
                  type="button"
                  className={`wipFilterTool ${wipAgingSort === "lowToHigh" ? "active" : ""}`}
                  onClick={() => {
                    setWipAgingValueSort("lowToHigh");
                    onWipAgingSortChange("lowToHigh");
                  }}
                >
                  Low to High
                </button>
                <button
                  type="button"
                  className={`wipFilterTool ${wipAgingSort === "highToLow" ? "active" : ""}`}
                  onClick={() => {
                    setWipAgingValueSort("highToLow");
                    onWipAgingSortChange("highToLow");
                  }}
                >
                  High to Low
                </button>
              </div>
              <div className="wipFilterToolGroup" aria-label="WIP aging ranges">
                <button
                  type="button"
                  className="wipFilterTool"
                  onClick={() => selectWipRangeDraft(0, 2)}
                >
                  0-2 aging
                </button>
                <button
                  type="button"
                  className="wipFilterTool"
                  onClick={() => selectWipRangeDraft(3, 5)}
                >
                  3-5 aging
                </button>
              </div>
            </div>
          )}

          <div className="colFilterList">
            <label className="colFilterItem colFilterItemAll">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={() => {
                  if (isAllSelected) {
                    unselectAllDraft();
                  } else {
                    selectAllDraft();
                  }
                }}
              />
              <span>(Select All)</span>
              <span className="colFilterCount">{totalUniqueCount}</span>
            </label>

            {visibleEntries.map((entry) => {
              const checked = draftSelectedValues.has(entry.value);
              return (
                <label className="colFilterItem" key={entry.value}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDraft(entry.value)}
                  />
                  <span className="colFilterValue">{labelFor(entry.value)}</span>
                  <span className="colFilterCount">{entry.count}</span>
                </label>
              );
            })}

            {visibleEntries.length === 0 && (
              <div className="colFilterEmpty">No matches</div>
            )}
          </div>

          <div className="colFilterActions">
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={selectAllDraft}
            >
              Select All
            </button>
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={unselectAllDraft}
            >
              Unselect All
            </button>
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
            <button
              type="button"
              className="colFilterActionBtn primary"
              onClick={applyDraft}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
