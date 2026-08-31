"use client";

import { Fragment, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Bring the picked engineer's day into view.
 *
 * The route was drawn wherever it fell, which on a state-sized map is usually
 * off-screen: you clicked someone and nothing appeared to happen. Fits to the
 * whole day when there is one, otherwise to where they are standing now.
 *
 * Only when the SELECTION changes — refitting on every 30s refresh would drag
 * the map out from under someone who had panned to look at something.
 */
function FitToSelection({
  selectedId,
  pathPoints,
  focus,
}: {
  selectedId: number | null;
  pathPoints: [number, number][];
  focus: [number, number] | null;
}) {
  const map = useMap();
  const fitted = useRef<number | null>(null);

  useEffect(() => {
    if (selectedId == null) {
      fitted.current = null;
      return;
    }
    if (fitted.current === selectedId) return;

    if (pathPoints.length > 1) {
      map.fitBounds(pathPoints, { padding: [40, 40], maxZoom: 16 });
      fitted.current = selectedId;
    } else if (focus) {
      map.setView(focus, 15);
      fitted.current = selectedId;
    }
    // No day and no position: leave the map alone rather than jumping to a
    // default that means nothing.
  }, [map, selectedId, pathPoints, focus]);

  return null;
}

/**
 * Keep Leaflet's idea of its own size honest.
 *
 * Leaflet measures its container once, when the map is created. Since the board
 * put the map in a flex column beside the engineer rail, that measurement now
 * happens before the column has settled — so the map believed it was a sliver
 * tall, asked only for the tiles covering that, and rendered as blank blue-grey
 * panes that never filled in. Re-measuring whenever the container resizes is
 * what makes the tiles appear.
 */
function KeepMapSized() {
  const map = useMap();
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    const settle = () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      // After the browser has laid the flex row out, not in the middle of it.
      frame.current = requestAnimationFrame(() => map.invalidateSize());
    };
    settle();
    const observer = new ResizeObserver(settle);
    observer.observe(container);
    window.addEventListener("resize", settle);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      observer.disconnect();
      window.removeEventListener("resize", settle);
    };
  }, [map]);

  return null;
}
/**
 * Only what the map draws. Declared here rather than reusing LiveEngineer so the
 * component accepts a roster row too — both carry these fields, and the map has
 * no business requiring the ones it never reads.
 */
export interface MapEngineer {
  engineer_id: number;
  engineer_name: string;
  branch: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  stale: boolean;
  duty_minutes: number;
  distance_km: number;
  last_seen_minutes: number | null;
  status: string;
  timestamp: string | null;
  active_case_number: string | null;
}

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

/** A place the engineer stood still long enough for it to mean something. */
export interface StopMarker {
  latitude: number;
  longitude: number;
  minutes: number;
  label: string;
}

interface Props {
  engineers: MapEngineer[];
  selectedId: number | null;
  pathPoints: [number, number][];
  // Index at which the line stops being road-matched and becomes the phone's own
  // fixes. Absent when the whole route is one or the other.
  rawFromIndex?: number;
  stops?: StopMarker[];
  onSelect: (id: number) => void;
}

/** On duty with a known position. Someone who has not sent a fix yet is on the
 *  board but has nothing to plot, so the map skips them. */
type Plottable = MapEngineer & { latitude: number; longitude: number };

function hasPosition(e: MapEngineer): e is Plottable {
  return e.latitude != null && e.longitude != null;
}

/** One line of the map legend: a swatch and what it means. */
function LegendRow({
  color,
  label,
  ring,
  small,
  line,
}: {
  color: string;
  label: string;
  ring?: string;
  small?: boolean;
  line?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          display: "inline-block",
          width: line ? 14 : small ? 8 : 10,
          height: line ? 3 : small ? 8 : 10,
          borderRadius: line ? 2 : 999,
          background: color,
          border: ring ? `1px solid ${ring}` : line ? "none" : "1px solid #fff",
          boxShadow: line ? "none" : "0 0 0 1px rgba(0,0,0,0.12)",
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

export default function LiveTrackingMap({
  engineers,
  selectedId,
  pathPoints,
  rawFromIndex,
  stops = [],
  onSelect,
  // Given so the map can fill a flex column beside the engineer list. Defaults
  // to what it always was, for any caller that wants it on its own.
  height = "60vh",
}: Props & { height?: string }) {
  const plottable = engineers.filter(hasPosition);
  const first = plottable[0];
  const center: [number, number] = first ? [first.latitude, first.longitude] : DEFAULT_CENTER;
  // Where the picked engineer is right now, for the case where they have a
  // position but no route yet — just gone on duty, or standing where they
  // started.
  // Taken once: indexing the array gives `| undefined` under the strict index
  // checks, and the route only means anything when it has both ends anyway.
  const routeStart = pathPoints.length > 1 ? pathPoints[0] : undefined;
  const routeEnd = pathPoints.length > 1 ? pathPoints[pathPoints.length - 1] : undefined;
  const picked = plottable.find((e) => e.engineer_id === selectedId);
  const selectedPosition: [number, number] | null =
    picked && picked.latitude != null && picked.longitude != null
      ? [picked.latitude, picked.longitude]
      : null;

  return (
    <div
      style={{
        height,
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        position: "relative",
      }}
    >
      {/* What the dots mean. Four colours and a line were being left to the
          operator to work out, and a map that has to be decoded is a map that
          gets misread — an amber dot is a stale position, but it looks a lot
          like the amber circle that means somebody stood still for an hour.
          Sits bottom-left, clear of Leaflet's zoom control and attribution. */}
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 26,
          zIndex: 500,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 10.5,
          lineHeight: 1.6,
          color: "#374151",
          pointerEvents: "none",
        }}
      >
        <LegendRow color="#2563eb" label="Live position" />
        <LegendRow color="#d97706" label="No signal" />
        {stops.length > 0 && <LegendRow color="#f59e0b" label="Stopped here" ring="#b45309" />}
        {pathPoints.length > 1 && (
          <>
            <LegendRow color="#16a34a" label="Started the day" small />
            <LegendRow color="#dc2626" label="Latest fix" small />
            <LegendRow color="#2563eb" label="Route travelled" line />
            {rawFromIndex !== undefined && (
              <LegendRow color="#93c5fd" label="Newest, not yet on roads" line />
            )}
          </>
        )}
      </div>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <KeepMapSized />
        <FitToSelection selectedId={selectedId} pathPoints={pathPoints} focus={selectedPosition} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeStart && routeEnd && (
          <>
            {/* A casing under the line, so the route stays readable over a dark
                or busy patch of map. */}
            <Polyline
              positions={pathPoints}
              pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9 }}
            />
            {rawFromIndex === undefined ? (
              <Polyline
                positions={pathPoints}
                pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.95 }}
              />
            ) : (
              <>
                {/* Solid where the fixes have been put on roads. */}
                <Polyline
                  positions={pathPoints.slice(0, rawFromIndex)}
                  pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.95 }}
                />
                {/* Dashed for the newest stretch, which is still the phone's own
                    coordinates — they are snapped in batches and this one has
                    not filled yet. Overlaps by one point so the two halves join
                    instead of leaving a gap. */}
                <Polyline
                  positions={pathPoints.slice(rawFromIndex - 1)}
                  pathOptions={{
                    color: "#2563eb",
                    weight: 4,
                    opacity: 0.8,
                    dashArray: "6 5",
                  }}
                />
              </>
            )}

            {/* Which end is the morning. A bare line says where they went but
                not which way round, and that is half the question. */}
            <CircleMarker
              center={routeStart}
              radius={7}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }}
            >
              <Popup>Start of the day</Popup>
            </CircleMarker>
            <CircleMarker
              center={routeEnd}
              radius={7}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }}
            >
              <Popup>Latest position on this day</Popup>
            </CircleMarker>
          </>
        )}

        {/* Where they stood still. Drawn under the live markers and sized by how
            long they were there, so a long visit is obvious against a short one. */}
        {stops.map((stop, i) => (
          <CircleMarker
            key={`stop-${i}`}
            center={[stop.latitude, stop.longitude]}
            radius={Math.min(16, 7 + Math.round(stop.minutes / 10))}
            pathOptions={{
              color: "#b45309",
              weight: 2,
              fillColor: "#f59e0b",
              fillOpacity: 0.75,
            }}
          >
            <Popup>
              <div style={{ fontSize: 13 }}>{stop.label}</div>
            </Popup>
          </CircleMarker>
        ))}

        {plottable.map((e) => (
          <Fragment key={e.engineer_id}>
            {e.accuracy != null && (
              <Circle
                center={[e.latitude, e.longitude]}
                radius={e.accuracy}
                pathOptions={{ color: "#3b82f6", fillOpacity: 0.08, weight: 1 }}
              />
            )}
            {/* The selection ring, drawn under the marker so it reads as a halo
                rather than an outline. */}
            {e.engineer_id === selectedId && (
              <CircleMarker
                center={[e.latitude, e.longitude]}
                radius={15}
                pathOptions={{ color: "#1d4ed8", weight: 3, fillColor: "#3b82f6", fillOpacity: 0.2 }}
              />
            )}
            <CircleMarker
              center={[e.latitude, e.longitude]}
              radius={9}
              pathOptions={{
                color: "#fff",
                weight: 2,
                // Amber = still on duty, but this position is old and the
                // engineer may have moved since.
                //
                // The selected engineer used to be green, which is also the
                // colour of the route's start marker — and since a selected
                // engineer usually HAS a route, two different greens ended up on
                // one map meaning two different things. Selection is a ring now,
                // not a hue, so it reads on top of any of the three states.
                fillColor: e.stale ? "#d97706" : "#2563eb",
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
