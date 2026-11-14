import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Admin-only "where did they log in from" data. Backed by IP-derived location over the
 * existing login audit events (see backend loginActivityService). SUPER_ADMIN only — the
 * observed user / special-access login never sees any of this.
 */

/** "gps" = the device's own fix (street-level); "ip" = IP geolocation (city-level guess). */
export type LocationSource = "gps" | "ip";
/** What the browser said about its position for that action. null = old client / not sent. */
export type GpsStatus = "ok" | "denied" | "unavailable" | null;

export interface LoginLocationInfo {
  /** Absent on responses from a backend older than the GPS change — treat as "ip". */
  source?: LocationSource;
  /** GPS only: accuracy radius in metres. */
  accuracyM?: number | null;
  /** GPS only: when the device took the fix. */
  capturedAt?: string | null;
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  isp: string | null;
  lat: number | null;
  lon: number | null;
  isPrivate: boolean;
}

export interface LoginLocationSummaryItem {
  principalId: string;
  lastSeenAt: string;
  /** The kind of the most recent action (LOGIN_SUCCESS, REPORT_ROW_EDITED, …). */
  eventType: string;
  ip: string | null;
  location: LoginLocationInfo | null;
  gpsStatus?: GpsStatus;
  /** Case edits: the ticket, and the RTPL status move when the status changed. */
  ticketId?: string | null;
  statusChange?: { fromStatus: string | null; toStatus: string | null } | null;
}

export interface LoginLocationEntry {
  occurredAt: string;
  eventType: string;
  ip: string | null;
  userAgent: string | null;
  location: LoginLocationInfo | null;
  gpsStatus?: GpsStatus;
  /** Case edits: the ticket, and the RTPL status move when the status changed. */
  ticketId?: string | null;
  statusChange?: { fromStatus: string | null; toStatus: string | null } | null;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function getSummary(
  token: string,
  path: string,
): Promise<LoginLocationSummaryItem[]> {
  const response = await fetch(url(path), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<LoginLocationSummaryItem[]>(response);
}

async function getHistory(
  token: string,
  path: string,
): Promise<LoginLocationEntry[]> {
  const response = await fetch(url(path), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<LoginLocationEntry[]>(response);
}

export function fetchUserLoginSummary(token: string): Promise<LoginLocationSummaryItem[]> {
  return getSummary(token, "/api/v1/admin/login-activity/users");
}

export function fetchUserLoginHistory(
  token: string,
  userId: string,
): Promise<LoginLocationEntry[]> {
  return getHistory(token, `/api/v1/admin/login-activity/users/${userId}`);
}

export function fetchSpecialAccessLoginSummary(
  token: string,
): Promise<LoginLocationSummaryItem[]> {
  return getSummary(token, "/api/v1/admin/login-activity/special-access");
}

export function fetchSpecialAccessLoginHistory(
  token: string,
  id: string,
): Promise<LoginLocationEntry[]> {
  return getHistory(token, `/api/v1/admin/login-activity/special-access/${id}`);
}
