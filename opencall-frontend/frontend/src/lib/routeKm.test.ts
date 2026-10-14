import { describe, expect, it } from "vitest";
import {
  GOOGLE_AREA_EMBED_URL,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  routeKmCellText,
  routeKmRowTotals,
  routeKmTotals,
} from "./routeKm";
import type { RouteKmCell } from "./payrollTrackingApiClient";

/**
 * ROUTE KM's own arithmetic and words: what a day reads, what adds up, and the
 * same places on Google -- its map beside the table and its directions page.
 */

const ready = (km: number): RouteKmCell => ({ km, points: 3, status: "ready" });
const FAILED: RouteKmCell = { km: null, points: 4, status: "failed" };
const PENDING: RouteKmCell = { km: null, points: 0, status: "pending" };

/** The places a directions link goes through, in order. */
function linkedPlaces(url: string): (string | null)[] {
  const q = new URL(url).searchParams;
  const between = q.get("waypoints");
  return [q.get("origin"), ...(between ? between.split("|") : []), q.get("destination")];
}

describe("googleMapsDirectionsUrl", () => {
  it("is Google's directions page through the same places, in order, by bike", () => {
    expect(
      googleMapsDirectionsUrl([
        { latitude: 12.7409, longitude: 77.8253 },
        { latitude: 12.7512, longitude: 77.8101 },
        { latitude: 12.7411, longitude: 77.8249 },
      ]),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=12.7409,77.8253&destination=12.7411,77.8249" +
        "&waypoints=12.7512,77.8101&travelmode=two-wheeler",
    );
  });

  it("two places need nothing between them", () => {
    expect(
      googleMapsDirectionsUrl([
        { latitude: 12.7409, longitude: 77.8253 },
        { latitude: 12.7411, longitude: 77.8249 },
      ]),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=12.7409,77.8253&destination=12.7411,77.8249&travelmode=two-wheeler",
    );
  });

  it("opens in Google's two-wheeler mode, how the engineers ride", () => {
    const url = googleMapsDirectionsUrl([
      { latitude: 12.7409, longitude: 77.8253 },
      { latitude: 12.7512, longitude: 77.8101 },
    ])!;
    expect(new URL(url).searchParams.get("travelmode")).toBe("two-wheeler");
  });

  it("is nothing with fewer than two places", () => {
    expect(googleMapsDirectionsUrl([])).toBeNull();
    expect(googleMapsDirectionsUrl([{ latitude: 12.7409, longitude: 77.8253 }])).toBeNull();
  });

  it("Google takes ten places: a longer day keeps its first nine and its last", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ latitude: 12 + i / 100, longitude: 77 + i / 100 }));
    const stops = linkedPlaces(googleMapsDirectionsUrl(points)!);
    expect(stops).toHaveLength(10);
    expect(stops.slice(0, 9)).toEqual(points.slice(0, 9).map((p) => `${p.latitude},${p.longitude}`));
    expect(stops[9]).toBe("12.11,77.11");
  });

  it("ten places go as they are", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ latitude: 12 + i / 100, longitude: 77 + i / 100 }));
    expect(linkedPlaces(googleMapsDirectionsUrl(points)!)).toEqual(points.map((p) => `${p.latitude},${p.longitude}`));
  });
});

describe("googleMapsEmbedUrl", () => {
  it("is Google's own embedded map of the route through the same places, in order, with no key", () => {
    const url = googleMapsEmbedUrl([
      { latitude: 12.7409, longitude: 77.8253 },
      { latitude: 12.7512, longitude: 77.8101 },
      { latitude: 12.7633, longitude: 77.7952 },
      { latitude: 12.7411, longitude: 77.8249 },
    ]);
    expect(url).toBe(
      "https://maps.google.com/maps?saddr=12.7409,77.8253&daddr=12.7512,77.8101+to:12.7633,77.7952+to:12.7411,77.8249&dirflg=d&output=embed",
    );
    expect(url).not.toContain("key=");
  });

  it("two places are a route from one to the other", () => {
    expect(
      googleMapsEmbedUrl([
        { latitude: 12.7409, longitude: 77.8253 },
        { latitude: 12.7411, longitude: 77.8249 },
      ]),
    ).toBe("https://maps.google.com/maps?saddr=12.7409,77.8253&daddr=12.7411,77.8249&dirflg=d&output=embed");
  });

  it("routes by car, as the note under the map says: left to itself Google walks a short day", () => {
    const params = new URL(
      googleMapsEmbedUrl([
        { latitude: 12.7409, longitude: 77.8253 },
        { latitude: 12.7432, longitude: 77.8271 },
      ])!,
    ).searchParams;
    expect(params.get("dirflg")).toBe("d");
  });

  it("one place is a pin on it; none is nothing to show", () => {
    expect(googleMapsEmbedUrl([{ latitude: 12.7409, longitude: 77.8253 }])).toBe(
      "https://maps.google.com/maps?q=12.7409,77.8253&z=15&output=embed",
    );
    expect(googleMapsEmbedUrl([])).toBeNull();
  });

  it("takes the same ten places as the directions link: the first nine and the last", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ latitude: 12 + i / 100, longitude: 77 + i / 100 }));
    const params = new URL(googleMapsEmbedUrl(points)!).searchParams;
    const linked = linkedPlaces(googleMapsDirectionsUrl(points)!);
    expect([params.get("saddr"), ...params.get("daddr")!.split(" to:")]).toEqual(linked);
  });

  it("the region's map before a day is picked is Google's too, with no key", () => {
    expect(GOOGLE_AREA_EMBED_URL).toBe("https://maps.google.com/maps?ll=12.6,79.0&z=7&output=embed");
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
