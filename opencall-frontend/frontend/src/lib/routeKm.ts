// The KM Report's ROUTE KM table and its map: the road distance through the
// places an engineer marked on a day -- their Login, each Check-in, their
// Logout, in time order -- as Ola Maps measures it. Kept out of the component
// so it can be tested on its own.

import { formatKm } from "./kmReport";
import type { EngineerKmDays, RouteKmCell, RouteKmPoint } from "./payrollTrackingApiClient";

const round2 = (km: number) => Math.round(km * 100) / 100;

// Google's directions page takes ten places at most, the start among them.
const GOOGLE_MAX_STOPS = 10;

/**
 * The same places on Google Maps, so the office can hold Ola's figure up
 * against Google's by hand. A longer day keeps its first nine and its last:
 * the route still starts and ends where the day did. Null when there are not
 * two places to go between.
 */
export function googleMapsDirectionsUrl(
  points: Pick<RouteKmPoint, "latitude" | "longitude">[],
): string | null {
  if (points.length < 2) return null;
  const stops =
    points.length > GOOGLE_MAX_STOPS ? [...points.slice(0, GOOGLE_MAX_STOPS - 1), ...points.slice(-1)] : points;
  return `https://www.google.com/maps/dir/${stops.map((p) => `${p.latitude},${p.longitude}`).join("/")}`;
}

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

/** "09:05", in the viewer's own time. */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export interface LabelledRouteKmPoint extends RouteKmPoint {
  /** On its marker: "L" for the Login, the check-in's number, "D" for the Logout. */
  badge: string;
  /** In its popup: "Check-in 2 · 11:40 · OC-004546". */
  label: string;
}

/**
 * What each place is called on the map. Check-ins are numbered in the order
 * they were made, so "3" on the map is the third call of the day.
 */
export function routeKmPointLabels(points: RouteKmPoint[]): LabelledRouteKmPoint[] {
  let checkins = 0;
  return points.map((point) => {
    const number = point.kind === "checkin" ? (checkins += 1) : 0;
    // "(office)": the phone gave no position for this tap, so it stands at the
    // engineer's office -- said outright, so nobody reads it as a GPS fix.
    const office = point.office ? " (office)" : "";
    const name =
      point.kind === "login" ? `Login${office}` : point.kind === "logout" ? `Logout${office}` : `Check-in ${number}`;
    return {
      ...point,
      badge: point.kind === "login" ? "L" : point.kind === "logout" ? "D" : String(number),
      label: [name, clock(point.at), point.case_number].filter(Boolean).join(" · "),
    };
  });
}
