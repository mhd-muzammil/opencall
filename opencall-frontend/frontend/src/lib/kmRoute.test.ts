import { describe, expect, it } from "vitest";
import { dayRouteLayers } from "./kmRoute";
import type { EngineerDay } from "./payrollTrackingApiClient";

/**
 * What the KM Report's map draws for a clicked day: the board's own rules for
 * the route line, its stops and its check-ins.
 */

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function day(overrides: Partial<EngineerDay> = {}): EngineerDay {
  return {
    engineer_id: 7,
    engineer_name: "Arun",
    branch: "Chennai",
    date: "2026-09-25",
    total_km: 12.5,
    duty_minutes: 480,
    first_seen: null,
    last_seen: null,
    stop_count: 0,
    stops: [],
    events: [],
    points: [
      { latitude: 13.01, longitude: 80.21, timestamp: "2026-09-25T04:00:00Z", accuracy: 8, status: "moving" },
      { latitude: 13.02, longitude: 80.22, timestamp: "2026-09-25T04:01:00Z", accuracy: 8, status: "moving" },
    ],
    ...overrides,
  };
}

describe("dayRouteLayers", () => {
  it("draws nothing for no day", () => {
    expect(dayRouteLayers(null)).toEqual({ pathPoints: [], rawFromIndex: undefined, stops: [], punches: [] });
  });

  it("draws the road version when Payroll has one", () => {
    const layers = dayRouteLayers(
      day({
        road_path: {
          points: [
            [13.011, 80.211],
            [13.021, 80.221],
            [13.031, 80.231],
          ],
          snapped: 3,
          raw: 0,
          source: "ola",
        },
      }),
    );
    expect(layers.pathPoints).toEqual([
      [13.011, 80.211],
      [13.021, 80.221],
      [13.031, 80.231],
    ]);
    expect(layers.rawFromIndex).toBeUndefined();
  });

  it("falls back to the phone's own fixes when the road version has no line", () => {
    for (const road_path of [undefined, { points: [[13.5, 80.5]] as [number, number][], snapped: 1, raw: 0, source: "ola" as const }]) {
      const layers = dayRouteLayers(day(road_path ? { road_path } : {}));
      expect(layers.pathPoints).toEqual([
        [13.01, 80.21],
        [13.02, 80.22],
      ]);
    }
  });

  it("marks where a partly matched line turns into raw fixes, and only then", () => {
    const points: [number, number][] = [
      [13.0, 80.0],
      [13.1, 80.1],
      [13.2, 80.2],
      [13.3, 80.3],
    ];
    expect(dayRouteLayers(day({ road_path: { points, snapped: 3, raw: 1, source: "partial" } })).rawFromIndex).toBe(3);
    expect(dayRouteLayers(day({ road_path: { points, snapped: 4, raw: 0, source: "partial" } })).rawFromIndex).toBeUndefined();
    expect(dayRouteLayers(day({ road_path: { points, snapped: 0, raw: 4, source: "partial" } })).rawFromIndex).toBeUndefined();
    expect(dayRouteLayers(day({ road_path: { points, snapped: 0, raw: 4, source: "raw" } })).rawFromIndex).toBeUndefined();
  });

  it("labels the stops and check-ins the way the board does, and skips a punch with no position", () => {
    const layers = dayRouteLayers(
      day({
        stops: [
          {
            latitude: 13.02,
            longitude: 80.22,
            arrived_at: "2026-09-25T05:00:00Z",
            left_at: "2026-09-25T06:05:00Z",
            minutes: 65,
            fixes: 40,
            case_id: 3,
            case_number: "C-101",
          },
          {
            latitude: 13.03,
            longitude: 80.23,
            arrived_at: "2026-09-25T07:00:00Z",
            left_at: "2026-09-25T07:20:00Z",
            minutes: 20,
            fixes: 10,
            case_id: null,
            case_number: null,
          },
        ],
        punches: [
          {
            kind: "in",
            at: "2026-09-25T05:02:00Z",
            case_id: 3,
            case_number: "C-101",
            title: "Printer",
            latitude: 13.02,
            longitude: 80.22,
            accuracy: 10,
          },
          {
            kind: "out",
            at: "2026-09-25T06:00:00Z",
            case_id: 3,
            case_number: null,
            title: "Printer",
            latitude: 13.02,
            longitude: 80.22,
            accuracy: 10,
          },
          {
            kind: "out",
            at: "2026-09-25T09:00:00Z",
            case_id: 4,
            case_number: "C-102",
            title: "Scanner",
            latitude: null,
            longitude: null,
            accuracy: null,
          },
        ],
      }),
    );
    expect(layers.stops).toEqual([
      { latitude: 13.02, longitude: 80.22, minutes: 65, label: `${time("2026-09-25T05:00:00Z")} · stopped 1h 5m · C-101` },
      { latitude: 13.03, longitude: 80.23, minutes: 20, label: `${time("2026-09-25T07:00:00Z")} · stopped 20m` },
    ]);
    expect(layers.punches).toEqual([
      { kind: "in", latitude: 13.02, longitude: 80.22, label: `Checked in ${time("2026-09-25T05:02:00Z")} · C-101` },
      { kind: "out", latitude: 13.02, longitude: 80.22, label: `Checked out ${time("2026-09-25T06:00:00Z")}` },
    ]);
  });
});
