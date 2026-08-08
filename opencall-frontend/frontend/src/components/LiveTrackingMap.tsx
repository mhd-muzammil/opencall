"use client";

import { Fragment } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveEngineer } from "../lib/payrollTrackingApiClient";

// Free embedded map (Leaflet + OpenStreetMap, no API key / billing) for the
// live engineer tracking view. Must be dynamically imported with { ssr: false }
// because Leaflet touches `window`. Presentational only — the parent owns data,
// selection and refresh.

const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707]; // Chennai fallback

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  engineers: LiveEngineer[];
  selectedId: number | null;
  pathPoints: [number, number][];
  onSelect: (id: number) => void;
}

/** On duty with a known position. Someone who has not sent a fix yet is on the
 *  board but has nothing to plot, so the map skips them. */
type Plottable = LiveEngineer & { latitude: number; longitude: number };

function hasPosition(e: LiveEngineer): e is Plottable {
  return e.latitude != null && e.longitude != null;
}

export default function LiveTrackingMap({ engineers, selectedId, pathPoints, onSelect }: Props) {
  const plottable = engineers.filter(hasPosition);
  const first = plottable[0];
  const center: [number, number] = first ? [first.latitude, first.longitude] : DEFAULT_CENTER;

  return (
    <div style={{ height: "60vh", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {pathPoints.length > 1 && (
          <Polyline positions={pathPoints} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.7 }} />
        )}

        {plottable.map((e) => (
          <Fragment key={e.engineer_id}>
            {e.accuracy != null && (
              <Circle
                center={[e.latitude, e.longitude]}
                radius={e.accuracy}
                pathOptions={{ color: "#3b82f6", fillOpacity: 0.08, weight: 1 }}
              />
            )}
            <CircleMarker
              center={[e.latitude, e.longitude]}
              radius={9}
              pathOptions={{
                color: "#fff",
                weight: 2,
                // Amber = still on duty, but this position is old and the
                // engineer may have moved since. Green = the one being checked.
                fillColor:
                  e.engineer_id === selectedId ? "#16a34a" : e.stale ? "#d97706" : "#2563eb",
                fillOpacity: e.stale ? 0.65 : 1,
              }}
              eventHandlers={{ click: () => onSelect(e.engineer_id) }}
            >
              <Popup>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <strong>{e.engineer_name}</strong>
                  <br />
                  {e.branch ? (
                    <>
                      {e.branch}
                      <br />
                    </>
                  ) : null}
                  {e.active_case_number ? (
                    <>
                      Case: {e.active_case_number}
                      <br />
                    </>
                  ) : null}
                  {e.status ? (
                    <>
                      Status: {e.status}
                      <br />
                    </>
                  ) : null}
                  On duty {formatDuration(e.duty_minutes)} · {e.distance_km} km
                  <br />
                  <span style={{ color: e.stale ? "#b45309" : "#9ca3af" }}>
                    {e.stale
                      ? `No signal for ${e.last_seen_minutes ?? "?"}m — last seen here`
                      : e.timestamp
                        ? new Date(e.timestamp).toLocaleTimeString()
                        : ""}
                    {e.accuracy != null ? ` · ±${Math.round(e.accuracy)}m` : ""}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
