import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Admin-only "where did they log in from" data. Backed by IP-derived location over the
 * existing login audit events (see backend loginActivityService). SUPER_ADMIN only — the
 * observed user / special-access login never sees any of this.
 */

export interface LoginLocationInfo {
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
  lastLoginAt: string;
  ip: string | null;
  location: LoginLocationInfo | null;
}

export interface LoginLocationEntry {
  occurredAt: string;
  ip: string | null;
  userAgent: string | null;
  location: LoginLocationInfo | null;
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
