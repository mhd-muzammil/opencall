import { WEB_API_BASE_URL } from "./api/webApiClient";

/**
 * Sends the device's own position with every OpenCall API call, so the admin activity view
 * can show WHERE a status was changed — street-level from GPS / Wi-Fi, instead of the
 * ISP's hub city that IP geolocation gives.
 *
 *   X-Client-Location: <lat>,<lon>,<accuracyMetres>,<capturedAtEpochMs>
 *   X-Client-Location: denied        (user refused the browser prompt)
 *   X-Client-Location: unavailable   (no fix: unsupported, timed out, or not yet known)
 *
 * Non-blocking by design: a user who refuses location can still work; their actions are
 * recorded as "location not shared". The header is attached by wrapping `fetch` once,
 * scoped to the OpenCall API origin only, so every API client (dashboard, special access,
 * vendor access, uploads) is covered without each one opting in, and no third-party
 * request ever carries the position.
 */

export const CLIENT_LOCATION_HEADER = "X-Client-Location";

/** How long a mutating request waits for the very first fix after page load. */
const FIRST_FIX_WAIT_MS = 2000;

interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  at: number;
}

let latestFix: Fix | null = null;
let state: "idle" | "watching" | "denied" | "unavailable" = "idle";
let firstFixWaiters: Array<() => void> = [];

function notifyFirstFix(): void {
  const waiters = firstFixWaiters;
  firstFixWaiters = [];
  waiters.forEach((resolve) => resolve());
}

/** Starts watching the device position. Safe to call repeatedly; only the first call acts. */
export function startClientLocationWatch(): void {
  if (state !== "idle" || typeof window === "undefined") return;
  if (!("geolocation" in navigator) || !window.isSecureContext) {
    state = "unavailable";
    return;
  }
  state = "watching";
  navigator.geolocation.watchPosition(
    (position) => {
      latestFix = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        at: position.timestamp || Date.now(),
      };
      state = "watching";
      notifyFirstFix();
    },
    (error) => {
      // PERMISSION_DENIED is final until the user changes the site setting; other errors
      // (timeout, no signal) keep the watch alive and the last good fix, if any.
      if (error.code === error.PERMISSION_DENIED) state = "denied";
      else if (!latestFix) state = "unavailable";
      notifyFirstFix();
    },
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 },
  );
}

export function clientLocationHeaderValue(): string {
  if (state === "denied") return "denied";
  if (!latestFix) return "unavailable";
  const { lat, lon, accuracy, at } = latestFix;
  return `${lat.toFixed(6)},${lon.toFixed(6)},${Math.round(accuracy)},${Math.round(at)}`;
}

function waitForFirstFix(): Promise<void> {
  if (latestFix || state !== "watching") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FIRST_FIX_WAIT_MS);
    firstFixWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isApiRequest(input: RequestInfo | URL): boolean {
  const target =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return target.startsWith(`${WEB_API_BASE_URL}/`);
}

let fetchWrapped = false;

/** Wraps window.fetch once so OpenCall API calls carry the location header. */
export function installClientLocationHeader(): void {
  if (fetchWrapped || typeof window === "undefined") return;
  fetchWrapped = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiRequest(input)) return originalFetch(input, init);

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    // Status edits, uploads and logins happen right after a page load often enough that
    // waiting briefly for the first fix is worth it; reads never wait.
    if (method !== "GET" && method !== "HEAD") await waitForFirstFix();

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(CLIENT_LOCATION_HEADER, clientLocationHeaderValue());
    return originalFetch(input, { ...init, headers });
  };
}

/** Test hook: resets module state between tests. */
export function __resetClientLocationForTests(): void {
  latestFix = null;
  state = "idle";
  firstFixWaiters = [];
  fetchWrapped = false;
}
