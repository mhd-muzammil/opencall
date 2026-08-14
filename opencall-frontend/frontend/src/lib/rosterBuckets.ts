import type { RosterEngineer } from "./payrollTrackingApiClient";

/**
 * Which tab of the tracking board a roster row belongs to.
 *
 * "Not in Payroll" is its own bucket, not a flavour of off duty. Those engineers
 * are in OpenCall's register but Payroll cannot identify them at all, so their
 * cases are being skipped — the opposite of a quiet, uneventful off-duty day.
 * Folding them into a duty tab hid that, and made the duty tabs untrustworthy.
 */
export type RosterBucket = "all" | "on_duty" | "off" | "unmatched";

type RosterRow = Pick<RosterEngineer, "state">;

export function bucketOf(row: RosterRow): Exclude<RosterBucket, "all"> {
  if (row.state === "unmatched") return "unmatched";
  return row.state === "on_duty" ? "on_duty" : "off";
}

export function isInBucket(row: RosterRow, bucket: RosterBucket): boolean {
  return bucket === "all" || bucketOf(row) === bucket;
}

export interface BucketCounts {
  all: number;
  on_duty: number;
  off: number;
  unmatched: number;
}

export function countBuckets(rows: readonly RosterRow[]): BucketCounts {
  const counts: BucketCounts = { all: rows.length, on_duty: 0, off: 0, unmatched: 0 };
  for (const row of rows) counts[bucketOf(row)] += 1;
  return counts;
}

type SearchableRow = RosterRow &
  Pick<RosterEngineer, "engineer_name" | "branch" | "active_case_number">;

/** Bucket first, then the free-text search — an empty query matches everything. */
export function filterRoster<T extends SearchableRow>(
  rows: readonly T[],
  bucket: RosterBucket,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (!isInBucket(row, bucket)) return false;
    if (!q) return true;
    return (
      row.engineer_name.toLowerCase().includes(q) ||
      (row.branch ?? "").toLowerCase().includes(q) ||
      (row.active_case_number ?? "").toLowerCase().includes(q)
    );
  });
}
