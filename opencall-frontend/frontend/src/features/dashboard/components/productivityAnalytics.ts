// Location-wise productivity analytics — the ratio view that sits BELOW the
// per-engineer table on the Engineer Productivity page.
//
// Mirrors the "LOCATION-WISE COMPARISON" block of the team's own spreadsheet:
// each region's Assigned/Attended/Closed with the two conversion ratios, ranked
// worst-converting last, plus an ALL LOCATIONS line.
//
// Pure and unit-tested: the page only renders what these functions return, so
// the arithmetic can be checked without a browser.
//
// The spreadsheet also carries "Target vs Attended %" and "Target vs Closed %".
// They are deliberately NOT here yet: the sheet gives each engineer their own
// daily target (7 or 8) while the app still has a single global one, so those
// two ratios would be wrong for every engineer on the higher target. They
// arrive with per-engineer targets.

/** One engineer's counts — the subset of the productivity list this needs. */
export interface ProductivityListItem {
  regionCode?: string;
  regionName?: string;
  assigned: number;
  attended: number;
  closed: number;
  /** Outcome buckets, for the mix chart. Optional: absent reads as zero. */
  partOrdered?: number;
  underObservation?: number;
  cxReschedule?: number;
  engineerDelay?: number;
}

export type PerformanceBand = "green" | "amber" | "orange" | "red";

/**
 * The spreadsheet's colour bands: Green at or above 90%, Amber at or above 70%,
 * Orange at or above 50%, Red below 50%.
 */
export function bandForPercent(percent: number | null): PerformanceBand | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  if (percent >= 90) return "green";
  if (percent >= 70) return "amber";
  if (percent >= 50) return "orange";
  return "red";
}

export const BAND_COLOR: Record<PerformanceBand, { bg: string; fg: string; bar: string }> = {
  green: { bg: "#dcfce7", fg: "#166534", bar: "#16a34a" },
  amber: { bg: "#fef9c3", fg: "#854d0e", bar: "#ca8a04" },
  orange: { bg: "#ffedd5", fg: "#9a3412", bar: "#ea580c" },
  red: { bg: "#fee2e2", fg: "#991b1b", bar: "#dc2626" },
};

export const BAND_LEGEND: ReadonlyArray<{ band: PerformanceBand; label: string }> = [
  { band: "green", label: "90% and above" },
  { band: "amber", label: "70% – 89%" },
  { band: "orange", label: "50% – 69%" },
  { band: "red", label: "Below 50%" },
];

/**
 * A percentage, or null when there is nothing to divide by.
 *
 * Null rather than 0 on purpose: a region with no assigned calls has no
 * conversion rate, and showing "0%" would rank it as the worst performer
 * instead of as absent. The page renders null as an em dash.
 */
export function ratioPercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface LocationComparisonRow {
  /** Region label; "ALL LOCATIONS" for the summary row. */
  regionName: string;
  engineers: number;
  assigned: number;
  attended: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  cxReschedule: number;
  engineerDelay: number;
  /**
   * Assigned calls in none of the five outcome buckets — attended work under a
   * status the table has no column for, plus calls still sitting booked.
   * Clamped at zero so a stacked bar can never exceed its own total.
   */
  otherOrPending: number;
  /** Of the calls booked to this region, how many were actually attended. */
  assignedVsAttendedPercent: number | null;
  /** Of the calls attended, how many were closed on the day. */
  attendedVsClosedPercent: number | null;
}

export interface LocationComparison {
  rows: LocationComparisonRow[];
  total: LocationComparisonRow;
}

const ALL_LOCATIONS_LABEL = "ALL LOCATIONS";

/** Assigned calls left over once the five outcome buckets are taken out. */
function remainderOf(row: {
  assigned: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  cxReschedule: number;
  engineerDelay: number;
}): number {
  const accounted =
    row.closed +
    row.partOrdered +
    row.underObservation +
    row.cxReschedule +
    row.engineerDelay;
  return Math.max(0, row.assigned - accounted);
}

function labelFor(item: ProductivityListItem): string {
  const name = String(item.regionName ?? "").trim();
  if (name) return name;
  const code = String(item.regionCode ?? "").trim();
  return code || "Unknown Region";
}

/**
 * Group the engineer list by region and rank it by attendance conversion,
 * strongest first — the same ordering the spreadsheet's chart uses.
 *
 * Regions with no assigned calls (null ratio) sort last whatever their raw
 * counts, since they have no rate to compare.
 */
export function buildLocationComparison(
  list: readonly ProductivityListItem[],
): LocationComparison {
  const byRegion = new Map<string, LocationComparisonRow>();

  for (const item of list) {
    const key = labelFor(item);
    const row = byRegion.get(key) ?? {
      regionName: key,
      engineers: 0,
      assigned: 0,
      attended: 0,
      closed: 0,
      partOrdered: 0,
      underObservation: 0,
      cxReschedule: 0,
      engineerDelay: 0,
      otherOrPending: 0,
      assignedVsAttendedPercent: null,
      attendedVsClosedPercent: null,
    };
    row.engineers += 1;
    row.assigned += item.assigned ?? 0;
    row.attended += item.attended ?? 0;
    row.closed += item.closed ?? 0;
    row.partOrdered += item.partOrdered ?? 0;
    row.underObservation += item.underObservation ?? 0;
    row.cxReschedule += item.cxReschedule ?? 0;
    row.engineerDelay += item.engineerDelay ?? 0;
    byRegion.set(key, row);
  }

  const rows = [...byRegion.values()].map((row) => ({
    ...row,
    otherOrPending: remainderOf(row),
    assignedVsAttendedPercent: ratioPercent(row.attended, row.assigned),
    attendedVsClosedPercent: ratioPercent(row.closed, row.attended),
  }));

  rows.sort((a, b) => {
    const left = a.assignedVsAttendedPercent;
    const right = b.assignedVsAttendedPercent;
    if (left === null && right === null) return a.regionName.localeCompare(b.regionName);
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left || a.regionName.localeCompare(b.regionName);
  });

  const totals = rows.reduce(
    (acc, row) => ({
      engineers: acc.engineers + row.engineers,
      assigned: acc.assigned + row.assigned,
      attended: acc.attended + row.attended,
      closed: acc.closed + row.closed,
      partOrdered: acc.partOrdered + row.partOrdered,
      underObservation: acc.underObservation + row.underObservation,
      cxReschedule: acc.cxReschedule + row.cxReschedule,
      engineerDelay: acc.engineerDelay + row.engineerDelay,
    }),
    {
      engineers: 0,
      assigned: 0,
      attended: 0,
      closed: 0,
      partOrdered: 0,
      underObservation: 0,
      cxReschedule: 0,
      engineerDelay: 0,
    },
  );

  return {
    rows,
    total: {
      regionName: ALL_LOCATIONS_LABEL,
      ...totals,
      otherOrPending: remainderOf(totals),
      // Computed from the pooled totals, NOT averaged across regions: a region
      // with two calls must not weigh the same as one with fifty.
      assignedVsAttendedPercent: ratioPercent(totals.attended, totals.assigned),
      attendedVsClosedPercent: ratioPercent(totals.closed, totals.attended),
    },
  };
}

/** "84.2%", or an em dash when there is no rate. */
export function formatPercent(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}
