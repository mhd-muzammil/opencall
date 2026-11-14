// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_API_BASE_URL } from "./api/webApiClient";
import {
  __resetClientLocationForTests,
  clientLocationHeaderValue,
  installClientLocationHeader,
  startClientLocationWatch,
} from "./clientLocation";

type Success = (p: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void;
type Failure = (e: { code: number; PERMISSION_DENIED: number }) => void;

let onSuccess: Success | null = null;
let onError: Failure | null = null;
let innerFetch: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetClientLocationForTests();
  onSuccess = null;
  onError = null;
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: (s: Success, e: Failure) => {
        onSuccess = s;
        onError = e;
        return 1;
      },
    },
  });
  innerFetch = vi.fn(async () => new Response("{}"));
  window.fetch = innerFetch as unknown as typeof fetch;
});

afterEach(() => {
  window.fetch = realFetch;
});

function sentHeader(callIndex = 0): string | null {
  const init = innerFetch.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get("X-Client-Location");
}

describe("client location header", () => {
  it("sends the latest fix as lat,lon,accuracy,timestamp", async () => {
    installClientLocationHeader();
    startClientLocationWatch();
    onSuccess!({ coords: { latitude: 13.0418123, longitude: 80.2341456, accuracy: 18.4 }, timestamp: 1_700_000_000_000 });

    await window.fetch(`${WEB_API_BASE_URL}/api/v1/report-rows/1`, {
      method: "PATCH",
      headers: { Authorization: "Bearer t" },
    });

    expect(sentHeader()).toBe("13.041812,80.234146,18,1700000000000");
    const headers = new Headers((innerFetch.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer t");
  });

  it("says denied when the user refuses, and never blocks the request", async () => {
    installClientLocationHeader();
    startClientLocationWatch();
    onError!({ code: 1, PERMISSION_DENIED: 1 });

    await window.fetch(`${WEB_API_BASE_URL}/api/v1/report-rows/1`, { method: "PATCH" });
    expect(sentHeader()).toBe("denied");
  });

  it("never adds the header to non-OpenCall requests", async () => {
    installClientLocationHeader();
    startClientLocationWatch();
    onSuccess!({ coords: { latitude: 13, longitude: 80, accuracy: 10 }, timestamp: 1 });

    await window.fetch("https://www.openstreetmap.org/x", { method: "POST" });
    expect(sentHeader()).toBeNull();
  });

  it("a save made before the first fix waits briefly for it", async () => {
    installClientLocationHeader();
    startClientLocationWatch();
    const pending = window.fetch(`${WEB_API_BASE_URL}/api/v1/report-rows/1`, { method: "PATCH" });
    onSuccess!({ coords: { latitude: 12.9, longitude: 79.1, accuracy: 30 }, timestamp: 5 });
    await pending;
    expect(sentHeader()).toBe("12.900000,79.100000,30,5");
  });

  it("reports unavailable when there is no fix", () => {
    expect(clientLocationHeaderValue()).toBe("unavailable");
  });
});
