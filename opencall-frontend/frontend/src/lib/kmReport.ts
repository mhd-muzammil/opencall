// The KM Report's arithmetic and grouping, kept out of the component so it can
// be tested on its own. Every figure here is Payroll's per-day distance, the one
// the live tracking board shows for an engineer on a day, added up -- never
// re-measured.

import type { EngineerKmDays } from "./payrollTrackingApiClient";

const round2 = (km: number) => Math.round(km * 100) / 100;

/**
 * A distance the way the board prints it: "42.37", "40.2", "12". A day with no
 * travel reads "-" rather than "0", so the eye finds the days that have some.
 */
export function formatKm(km: number | null | undefined): string {
  const value = round2(Number(km) || 0);
  return value === 0 ? "-" : String(value);
}

/** Region, folded so "CHENNAI" and "Chennai " are one box. */
export function regionKey(branch: string | null | undefined): string {
  return String(branch ?? "").trim().toLowerCase();
}

/** The branches in the order the office reads them; anything else after, A-Z. */
const REGION_ORDER = ["chennai", "vellore", "salem", "kanchipuram", "hosur"];

export interface KmRegion {
  key: string;
  /** The first spelling seen, for the box's label. */
  name: string;
  count: number;
}

/** One box per region present in the rows, with how many engineers it holds. */
export function kmRegions(rows: Pick<EngineerKmDays, "branch">[]): KmRegion[] {
  const regions = new Map<string, KmRegion>();
  for (const row of rows) {
    const key = regionKey(row.branch);
    if (!key) continue;
    const region = regions.get(key) ?? { key, name: String(row.branch).trim(), count: 0 };
    region.count += 1;
    regions.set(key, region);
  }
  const rank = (key: string) => {
    const at = REGION_ORDER.indexOf(key);
    return at === -1 ? REGION_ORDER.length : at;
  };
  return [...regions.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** The rows a region box and the search box let through. `region` "" is All. */
export function filterKmRows<T extends Pick<EngineerKmDays, "branch" | "engineer_name">>(
  rows: T[],
  region: string,
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!region || regionKey(row.branch) === region) &&
      (!needle || row.engineer_name.toLowerCase().includes(needle)),
  );
}

/** Each day's total over the rows shown, and the period's. */
export function kmTotals(
  rows: Pick<EngineerKmDays, "days" | "distance_km">[],
  days: string[],
): { byDay: Record<string, number>; total: number } {
  const byDay: Record<string, number> = {};
  for (const day of days) {
    byDay[day] = round2(rows.reduce((sum, row) => sum + (Number(row.days[day]) || 0), 0));
  }
  return { byDay, total: round2(rows.reduce((sum, row) => sum + (Number(row.distance_km) || 0), 0)) };
}

/** Each region its own colour, as in Payroll's Report View: a tint, filled when picked. */
const REGION_TONES: Record<string, { accent: string; tint: string }> = {
  all: { accent: "#7c3aed", tint: "#f5f3ff" },
  chennai: { accent: "#0284c7", tint: "#f0f9ff" },
  vellore: { accent: "#0d9488", tint: "#f0fdfa" },
  salem: { accent: "#ea580c", tint: "#fff7ed" },
  kanchipuram: { accent: "#c026d3", tint: "#fdf4ff" },
  hosur: { accent: "#4f46e5", tint: "#eef2ff" },
};

export function regionTone(key: string): { accent: string; tint: string } {
  return REGION_TONES[key || "all"] ?? { accent: "#4b5563", tint: "#f9fafb" };
}
