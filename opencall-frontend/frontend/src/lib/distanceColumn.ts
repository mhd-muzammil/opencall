// Distance is the one report column that is not available everywhere.
//
// A distance is measured from the branch office to the call, so it can only be
// computed for a region whose office has coordinates. `region_offices` seeds
// Chennai (ASPS01461 - Maduravoyal) and nothing else, and matchingEngine's
// resolveOfficeDistance returns null when the office is missing — so for every
// other region the column would render as a full column of blanks.
//
// Rather than hardcode "Chennai", the rule is driven by the DATA: offer the
// column when the loaded report actually has distances in it. A Salem report has
// none, so Salem never sees the column; the day Salem's office coordinates are
// seeded, the column appears on its own with no code change and no release.
//
// Decided against keying on the filtered rows: columns appearing and vanishing
// while someone types in a filter is far more jarring than one stable decision
// per loaded report.

export const DISTANCE_COLUMN = "Distance";

/** Just enough of a report row for this decision. */
interface RowLike {
  output: Record<string, unknown>;
}

/**
 * Does this report carry any distance at all? One non-blank value is enough —
 * a region with office coordinates still leaves individual rows blank when a
 * pincode has no usable centroid.
 */
export function reportHasDistanceValues(
  rows: readonly RowLike[] | null | undefined,
): boolean {
  if (!rows) return false;
  return rows.some(
    (row) => String(row.output[DISTANCE_COLUMN] ?? "").trim() !== "",
  );
}

/**
 * Drop Distance from a column list when the report has no distances.
 *
 * Applied to BOTH the rendered columns and the Columns picker, and to a saved
 * user layout as well as the default order — otherwise someone who saved a
 * layout in Chennai would drag the column into a Salem report, where every cell
 * is empty.
 */
export function withDistanceAvailability<T extends string>(
  columns: readonly T[],
  hasDistance: boolean,
): T[] {
  return columns.filter(
    (column) => column !== DISTANCE_COLUMN || hasDistance,
  );
}
