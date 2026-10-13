// The KM Report's map: one engineer's day, drawn the way the live tracking
// board draws it. The same route line, the same stops and check-in markers and
// the same words in their popups, so a day opened from the report reads exactly
// as it does when opened on the board.
//
// Kept apart from LiveTrackingPanel, which builds these inline for the board,
// so the report can draw a day without touching the board.

import type { PunchMarker, StopMarker } from "../components/LiveTrackingMap";
import type { EngineerDay } from "./payrollTrackingApiClient";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface DayRouteLayers {
  pathPoints: [number, number][];
  /** Where the road-matched line stops and the phone's own fixes begin. */
  rawFromIndex: number | undefined;
  stops: StopMarker[];
  punches: PunchMarker[];
}

export function dayRouteLayers(day: EngineerDay | null): DayRouteLayers {
  // The road version when Payroll has one, the raw trail when it does not.
  const road = day?.road_path;
  const pathPoints =
    road && road.points.length > 1
      ? road.points.map(([lat, lon]) => [lat, lon] as [number, number])
      : (day?.points ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);

  let rawFromIndex: number | undefined;
  if (road && road.source === "partial" && road.raw > 0) {
    const index = road.points.length - road.raw;
    if (index > 0 && index < road.points.length) rawFromIndex = index;
  }

  // Only the punches whose position was captured: one with no fix has nowhere
  // to be drawn.
  const punches = (day?.punches ?? [])
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      kind: p.kind,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      label: `${p.kind === "in" ? "Checked in" : "Checked out"} ${clock(p.at)}${
        p.case_number ? ` · ${p.case_number}` : ""
      }`,
    }));

  const stops = (day?.stops ?? []).map((s) => ({
    latitude: s.latitude,
    longitude: s.longitude,
    minutes: s.minutes,
    label: `${clock(s.arrived_at)} · stopped ${duration(s.minutes)}${
      s.case_number ? ` · ${s.case_number}` : ""
    }`,
  }));

  return { pathPoints, rawFromIndex, stops, punches };
}
