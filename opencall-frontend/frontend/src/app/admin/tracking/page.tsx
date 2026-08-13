"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  getEngineerPath,
  getLiveEngineers,
  type LiveEngineer,
  type TrackPath,
} from "../../../lib/payrollTrackingApiClient";
import { readSession, type ClientSession } from "../../../lib/session";

// Leaflet touches `window`, so the map is client-only (no SSR).
const LiveTrackingMap = dynamic(() => import("../../../components/LiveTrackingMap"), {
  ssr: false,
  loading: () => <div style={{ height: "60vh" }} />,
});

// Live engineer tracking: reads positions from Payroll (via the OpenCall backend
// proxy) and refreshes every 30s. Shows an embedded free Leaflet + OpenStreetMap
// map (no API key / billing) with a live marker per engineer, plus a searchable
// table. Pick any engineer (marker or "Check live") to draw today's path + km.
// To switch to Google Maps later, swap LiveTrackingMap for a Google-backed map
// component (needs a billed NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).

const REFRESH_MS = 30_000;

function relativeAge(minutes: number | null): string {
  if (minutes == null) return "no fix yet";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** On duty is the engineer's declaration; the colour says whether we can
 *  currently see them. Amber is the case that used to just disappear. */
function DutyBadge({ stale, lastSeen }: { stale: boolean; lastSeen: number | null }) {
  const live = !stale;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: live ? "#dcfce7" : "#fef3c7",
        color: live ? "#15803d" : "#b45309",
        whiteSpace: "nowrap",
      }}
      title={live ? "Sending live position" : "On duty, but the phone has stopped reporting"}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: live ? "#22c55e" : "#f59e0b",
        }}
      />
      {live ? "On duty" : `No signal · ${relativeAge(lastSeen)}`}
    </span>
  );
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A plain Google Maps link — no API key, no billing. Clicking a coordinate is
 * how someone goes and finds an engineer, so it opens the map with the better
 * Indian coverage (and the Maps app on a phone). The embedded map below still
 * draws on OpenStreetMap tiles, the only tile source that needs no key.
 */
function mapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

export default function LiveTrackingPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [engineers, setEngineers] = useState<LiveEngineer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which engineer the admin is checking + their day path/km.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [path, setPath] = useState<TrackPath | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSession(readSession());
  }, []);

  // Poll the live list.
  useEffect(() => {
    if (!session) return;
    let active = true;
    const load = () => {
      getLiveEngineers(session.token)
        .then((res) => {
          if (!active) return;
          setConfigured(res.configured);
          setEngineers(res.engineers);
          setError(null);
        })
        .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load"));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [session]);

  // When an engineer is checked, pull their today path + km (refreshes with list).
  useEffect(() => {
    if (!session || selectedId == null) {
      setPath(null);
      return;
    }
    let active = true;
    const load = () => {
      getEngineerPath(session.token, selectedId, todayStr())
        .then((p) => active && setPath(p))
        .catch(() => active && setPath(null));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [session, selectedId, engineers.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return engineers;
    return engineers.filter(
      (e) =>
        e.engineer_name.toLowerCase().includes(q) ||
        (e.branch ?? "").toLowerCase().includes(q) ||
        (e.active_case_number ?? "").toLowerCase().includes(q),
    );
  }, [engineers, query]);

  const selected = engineers.find((e) => e.engineer_id === selectedId) ?? null;

  const totalKm = useMemo(
    () => engineers.reduce((sum, e) => sum + (e.distance_km ?? 0), 0),
    [engineers],
  );
  const staleCount = useMemo(() => engineers.filter((e) => e.stale).length, [engineers]);

  const pathPoints = useMemo<[number, number][]>(
    () => (path?.points ?? []).map((p) => [p.latitude, p.longitude] as [number, number]),
    [path],
  );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Live Engineer Tracking</h1>
        {/* The day at a glance: who is out, how many we can actually see, and
            the total ground covered across everyone on duty. */}
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280", alignItems: "center" }}>
          <span>
            <strong style={{ color: "#111827", fontSize: 15 }}>{engineers.length}</strong> on duty
          </span>
          {staleCount > 0 && (
            <span style={{ color: "#b45309" }}>
              <strong style={{ fontSize: 15 }}>{staleCount}</strong> no signal
            </span>
          )}
          <span>
            <strong style={{ color: "#111827", fontSize: 15 }}>{totalKm.toFixed(1)}</strong> km total today
          </span>
        </div>
      </div>

      {!configured && (
        <p style={{ color: "#b45309", marginTop: 12 }}>
          Payroll integration is not configured. Set PAYROLL_API_URL / PAYROLL_API_USER /
          PAYROLL_API_PASSWORD in the OpenCall backend environment.
        </p>
      )}
      {error && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}

      {/* Free live map (Leaflet + OpenStreetMap, no API key/billing). Click a
          marker to select that engineer and draw today's path. */}
      <div style={{ marginTop: 16 }}>
        <LiveTrackingMap
          engineers={engineers}
          selectedId={selectedId}
          pathPoints={pathPoints}
          onSelect={(id) => setSelectedId(id)}
        />
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
          Map © OpenStreetMap contributors — free tiles. Positions refresh every 30s while engineers have the app open.
        </p>
      </div>

      {/* Pick any engineer to check live */}
      <input
        placeholder="Search engineer / branch / case…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          marginTop: 16,
          width: "100%",
          maxWidth: 360,
          padding: "8px 12px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          fontSize: 14,
        }}
      />

      {/* Selected engineer detail */}
      {selected && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #dbeafe",
            background: "#eff6ff",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{selected.engineer_name}</strong>
            <button
              onClick={() => setSelectedId(null)}
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer" }}
            >
              Clear
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: "#374151", display: "grid", gap: 4 }}>
            <span>Branch: {selected.branch ?? "—"}</span>
            <span>
              Duty: <DutyBadge stale={selected.stale} lastSeen={selected.last_seen_minutes} />{" "}
              since {new Date(selected.duty_started_at).toLocaleTimeString()} (
              {duration(selected.duty_minutes)})
            </span>
            <span>Active case: {selected.active_case_number ?? "—"}</span>
            <span>Status: {selected.status || "—"}</span>
            <span>Last seen: {relativeAge(selected.last_seen_minutes)}</span>
            <span>
              {selected.stale ? "Last known position: " : "Position: "}
              {selected.latitude != null && selected.longitude != null ? (
                <>
                  <a
                    href={mapsLink(selected.latitude, selected.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#2563eb" }}
                  >
                    {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                  </a>
                  {selected.accuracy != null && (
                    <span style={{ color: "#9ca3af" }}> ±{Math.round(selected.accuracy)}m</span>
                  )}
                </>
              ) : (
                <span style={{ color: "#9ca3af" }}>no fix yet on this duty</span>
              )}
            </span>
            <span style={{ fontWeight: 600, color: "#1d4ed8" }}>
              This duty: {selected.distance_km} km
              {path ? ` · today total ${path.total_km} km (${path.count} points)` : ""}
            </span>
          </div>
        </div>
      )}

      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: 8 }}>Engineer</th>
            <th style={{ padding: 8 }}>Branch</th>
            <th style={{ padding: 8 }}>Duty</th>
            <th style={{ padding: 8 }}>On duty for</th>
            <th style={{ padding: 8 }}>Distance</th>
            <th style={{ padding: 8 }}>Active case</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Location</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr
              key={e.engineer_id}
              style={{
                borderBottom: "1px solid #f3f4f6",
                background: e.engineer_id === selectedId ? "#eff6ff" : undefined,
              }}
            >
              <td style={{ padding: 8, fontWeight: 500 }}>{e.engineer_name}</td>
              <td style={{ padding: 8 }}>{e.branch ?? "—"}</td>
              <td style={{ padding: 8 }}>
                <DutyBadge stale={e.stale} lastSeen={e.last_seen_minutes} />
              </td>
              <td style={{ padding: 8 }}>{duration(e.duty_minutes)}</td>
              <td style={{ padding: 8, fontWeight: 600 }}>{e.distance_km} km</td>
              <td style={{ padding: 8 }}>{e.active_case_number ?? "—"}</td>
              <td style={{ padding: 8 }}>{e.status || "—"}</td>
              <td style={{ padding: 8 }}>
                {e.latitude != null && e.longitude != null ? (
                  <>
                    <a
                      href={mapsLink(e.latitude, e.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#2563eb" }}
                    >
                      {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                    </a>
                    {e.accuracy != null && <span style={{ color: "#9ca3af" }}> ±{Math.round(e.accuracy)}m</span>}
                  </>
                ) : (
                  <span style={{ color: "#9ca3af" }}>waiting for GPS</span>
                )}
              </td>
              <td style={{ padding: 8 }}>
                <button
                  onClick={() => setSelectedId(e.engineer_id)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 13,
                    border: "1px solid #2563eb",
                    borderRadius: 6,
                    background: e.engineer_id === selectedId ? "#2563eb" : "#fff",
                    color: e.engineer_id === selectedId ? "#fff" : "#2563eb",
                    cursor: "pointer",
                  }}
                >
                  {e.engineer_id === selectedId ? "Checking" : "Check live"}
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && configured && (
            <tr>
              <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                {engineers.length === 0
                  ? "Nobody is on duty. Engineers appear here as soon as they tap Start Duty in Payroll."
                  : "No match."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
