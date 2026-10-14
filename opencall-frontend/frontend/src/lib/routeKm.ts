// The KM Report's ROUTE KM table and its map: the road distance through the
// places an engineer marked on a day -- their Login, each Check-in, their
// Logout, in time order -- as Ola Maps measures it. Kept out of the component
// so it can be tested on its own.

import { formatKm } from "./kmReport";
import type { EngineerKmDays, RouteKmCell, RouteKmPoint } from "./payrollTrackingApiClient";

const round2 = (km: number) => Math.round(km * 100) / 100;

// Google's directions page takes ten places at most, the start among them.
const GOOGLE_MAX_STOPS = 10;

type Place = Pick<RouteKmPoint, "latitude" | "longitude">;

const place = (p: Place) => `${p.latitude},${p.longitude}`;

/** A longer day keeps its first nine places and its last: the route still starts and ends where the day did. */
function googleStops(points: Place[]): Place[] {
  return points.length > GOOGLE_MAX_STOPS ? [...points.slice(0, GOOGLE_MAX_STOPS - 1), ...points.slice(-1)] : points;
}

/**
 * The same places on Google Maps, by bike -- Google's two-wheeler mode, how
 * the engineers ride -- so the office can hold Ola's figure up against
 * Google's by hand. Google's documented directions link (api=1). Null when
 * there are not two places to go between.
 */
export function googleMapsDirectionsUrl(points: Place[]): string | null {
  if (points.length < 2) return null;
  const stops = googleStops(points);
  const between = stops.slice(1, -1);
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${place(stops[0]!)}&destination=${place(stops[stops.length - 1]!)}` +
    (between.length ? `&waypoints=${between.map(place).join("%7C")}` : "") +
    "&travelmode=two-wheeler"
  );
}

/**
 * Google's own map of a day, for beside the table: its route through the
 * same places in the same order, with its km on the map. Embedded the way
 * Google lets anyone embed a map -- no key, no billing -- and, like the link,
 * through the first nine places and the last. By car, said outright
 * (dirflg=d): left to itself Google walks a short day. One place is a pin on
 * it; none, nothing to show.
 */
export function googleMapsEmbedUrl(points: Place[]): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) return `https://maps.google.com/maps?q=${place(points[0]!)}&z=15&output=embed`;
  const [start, ...rest] = googleStops(points);
  return `https://maps.google.com/maps?saddr=${place(start!)}&daddr=${rest.map(place).join("+to:")}&dirflg=d&output=embed`;
}

/** Google's map of the offices' part of Tamil Nadu, before a day is picked. */
export const GOOGLE_AREA_EMBED_URL = "https://maps.google.com/maps?ll=12.6,79.0&z=7&output=embed";

/**
 * A day as the table prints it: the km as the RTPL table prints one ("-" for
 * none), "-" for a day with fewer than two places marked, "—" for a day Ola
 * could not route, and "…" for one not measured yet.
 */
export function routeKmCellText(cell: RouteKmCell | undefined): string {
  switch (cell?.status) {
    case "ready":
      return formatKm(cell.km);
    case "no_points":
      return "-";
    case "failed":
      return "—";
    default:
      return "…";
  }
}

/** A day's km when Ola has measured it; a day still waiting, or failed, adds nothing. */
function readyKm(cell: RouteKmCell | undefined): number {
  return cell?.status === "ready" ? Number(cell.km) || 0 : 0;
}

/** One row over the days shown: how many have road km, and the km. */
export function routeKmRowTotals(
  cells: Record<string, RouteKmCell> | undefined,
  days: string[],
): { days: number; km: number } {
  let count = 0;
  let km = 0;
  for (const day of days) {
    const value = readyKm(cells?.[day]);
    // Counted as the table prints it: a day that rounds to a dash is not a day.
    if (round2(value) > 0) count += 1;
    km += value;
  }
  return { days: count, km: round2(km) };
}

/**
 * Each day's total over the rows shown, and the period's -- from measured days
 * only. While days are still pending the totals can only be short, never over.
 */
export function routeKmTotals(
  rows: Pick<EngineerKmDays, "engineer_id">[],
  days: string[],
  cellsById: ReadonlyMap<number, Record<string, RouteKmCell>>,
): { byDay: Record<string, number>; total: number } {
  const cellsOf = (row: Pick<EngineerKmDays, "engineer_id">) =>
    row.engineer_id != null ? cellsById.get(row.engineer_id) : undefined;
  const byDay: Record<string, number> = {};
  for (const day of days) {
    byDay[day] = round2(rows.reduce((sum, row) => sum + readyKm(cellsOf(row)?.[day]), 0));
  }
  return { byDay, total: round2(rows.reduce((sum, row) => sum + routeKmRowTotals(cellsOf(row), days).km, 0)) };
}
