import { describe, expect, it } from "vitest";
import {
  googleMapsDirectionsUrl,
  routeKmCellText,
  routeKmPointLabels,
  routeKmRowTotals,
  routeKmTotals,
} from "./routeKm";
import type { RouteKmCell, RouteKmPoint } from "./payrollTrackingApiClient";

/**
 * ROUTE KM's own arithmetic and words: what a day reads, what adds up, what each
 * place on the map is called, and the same places on Google.
 */

const ready = (km: number): RouteKmCell => ({ km, points: 3, status: "ready" });
const FAILED: RouteKmCell = { km: null, points: 4, status: "failed" };
const PENDING: RouteKmCell = { km: null, points: 0, status: "pending" };

describe("googleMapsDirectionsUrl", () => {
  it("is Google's directions page through the same places, in order", () => {
    expect(
      googleMapsDirectionsUrl([
        { latitude: 12.7409, longitude: 77.8253 },
        { latitude: 12.7512, longitude: 77.8101 },
        { latitude: 12.7411, longitude: 77.8249 },
      ]),
    ).toBe("https://www.google.com/maps/dir/12.7409,77.8253/12.7512,77.8101/12.7411,77.8249");
  });

  it("is nothing with fewer than two places", () => {
    expect(googleMapsDirectionsUrl([])).toBeNull();
    expect(googleMapsDirectionsUrl([{ latitude: 12.7409, longitude: 77.8253 }])).toBeNull();
  });

  it("Google takes ten places: a longer day keeps its first nine and its last", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ latitude: 12 + i / 100, longitude: 77 + i / 100 }));
    const stops = googleMapsDirectionsUrl(points)!.replace("https://www.google.com/maps/dir/", "").split("/");
    expect(stops).toHaveLength(10);
    expect(stops.slice(0, 9)).toEqual(points.slice(0, 9).map((p) => `${p.latitude},${p.longitude}`));
    expect(stops[9]).toBe("12.11,77.11");
  });

  it("ten places go as they are", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ latitude: 12 + i / 100, longitude: 77 + i / 100 }));
    expect(googleMapsDirectionsUrl(points)!.split("/").slice(-10)).toEqual(
      points.map((p) => `${p.latitude},${p.longitude}`),
    );
  });
});

describe("routeKmCellText", () => {
  it("a measured day is its km, as the RTPL table prints one", () => {
    expect(routeKmCellText(ready(12.74))).toBe("12.74");
    expect(routeKmCellText(ready(40.2))).toBe("40.2");
    expect(routeKmCellText(ready(0))).toBe("-");
  });

  it("fewer than two places is a dash, a day Ola could not route a long dash, one still waiting an ellipsis", () => {
    expect(routeKmCellText({ km: null, points: 1, status: "no_points" })).toBe("-");
    expect(routeKmCellText(FAILED)).toBe("—");
    expect(routeKmCellText(PENDING)).toBe("…");
    expect(routeKmCellText(undefined)).toBe("…");
  });
});

describe("routeKmRowTotals and routeKmTotals", () => {
  const days = ["2026-09-25", "2026-09-26", "2026-09-27"];
  const cellsById = new Map<number, Record<string, RouteKmCell>>([
    [7, { "2026-09-25": ready(12.74), "2026-09-26": ready(0.1), "2026-09-27": FAILED }],
    [8, { "2026-09-25": PENDING, "2026-09-26": ready(0.2), "2026-09-27": ready(0.004) }],
  ]);

  it("a row adds its measured days only, and counts a day the table shows a km for", () => {
    expect(routeKmRowTotals(cellsById.get(7), days)).toEqual({ days: 2, km: 12.84 });
    // 0.004 km prints as a dash, so it is not a day.
    expect(routeKmRowTotals(cellsById.get(8), days)).toEqual({ days: 1, km: 0.2 });
    expect(routeKmRowTotals(undefined, days)).toEqual({ days: 0, km: 0 });
  });

  it("each day's total and the period's: a failed day and one still waiting add nothing", () => {
    const totals = routeKmTotals([{ engineer_id: 7 }, { engineer_id: 8 }, { engineer_id: null }], days, cellsById);
    expect(totals.byDay).toEqual({ "2026-09-25": 12.74, "2026-09-26": 0.3, "2026-09-27": 0 });
    expect(totals.total).toBe(13.04);
  });
});

describe("routeKmPointLabels", () => {
  // Built from local clock times, so the test reads the same in any time zone.
  const at = (hour: number, minute: number) => new Date(2026, 8, 25, hour, minute).toISOString();
  const point = (kind: RouteKmPoint["kind"], time: string, case_number: string | null = null): RouteKmPoint => ({
    kind,
    at: time,
    latitude: 12.74,
    longitude: 77.82,
    case_number,
  });

  it("names each place, numbers the check-ins in order, with the time and the case", () => {
    const labelled = routeKmPointLabels([
      point("login", at(9, 5)),
      point("checkin", at(10, 12), "OC-004546"),
      point("checkin", at(11, 40)),
      point("logout", at(18, 2)),
    ]);
    expect(labelled.map((p) => p.badge)).toEqual(["L", "1", "2", "D"]);
    expect(labelled.map((p) => p.label)).toEqual([
      "Login · 09:05",
      "Check-in 1 · 10:12 · OC-004546",
      "Check-in 2 · 11:40",
      "Logout · 18:02",
    ]);
    // Each keeps its own place.
    expect(labelled[1]).toMatchObject({ kind: "checkin", latitude: 12.74, longitude: 77.82 });
  });

  it("a Login or Logout placed at the office says so", () => {
    const at = new Date(2026, 8, 25, 9, 5).toISOString();
    const labels = routeKmPointLabels([
      { kind: "login", at, latitude: 12.72, longitude: 77.82, case_number: null, office: true },
      { kind: "logout", at, latitude: 12.72, longitude: 77.82, case_number: null, office: true },
      { kind: "login", at, latitude: 12.73, longitude: 77.83, case_number: null, office: false },
    ]).map((p) => p.label);
    expect(labels).toEqual(["Login (office) · 09:05", "Logout (office) · 09:05", "Login · 09:05"]);
  });

  it("a time that cannot be read is left out, not printed as NaN", () => {
    expect(routeKmPointLabels([point("login", "")])[0]!.label).toBe("Login");
  });
});
