"use client";

import { useCallback, useMemo, useState } from "react";
import {
  applyColumnFilters,
  buildCascadedUniqueValuesMap,
  activeFilterCount as countActiveFilters,
  isColumnFiltered as checkIsColumnFiltered,
  FILTERABLE_COLUMNS,
  normalizeFilterValue,
  type ColumnFilterState,
  type ColumnUniqueEntry,
} from "./columnFilter";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseColumnFiltersResult<T> {
  /** The raw filter state. */
  filters: ColumnFilterState;

  /** Which column's dropdown is currently open (null = none). */
  openColumn: string | null;

  /** Open a specific column's dropdown. */
  openFilterDropdown: (column: string) => void;

  /** Close whichever dropdown is open. */
  closeFilterDropdown: () => void;

  /** Toggle a single value within a column's filter. */
  toggleValue: (column: string, value: string) => void;

  /** Select all unique values for a column (effectively removing its filter). */
  selectAll: (column: string) => void;

  /** Clear all selections for a column. */
  clearAll: (column: string) => void;

  /** Replace a column's entire selection set. */
  setColumnFilter: (column: string, values: Set<string>) => void;

  /** Apply rows filtered through both upstream + column filters. */
  filteredRows: (rows: readonly T[]) => T[];

  /**
   * Memoized cascaded (Excel-style) unique-value map. Each column's option
   * list reflects the rows that pass every OTHER active column filter (and
   * the optional cascade predicate); currently-selected values that the
   * cascaded rows no longer contain stay listed with count 0.
   */
  uniqueValuesMap: Map<string, ColumnUniqueEntry[]>;

  /** Number of columns that currently have active filters. */
  activeFilterCount: number;

  /** Check whether a specific column has an active filter. */
  isColumnFiltered: (column: string) => boolean;

  /** Reset all column filters at once. */
  resetAll: () => void;

  /** Is the given column filterable? */
  isFilterable: (column: string) => boolean;

  /**
   * Register (or clear, with null) an extra row predicate folded into the
   * dropdown-option cascade — e.g. the records page's global search box, so
   * dropdown options and counts reflect only rows matching the search. Only
   * affects `uniqueValuesMap`; row filtering (`filteredRows`) is untouched.
   * Stable identity — safe to use as an effect dependency.
   */
  setCascadePredicate: (predicate: ((row: T) => boolean) | null) => void;
}

/**
 * React hook that manages column-filter state and exposes memoized helpers.
 *
 * @param baseRows - The rows BEFORE column filtering (i.e. already filtered
 *   by region tabs / WO OTC clicks / etc.).  Unique values are derived from
 *   this set so the dropdown only shows values visible in the current context.
 */
export function useColumnFilters<
  T extends { output: Record<string, string | number> },
>(baseRows: readonly T[]): UseColumnFiltersResult<T> {
  const [filters, setFilters] = useState<ColumnFilterState>({});
  const [openColumn, setOpenColumn] = useState<string | null>(null);

  // Optional extra row predicate folded into the dropdown-option cascade
  // (e.g. the records page's global search box — wired by useExportRows).
  // It only affects `uniqueValuesMap`, never `filteredRows`.
  const [cascadePredicate, setCascadePredicateState] = useState<
    ((row: T) => boolean) | null
  >(null);

  const setCascadePredicate = useCallback(
    (predicate: ((row: T) => boolean) | null) => {
      // Functional form so React stores the predicate itself rather than
      // treating it as a state updater.
      setCascadePredicateState(() => predicate);
    },
    [],
  );

  // ---- Memoized unique values ------------------------------------------
  // Excel-style cascade: each column's options come from the rows that pass
  // every OTHER active column filter (its own filter is excluded so the user
  // can widen their selection), plus the optional cascade predicate.
  const uniqueValuesMap = useMemo(
    () =>
      buildCascadedUniqueValuesMap(
        baseRows,
        filters,
        cascadePredicate ? { rowPredicate: cascadePredicate } : undefined,
      ),
    [baseRows, filters, cascadePredicate],
  );

  // ---- Memoized filtered rows -----------------------------------------
  const filteredRowsFn = useCallback(
    (rows: readonly T[]): T[] => applyColumnFilters(rows, filters),
    [filters],
  );

  // ---- Active filter count / checks -----------------------------------
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const isFiltered = useCallback(
    (column: string) => checkIsColumnFiltered(filters, column),
    [filters],
  );

  const isFilterable = useCallback(
    (column: string) =>
      (FILTERABLE_COLUMNS as readonly string[]).includes(column),
    [],
  );

  // ---- Mutation helpers -----------------------------------------------
  const openFilterDropdown = useCallback(
    (column: string) => setOpenColumn(column),
    [],
  );

  const closeFilterDropdown = useCallback(() => setOpenColumn(null), []);

  const toggleValue = useCallback(
    (column: string, value: string) => {
      setFilters((prev) => {
        const next = { ...prev };
        const existing = new Set(prev[column] ?? []);

        if (existing.has(value)) {
          existing.delete(value);
        } else {
          existing.add(value);
        }

        next[column] = existing;
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(
    (column: string) => {
      setFilters((prev) => {
        const next = { ...prev };
        // "Select all" = remove the filter entirely (show all)
        delete next[column];
        return next;
      });
    },
    [],
  );

  const clearAll = useCallback((column: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      next[column] = new Set<string>();
      return next;
    });
  }, []);

  const setColumnFilter = useCallback(
    (column: string, values: Set<string>) => {
      setFilters((prev) => {
        const next = { ...prev };
        next[column] = new Set(Array.from(values, normalizeFilterValue));
        return next;
      });
    },
    [],
  );

  const resetAll = useCallback(() => {
    setFilters({});
    setOpenColumn(null);
  }, []);

  return {
    filters,
    openColumn,
    openFilterDropdown,
    closeFilterDropdown,
    toggleValue,
    selectAll,
    clearAll,
    setColumnFilter,
    filteredRows: filteredRowsFn,
    uniqueValuesMap,
    activeFilterCount: activeCount,
    isColumnFiltered: isFiltered,
    resetAll,
    isFilterable,
    setCascadePredicate,
  };
}
