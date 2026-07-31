"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getEngineerPath,
  getLiveEngineers,
  type LiveEngineer,
  type TrackPath,
} from "../../../lib/payrollTrackingApiClient";
import { readSession, type ClientSession } from "../../../lib/session";

// Dependency-free live tracking view: reads engineer positions from Payroll (via
// the OpenCall backend proxy) and refreshes every 30s. Pick any engineer to see
// their live detail + today's travelled distance. Rows link out to OpenStreetMap
// (free). An embedded Leaflet map can be added later — see
// payrollsystem/payroll_frontend/src/components/Tracking/LiveMap.jsx.

const REFRESH_MS = 30_000;

function relativeAge(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function osmLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Live Engineer Tracking</h1>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{engineers.length} active</span>
      </div>

      {!configured && (
        <p style={{ color: "#b45309", marginTop: 12 }}>
          Payroll integration is not configured. Set PAYROLL_API_URL / PAYROLL_API_USER /
          PAYROLL_API_PASSWORD in the OpenCall backend environment.
        </p>
      )}
      {error && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}

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
            <span>Active case: {selected.active_case_number ?? "—"}</span>
            <span>Status: {selected.status || "—"}</span>
            <span>Last seen: {relativeAge(selected.timestamp)}</span>
            <span>
              Position:{" "}
              <a href={osmLink(selected.latitude, selected.longitude)} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </a>
              {selected.accuracy != null && (
                <span style={{ color: "#9ca3af" }}> ±{Math.round(selected.accuracy)}m</span>
              )}
            </span>
            <span style={{ fontWeight: 600, color: "#1d4ed8" }}>
              Today travelled: {path ? `${path.total_km} km (${path.count} points)` : "…"}
            </span>
          </div>
        </div>
      )}

      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: 8 }}>Engineer</th>
            <th style={{ padding: 8 }}>Branch</th>
            <th style={{ padding: 8 }}>Active case</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Last seen</th>
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
              <td style={{ padding: 8 }}>{e.active_case_number ?? "—"}</td>
              <td style={{ padding: 8 }}>{e.status || "—"}</td>
              <td style={{ padding: 8 }}>{relativeAge(e.timestamp)}</td>
              <td style={{ padding: 8 }}>
                <a href={osmLink(e.latitude, e.longitude)} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                  {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                </a>
                {e.accuracy != null && <span style={{ color: "#9ca3af" }}> ±{Math.round(e.accuracy)}m</span>}
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
              <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                {engineers.length === 0 ? "No engineers currently active." : "No match."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
