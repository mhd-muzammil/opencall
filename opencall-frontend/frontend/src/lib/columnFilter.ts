/**
 * Lightweight column-filter engine for the report table.
 *
 * Keeps filter state as a plain map of column → Set<selected values>.
 * All helpers are pure functions – React hook lives in `useColumnFilters`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";

/** Map of column names to the set of currently-selected (checked) values. */
export type ColumnFilterState = Record<string, Set<string>>;

/** A single column's unique values with their occurrence counts. */
export interface ColumnUniqueEntry {
  value: string;
  count: number;
}

export type WipAgingSortDirection = "lowToHigh" | "highToLow";

/** Columns that support per-column filtering. */
export const FILTERABLE_COLUMNS = DAILY_CALL_PLAN_COLUMNS;

export type FilterableColumn = (typeof FILTERABLE_COLUMNS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a cell value to a stable string for comparison / display. */
// Spelling-only aliases. Filtering is otherwise WYSIWYG \u2014 the dropdown lists
// exactly the values the cells display, like Excel's filter. "SSC Pending"
// used to be aliased to "PART PENDING" here, which made the dropdown claim
// "PART PENDING (21)" for rows visibly showing "SSC Pending" after the team
// split the two statuses (prod bug, 2026-07-20). Distinct statuses must stay
// distinct filter values; only same-word typos may be merged.
const FILTER_VALUE_ALIASES = new Map<string, string>([
  ["TO BE SCHEDULE", "TO BE SCHEDULED"],
]);

/**
 * Sentinel used for empty cells in dropdown option lists and filter sets.
 *
 * It MUST be a fixed point of `normalizeFilterValue`: selected values are
 * re-normalized when a filter is applied (`normalizeFilterState` below and
 * `useColumnFilters.setColumnFilter`), so a sentinel the normalizer rewrites
 * (e.g. uppercased to "(BLANK)") would never match the rows the dropdown
 * counted as blank.
 */
export const BLANK_FILTER_VALUE = "(blank)";
const BLANK_FILTER_VALUE_UPPER = BLANK_FILTER_VALUE.toUpperCase();

export function normalizeFilterValue(raw: unknown): string {
  const s = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (s === "") {
    return BLANK_FILTER_VALUE;
  }

  const normalized = s.toUpperCase();

  // Keep the blank sentinel round-trip stable: normalize("(blank)") must
  // return "(blank)", not "(BLANK)", or an applied blank filter would never
  // match blank rows.
  if (normalized === BLANK_FILTER_VALUE_UPPER) {
    return BLANK_FILTER_VALUE;
  }

  return FILTER_VALUE_ALIASES.get(normalized) ?? normalized;
}

function normalizeFilterState(filters: ColumnFilterState): ColumnFilterState {
  const normalizedFilters: ColumnFilterState = {};

  for (const [column, values] of Object.entries(filters)) {
    normalizedFilters[column] = new Set(Array.from(values, normalizeFilterValue));
  }

  return normalizedFilters;
}

/**
 * Extract unique values (+ counts) for a single column from the given rows.
 * Returns entries sorted alphabetically by value.
 */
export function extractUniqueValues<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[], column: string): ColumnUniqueEntry[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalised = normalizeFilterValue(row.output[column]);
    counts.set(normalised, (counts.get(normalised) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function parseWipAgingFilterValue(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortWipAgingFilterValues(
  entries: readonly ColumnUniqueEntry[],
  direction: WipAgingSortDirection,
): ColumnUniqueEntry[] {
  return [...entries].sort((a, b) => {
    const aValue = parseWipAgingFilterValue(a.value);
    const bValue = parseWipAgingFilterValue(b.value);

    if (aValue !== null && bValue !== null) {
      return direction === "lowToHigh" ? aValue - bValue : bValue - aValue;
    }

    if (aValue !== null) return -1;
    if (bValue !== null) return 1;

    return a.value.localeCompare(b.value);
  });
}

export function selectWipAgingRangeValues(
  entries: readonly ColumnUniqueEntry[],
  min: number,
  max: number,
): Set<string> {
  return new Set(
    entries
      .filter((entry) => {
        const value = parseWipAgingFilterValue(entry.value);
        return value !== null && value >= min && value <= max;
      })
      .map((entry) => entry.value),
  );
}

/**
 * Build a Map of every filterable column → unique entries for the given rows.
 * This is the value you memoize once per visible-row set.
 */
export function buildUniqueValuesMap<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[]): Map<string, ColumnUniqueEntry[]> {
  const map = new Map<string, ColumnUniqueEntry[]>();

  for (const col of FILTERABLE_COLUMNS) {
    map.set(col, extractUniqueValues(rows, col));
  }

  return map;
}

/**
 * Excel-style cascading (faceted) dropdown options.
 *
 * For each filterable column X, the option list contains the distinct values
 * (with occurrence counts) of X across the rows that pass:
 *   - the optional `rowPredicate` (e.g. the page's global search box), AND
 *   - every active column filter EXCEPT column X's own filter.
 *
 * Excluding X's own filter is what lets the user widen their selection within
 * X while other columns' filters are active — exactly how Excel's AutoFilter
 * behaves.
 *
 * UX guarantee: values currently selected in X's filter are ALWAYS present in
 * X's option list, even when the cascaded row set no longer contains them —
 * they appear with count 0 so the user can still see and unselect them.
 *
 * Entries are sorted alphabetically by value, matching `extractUniqueValues`.
 *
 * Performance: one pass over the rows. A row failing two or more active
 * filters contributes to no column's options; a row failing exactly one
 * active filter contributes only to that column's options (its own filter is
 * excluded there); a row failing none contributes to every column's options.
 */
export function buildCascadedUniqueValuesMap<
  T extends { output: Record<string, string | number> },
>(
  rows: readonly T[],
  filters: ColumnFilterState,
  options?: { rowPredicate?: (row: T) => boolean },
): Map<string, ColumnUniqueEntry[]> {
  const rowPredicate = options?.rowPredicate;
  const normalizedFilters = normalizeFilterState(filters);
  const activeColumns = FILTERABLE_COLUMNS.filter(
    (col) => normalizedFilters[col],
  );

  // Nothing to cascade → identical to the plain unique-values map.
  if (activeColumns.length === 0 && !rowPredicate) {
    return buildUniqueValuesMap(rows);
  }

  const countsByColumn = new Map<string, Map<string, number>>();
  for (const col of FILTERABLE_COLUMNS) {
    countsByColumn.set(col, new Map<string, number>());
  }

  for (const row of rows) {
    if (rowPredicate && !rowPredicate(row)) continue;

    // Which active column filters does this row fail?
    let failedColumn: string | null = null;
    let failedMoreThanOne = false;

    for (const col of activeColumns) {
      const selected = normalizedFilters[col]!;

      if (
        selected.size === 0 ||
        !selected.has(normalizeFilterValue(row.output[col]))
      ) {
        if (failedColumn !== null) {
          failedMoreThanOne = true;
          break;
        }
        failedColumn = col;
      }
    }

    // Hidden by at least two other columns' filters from every dropdown.
    if (failedMoreThanOne) continue;

    if (failedColumn !== null) {
      // Passes everything except `failedColumn`'s own filter → visible only
      // in `failedColumn`'s dropdown (whose own filter is excluded).
      const counts = countsByColumn.get(failedColumn)!;
      const value = normalizeFilterValue(row.output[failedColumn]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
      continue;
    }

    // Passes all active filters → visible in every column's dropdown.
    for (const col of FILTERABLE_COLUMNS) {
      const counts = countsByColumn.get(col)!;
      const value = normalizeFilterValue(row.output[col]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const map = new Map<string, ColumnUniqueEntry[]>();

  for (const col of FILTERABLE_COLUMNS) {
    const counts = countsByColumn.get(col)!;

    // Keep currently-selected values visible (count 0) even when the cascaded
    // row set no longer contains them, so the user can unselect them.
    const selected = normalizedFilters[col];
    if (selected) {
      for (const value of selected) {
        if (!counts.has(value)) counts.set(value, 0);
      }
    }

    map.set(
      col,
      Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    );
  }

  return map;
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

/**
 * Does a single row pass ALL active column filters?
 *
 * A column filter is considered "inactive" (no-op) when:
 *   - Its set is empty (user cleared everything – we treat that as "no filter")
 *   - Its set has the same size as the total unique values for that column
 *     (all selected → same as "no filter").  This check is optional/caller
 *     responsibility; here we only check emptiness.
 */
export function rowPassesFilters<
  T extends { output: Record<string, string | number> },
>(row: T, filters: ColumnFilterState): boolean {
  for (const column of FILTERABLE_COLUMNS) {
    const selected = filters[column];

    // No filter or empty set → column is unfiltered
    if (!selected) {
      continue;
    }

    if (selected.size === 0) {
      return false;
    }

    const normalised = normalizeFilterValue(row.output[column]);

    if (!selected.has(normalised)) {
      return false;
    }
  }

  return true;
}

/**
 * Apply column filters to an array of rows.
 * Returns a new array (never mutates input).
 */
export function applyColumnFilters<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[], filters: ColumnFilterState): T[] {
  // Quick exit when nothing is filtered
  const hasActiveFilter = FILTERABLE_COLUMNS.some((col) => {
    const s = filters[col];
    return Boolean(s);
  });

  if (!hasActiveFilter) {
    return rows as T[];
  }

  const normalizedFilters = normalizeFilterState(filters);

  return rows.filter((row) => rowPassesFilters(row, normalizedFilters));
}

/**
 * Returns the number of active column filters (columns that have a
 * non-empty selection set).
 */
export function activeFilterCount(filters: ColumnFilterState): number {
  let count = 0;

  for (const col of FILTERABLE_COLUMNS) {
    const s = filters[col];
    if (s) {
      count++;
    }
  }

  return count;
}

/**
 * Returns true when a specific column has an active filter.
 */
export function isColumnFiltered(
  filters: ColumnFilterState,
  column: string,
): boolean {
  const s = filters[column];
  return Boolean(s);
}
