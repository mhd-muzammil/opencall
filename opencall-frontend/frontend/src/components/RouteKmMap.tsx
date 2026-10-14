"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteKmPoint } from "../lib/payrollTrackingApiClient";
import { routeKmPointLabels } from "../lib/routeKm";

/**
 * The KM Report's ROUTE KM map: one engineer's day as the places they marked
 * -- L for the Login, 1..n for the Check-ins in order, D for the Logout -- and
 * the road Ola Maps measured between them.
 *
 * A map of its own rather than the live tracking board's: that one draws a GPS
 * trail, its stops and live positions, and none of those are in this figure.
 * Must be dynamically imported with { ssr: false } because Leaflet touches
 * `window`. Presentational only -- the table owns the data and the selection.
 */

const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707]; // Chennai fallback

// The board's blue is its GPS trail. This line is another measurement, so it
// is drawn in a colour of its own.
const ROUTE_COLOUR = "#0f766e";

const BADGE_COLOURS: Record<RouteKmPoint["kind"], string> = {
  login: "#16a34a",
  checkin: "#7c3aed",
  logout: "#dc2626",
};

/**
 * A round badge with the place's letter or number on it. Hollow -- white with
 * the colour round it -- for a Login or Logout placed at the office because the
 * phone gave no position, so it does not pass for a GPS fix.
 *
 * `shift` is how many badges already stand on this exact spot: a day logged in
 * and out at the office has its L and D on one point, and the later badge is
 * moved aside by one width so both can be read.
 */
function badgeIcon(text: string, colour: string, office: boolean, shift: number) {
  const fill = office ? `background:#fff;color:${colour};border:2px solid ${colour}` : `background:${colour};color:#fff;border:2px solid #fff`;
  return divIcon({
    // No class: Leaflet's own one for a div icon paints a white square behind it.
    className: "",
    html: `<div style="width:24px;height:24px;box-sizing:border-box;border-radius:50%;${fill};box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui,sans-serif">${text}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12 - shift * 24, 12],
    popupAnchor: [shift * 24, -12],
  });
}

/**
 * Bring a clicked day into view: the whole road when there is one, otherwise
 * the places themselves. Once per selection, as the board's map does, so a map
 * someone has panned is not dragged back while they look at it.
 */
function FitToRoute({
  selectedKey,
  path,
  points,
}: {
  selectedKey: number | null;
  path: [number, number][];
  points: RouteKmPoint[];
}) {
  const map = useMap();
  const fitted = useRef<number | null>(null);

  useEffect(() => {
    if (selectedKey == null) {
      fitted.current = null;
      return;
    }
    if (fitted.current === selectedKey) return;

    const places =
      path.length > 1 ? path : points.map((p) => [p.latitude, p.longitude] as [number, number]);
    const only = places.length === 1 ? places[0] : undefined;
    if (places.length > 1) {
      map.fitBounds(places, { padding: [40, 40], maxZoom: 16 });
      fitted.current = selectedKey;
    } else if (only) {
      map.setView(only, 15);
      fitted.current = selectedKey;
    }
    // Nothing yet -- the day is still loading: wait for it rather than jump to
    // a default that means nothing.
  }, [map, selectedKey, path, points]);

  return null;
}

/**
 * Keep Leaflet's idea of its own size honest. It measures its container once,
 * when the map is created, and in a flex column that happens before the column
 * has settled: the map believes it is a sliver and leaves the rest blank.
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

/** One line of the legend: a swatch and what it means. */
function LegendRow({
  colour,
  label,
  badge,
  hollow = false,
}: {
  colour: string;
  label: string;
  badge?: string;
  hollow?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {badge ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            boxSizing: "border-box",
            borderRadius: 999,
            background: hollow ? "#fff" : colour,
            color: hollow ? colour : "#fff",
            border: hollow ? `1.5px solid ${colour}` : "none",
            fontSize: 8.5,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 3,
            borderRadius: 2,
            background: colour,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </div>
  );
}

interface Props {
  /** The day's places, in time order. */
  points: RouteKmPoint[];
  /** Ola's road through them; empty when there is none to draw. */
  path: [number, number][];
  /** Changes with every click, so each clicked day is brought into view. */
  selectedKey: number | null;
  height?: string;
}

export default function RouteKmMap({ points, path, selectedKey, height = "60vh" }: Props) {
  const places = useMemo(() => {
    // How many badges each exact spot has had so far, so a second one there is
    // drawn beside the first instead of on top of it.
    const onSpot = new Map<string, number>();
    return routeKmPointLabels(points).map((point) => {
      const spot = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
      const shift = onSpot.get(spot) ?? 0;
      onSpot.set(spot, shift + 1);
      return {
        ...point,
        icon: badgeIcon(point.badge, BADGE_COLOURS[point.kind], Boolean(point.office), shift),
      };
    });
  }, [points]);
  const anyAtOffice = points.some((point) => point.office);

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
      {/* What the badges and the line mean. Bottom-left, clear of Leaflet's
          zoom control and attribution. */}
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
        <LegendRow colour={BADGE_COLOURS.login} badge="L" label="Login" />
        <LegendRow colour={BADGE_COLOURS.checkin} badge="1" label="Check-in" />
        <LegendRow colour={BADGE_COLOURS.logout} badge="D" label="Logout" />
        {anyAtOffice && (
          <LegendRow colour={BADGE_COLOURS.login} badge="L" hollow label="At the office (no GPS then)" />
        )}
        <LegendRow colour={ROUTE_COLOUR} label="Road route (Ola)" />
      </div>
      <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <KeepMapSized />
        <FitToRoute selectedKey={selectedKey} path={path} points={points} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {path.length > 1 && (
          <>
            {/* A casing under the line, so the road stays readable over a dark
                or busy patch of map. */}
            <Polyline positions={path} pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9 }} />
            <Polyline positions={path} pathOptions={{ color: ROUTE_COLOUR, weight: 4, opacity: 0.95 }} />
          </>
        )}

        {places.map((place, i) => (
          <Marker key={`${place.kind}-${i}`} position={[place.latitude, place.longitude]} icon={place.icon}>
            <Popup>
              <div style={{ fontSize: 13 }}>{place.label}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
