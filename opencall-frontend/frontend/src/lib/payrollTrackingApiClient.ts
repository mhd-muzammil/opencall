import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Reads live engineer tracking from the OpenCall backend, which proxies it from
 * the Payroll app. Mirrors the monitoringApiClient pattern: pass the session
 * token; endpoints live under /api/v1/payroll-tracking.
 */

export interface LiveEngineer {
  engineer_id: number;
  engineer_name: string;
  branch: string | null;

  // The engineer declared duty in Payroll. Someone whose phone stopped
  // reporting stays on this list with stale=true — on duty, just not visible.
  on_duty: boolean;
  duty_started_at: string;
  duty_minutes: number;
  stale: boolean;
  last_seen_minutes: number | null;
  // Kilometres covered since this duty began.
  distance_km: number;

  // Null until the first GPS fix of the duty arrives.
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  status: string;
  timestamp: string | null;
  active_case_id: number | null;
  active_case_number: string | null;
}

export interface LiveEngineersResult {
  configured: boolean;
  engineers: LiveEngineer[];
}

/**
 * One row per engineer for a day, in whatever state they are. Unlike the live
 * list this keeps someone who has finished their shift, so their day can still
 * be opened.
 */
export interface RosterEngineer {
  // Payroll's employee id, and null when Payroll has no matching record — the
  // engineer is in OpenCall's register but cannot be resolved on the other side,
  // which is the same reason their cases get skipped.
  engineer_id: number | null;
  engineer_name: string;
  branch: string | null;
  // The Payroll record the name resolved to, when the two spellings differ.
  payroll_name: string | null;
  matched: boolean;
  state: "on_duty" | "checked_out" | "absent" | "unmatched";
  on_duty: boolean;
  duty_started_at: string | null;
  duty_ended_at: string | null;
  duty_minutes: number;
  auto_closed: boolean;
  distance_km: number;
  stale: boolean;
  last_seen_minutes: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: string;
  timestamp: string | null;
  active_case_id: number | null;
  active_case_number: string | null;
  // Optional because a Payroll that has not been redeployed sends none of
  // these three, and the board has to keep working against that one.
  // What the phone had left, on the last fix it managed to send. This is what
  // makes going dark answerable: 4% says the phone died, 80% says the signal
  // did. Null when the app is too old to report it, or there is no fix at all.
  battery_level?: number | null;
  is_charging?: boolean | null;
  // How long the newest fix waited on the phone before it could be sent. 0 is
  // live; a number means the phone was offline that long and has since posted
  // its backlog; null means we cannot tell.
  queued_minutes?: number | null;
  // The employee's role and department in Payroll. Optional: a Payroll not
  // yet redeployed sends neither.
  role?: string | null;
  department?: string | null;
  // Payroll staff who are not in our engineer register, shown on the live
  // tracking board beside the engineers (only when asked for: includeStaff).
  staff?: boolean;
}

export interface RosterResult {
  configured: boolean;
  engineers: RosterEngineer[];
}

/** One engineer's whole day: where they went, how far, and where they stood still. */
export interface EngineerDayStop {
  latitude: number;
  longitude: number;
  arrived_at: string;
  left_at: string;
  minutes: number;
  fixes: number;
  case_id: number | null;
  case_number: string | null;
  /** The WO number, which is what everyone outside Payroll calls the job. */
  case_ref?: string | null;
}

export interface EngineerDayEvent {
  at: string;
  type: string;
  label: string;
  minutes?: number;
  latitude?: number;
  longitude?: number;
  case_number?: string | null;
  case_ref?: string | null;
  /**
   * Where the case stands NOW, which is not the same as what this day shows: a
   * call closed on an earlier day records no event today and is still closed.
   */
  case_status?: string | null;
  /**
   * Where this happened, in words. Free for anything tied to a call -- the
   * customer's address is on the case -- and reverse-geocoded once, then
   * cached, for a stop away from a customer or a place the trail went dark.
   * Absent when it could not be resolved, which is not the same as empty.
   */
  address?: string | null;
}

/**
 * The day's trail with each fix moved onto the road it was taken on, so the
 * drawn line follows the street instead of cutting between fixes.
 *
 * `source` says how much of it is real: "ola" all of it, "partial" a snapped
 * body with the newest few fixes still raw (they are snapped in batches, so the
 * live end of today's trail waits its turn), "raw" none of it — Payroll has no
 * Ola key, or Ola was unreachable. Optional because an older Payroll does not
 * send it at all.
 */
export interface RoadPath {
  points: Array<[number, number]>;
  snapped: number;
  raw: number;
  source: "ola" | "partial" | "raw";
}

/**
 * A moment the engineer marked themselves, and where they were standing.
 *
 * Distinct from a stop, which is inferred from the trail standing still: a stop
 * is our guess, a punch is their word. Worth being able to see both on one map —
 * a punch with no stop under it is somebody who marked a call done from the road.
 *
 * latitude/longitude are null when the phone had no fix at that instant. The
 * punch is still real; it just cannot be drawn.
 */
export interface EngineerPunch {
  kind: "in" | "out";
  at: string;
  case_id: number;
  case_number: string | null;
  title: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface EngineerDay {
  engineer_id: number;
  engineer_name: string;
  branch: string | null;
  date: string;
  total_km: number;
  duty_minutes: number;
  first_seen: string | null;
  last_seen: string | null;
  stop_count: number;
  stops: EngineerDayStop[];
  events: EngineerDayEvent[];
  punches?: EngineerPunch[];
  road_path?: RoadPath;
  points: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy: number | null;
    status: string;
  }>;
}

export interface TrackPath {
  count: number;
  total_km: number;
  points: Array<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: string;
  }>;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getLiveEngineers(token: string): Promise<LiveEngineersResult> {
  const response = await fetch(url("/api/v1/payroll-tracking/live"), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<LiveEngineersResult>(response);
}

export async function getEngineerPath(
  token: string,
  engineerId: number,
  date?: string,
): Promise<TrackPath> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(url(`/api/v1/payroll-tracking/path/engineer/${engineerId}${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<TrackPath>(response);
}

/**
 * The roster for a day. `includeStaff` -- the live tracking board only -- adds
 * Payroll's other staff after our engineer register; without it the answer is
 * the register alone, as Engineer Productivity reads it.
 */
export async function getRoster(
  token: string,
  date?: string,
  options: { includeStaff?: boolean } = {},
): Promise<RosterResult> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (options.includeStaff) params.set("include", "staff");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(url(`/api/v1/payroll-tracking/roster${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RosterResult>(response);
}

/** One engineer's kilometres added up over a period. */
export interface RosterKmTotal {
  engineer_id: number | null;
  engineer_name: string;
  distance_km: number;
  /** Days in the period with any distance at all. */
  days_tracked: number;
}

export interface RosterKmResult {
  configured: boolean;
  engineers: RosterKmTotal[];
}

/**
 * Kilometres per engineer from `from` to `to` (YYYY-MM-DD, inclusive). Payroll
 * only records distance per day; the backend asks it day by day and sums.
 */
export async function getRosterKm(token: string, from: string, to: string): Promise<RosterKmResult> {
  const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url(`/api/v1/payroll-tracking/roster/km${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RosterKmResult>(response);
}

/** One engineer's kilometres over a period, day by day -- a KM Report row. */
export interface EngineerKmDays {
  engineer_id: number | null;
  /** The name in our register, as the live tracking board shows it. */
  engineer_name: string;
  /** Resolved in Payroll on at least one day of the period. */
  matched: boolean;
  branch: string | null;
  department: string | null;
  /** km per YYYY-MM-DD, for every day in `days`; 0 when nothing was travelled. */
  days: Record<string, number>;
  /** The period's total -- the figure /roster/km gives Engineer Productivity. */
  distance_km: number;
  days_tracked: number;
}

export interface RosterKmDaysResult {
  configured: boolean;
  /** Every day asked about, oldest first, stopping at today. */
  days: string[];
  engineers: EngineerKmDays[];
}

/**
 * Kilometres per engineer per day from `from` to `to` (YYYY-MM-DD, inclusive),
 * for the KM Report. The same day-by-day answers getRosterKm adds up, kept apart.
 */
export async function getRosterKmDays(
  token: string,
  from: string,
  to: string,
): Promise<RosterKmDaysResult> {
  const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url(`/api/v1/payroll-tracking/roster/km/days${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RosterKmDaysResult>(response);
}

export async function getEngineerDay(
  token: string,
  engineerId: number,
  date?: string,
): Promise<EngineerDay> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(url(`/api/v1/payroll-tracking/day/engineer/${engineerId}${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<EngineerDay>(response);
}

export async function getCasePath(token: string, caseId: number): Promise<TrackPath> {
  const response = await fetch(url(`/api/v1/payroll-tracking/path/case/${caseId}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<TrackPath>(response);
}

/**
 * ROUTE KM: the road distance through the places an engineer marked on a day --
 * their Login, each Check-in, their Logout, in time order -- as Ola Maps
 * measures it. Check-outs are not part of it.
 *
 * "ready" has a km (0 is an answer too); "no_points" had fewer than two places
 * to go between; "failed" is a day Ola could not route; "pending" is not
 * measured yet. Only "ready" carries a km.
 */
export type RouteKmStatus = "ready" | "no_points" | "failed" | "pending";

export interface RouteKmCell {
  km: number | null;
  /** How many places the route went through. */
  points: number;
  status: RouteKmStatus;
  /**
   * A Login or Logout in it was placed at the FSE's office for want of a GPS
   * fix. Optional so an answer from before Payroll sent it still reads.
   */
  office?: boolean;
  /**
   * Settled for good: a failed day that is will not be measured again.
   * Optional so an answer from before Payroll sent it still reads.
   */
  final?: boolean;
}

export interface RouteKmRange {
  /** False when Payroll has no Ola Maps key: then nothing is measured. */
  configured: boolean;
  /** Every day asked about, oldest first, stopping at today. */
  days: string[];
  engineers: Array<{ engineer_id: number; days: Record<string, RouteKmCell> }>;
  /** Cells not measured yet. */
  pending: number;
  /** How many Payroll measured while answering this question. */
  measured_now: number;
  /**
   * Today's measured days whose places may have moved since they were read
   * (a new check-in, the Logout): asked about again until it is 0.
   */
  rechecking?: number;
}

/** One place on a ROUTE KM day: where the engineer was when they marked it. */
export interface RouteKmPoint {
  kind: "login" | "checkin" | "logout";
  at: string;
  latitude: number;
  longitude: number;
  case_number: string | null;
  /**
   * A Login or Logout the phone gave no position for, placed at the engineer's
   * office. Optional so an answer from before Payroll sent it still reads.
   */
  office?: boolean;
}

export interface RouteKmDay {
  configured: boolean;
  engineer_id: number;
  date: string;
  status: RouteKmStatus;
  km: number | null;
  /** In time order. */
  points: RouteKmPoint[];
  /** Ola's road route through the points; empty unless ready. */
  path: Array<[number, number]>;
  /** Why, in a few words, when the day failed; otherwise "". */
  error: string;
  /** Settled for good: a failed day that is will not be measured again. */
  final?: boolean;
}

/**
 * Road km per engineer per day from `from` to `to` (YYYY-MM-DD, inclusive), for
 * the KM Report's ROUTE KM table. Ola's free tier allows only a few routes a
 * minute, so Payroll measures a few per question and says how many are still
 * pending: the caller asks again until none are.
 */
export async function getRouteKm(
  token: string,
  from: string,
  to: string,
  engineerIds: number[],
): Promise<RouteKmRange> {
  const response = await fetch(url("/api/v1/payroll-tracking/route-km"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ from, to, engineer_ids: engineerIds }),
    cache: "no-store",
  });
  return readJson<RouteKmRange>(response);
}

/** One engineer's ROUTE KM day: the places, in order, and Ola's road through them. */
export async function getRouteKmDay(token: string, engineerId: number, date: string): Promise<RouteKmDay> {
  const qs = `?date=${encodeURIComponent(date)}`;
  const response = await fetch(url(`/api/v1/payroll-tracking/route-km/day/engineer/${engineerId}${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RouteKmDay>(response);
}
