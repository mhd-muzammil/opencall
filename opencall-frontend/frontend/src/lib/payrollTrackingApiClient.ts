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
  engineer_id: number;
  engineer_name: string;
  branch: string | null;
  state: "on_duty" | "checked_out" | "absent";
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
}

export interface EngineerDayEvent {
  at: string;
  type: string;
  label: string;
  minutes?: number;
  latitude?: number;
  longitude?: number;
  case_number?: string | null;
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

export async function getRoster(token: string, date?: string): Promise<RosterResult> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(url(`/api/v1/payroll-tracking/roster${qs}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<RosterResult>(response);
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
