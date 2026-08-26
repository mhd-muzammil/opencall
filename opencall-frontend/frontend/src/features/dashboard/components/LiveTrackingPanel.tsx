"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  getEngineerDay,
  getRoster,
  type EngineerDay,
  type RosterEngineer,
} from "../../../lib/payrollTrackingApiClient";
import { clearSession } from "../../../lib/session";
import { isApiAuthError } from "../../../lib/api/http";
import {
  countBuckets,
  filterRoster,
  isRowSelected,
  rosterRowKey,
  type RosterBucket,
} from "../../../lib/rosterBuckets";

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

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date: string): string {
  if (date === todayStr()) return "Today";
  const d = new Date(`${date}T00:00:00`);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

const arrowStyle: React.CSSProperties = {
  minWidth: 54,
  height: 30,
  borderRadius: 8,
  border: "1px solid #bfdbfe",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#1d4ed8",
  lineHeight: 1,
};

/** One headline number, the way Lystloc puts duration / distance / stops up top. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  );
}

// Each kind of timeline entry gets its own colour, so the shape of a day reads
// at a glance: green starts, red ends, amber standing still, blue case work.
const EVENT_COLOR: Record<string, string> = {
  duty_start: "#16a34a",
  duty_end: "#dc2626",
  stop: "#d97706",
  assigned: "#6b7280",
  started: "#2563eb",
  reached: "#0891b2",
  completed: "#16a34a",
};

/**
 * Where an engineer stands, in one chip. Three states, not two: on duty and
 * reporting, on duty but the phone has gone quiet (amber — the case that used to
 * make them vanish from the board), and finished for the day.
 */
function DutyBadge({ row }: { row: RosterEngineer }) {
  const [background, color, dot, text, title] =
    row.state === "unmatched"
      ? [
          "#fee2e2",
          "#b91c1c",
          "#ef4444",
          "Not in Payroll",
          "In the Add Engineers register but no matching Payroll employee — their cases are being skipped. Add an alias or onboard them.",
        ]
      : row.state === "absent"
      ? ["#f3f4f6", "#6b7280", "#9ca3af", "Not on duty", "No duty started on this day"]
      : row.state === "checked_out"
        ? [
            "#e0e7ff",
            "#4338ca",
            "#6366f1",
            `Checked out${row.duty_ended_at ? ` · ${clock(row.duty_ended_at)}` : ""}`,
            row.auto_closed ? "Auto-closed — they never tapped Stop Duty" : "Shift finished",
          ]
        : row.stale
          ? [
              "#fef3c7",
              "#b45309",
              "#f59e0b",
              `No signal · ${relativeAge(row.last_seen_minutes)}`,
              "On duty, but the phone has stopped reporting",
            ]
          : ["#dcfce7", "#15803d", "#22c55e", "On duty", "Sending live position"];

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
        background,
        color,
        whiteSpace: "nowrap",
      }}
      title={title}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
      {text}
    </span>
  );
}

/**
 * Today in IST, which is the day Payroll and the plan both count in.
 *
 * toISOString() gives the UTC date, and between midnight and 05:30 IST that is
 * still YESTERDAY — so an engineer on duty at 2am was asked about the wrong day
 * and came back absent, with their whole night's work missing from the board.
 */
function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

/**
 * Initials for a row's avatar. We hold no photographs of the engineers, and
 * twenty identical grey silhouettes read as missing data rather than as people.
 */
function initials(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * The live engineer board: who is out, where they are, how far they have gone.
 *
 * Rendered both as a section of the admin console and at its own /admin/tracking
 * URL, so the token is a prop rather than something this reads for itself —
 * whichever host mounts it already knows who is signed in.
 */
export default function LiveTrackingPanel({
  token,
  // The console draws its own header for the section, so the panel's own
  // heading rendered on top of it — the same words twice, overlapping. The
  // standalone /admin/tracking route has no header of its own and keeps it.
  embedded = false,
}: {
  token: string | null;
  embedded?: boolean;
}) {
  const [engineers, setEngineers] = useState<RosterEngineer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // An expired login is not a tracking problem, and "Bearer token has expired"
  // over an empty board reads as one. Tracked apart so it gets its own message
  // and a way out.
  const [sessionExpired, setSessionExpired] = useState(false);

  // Which engineer the admin is checking, and which day of theirs.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [day, setDay] = useState<EngineerDay | null>(null);
  const [dayDate, setDayDate] = useState(todayStr());
  const [dayLoading, setDayLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<RosterBucket>("all");

  // The board: EVERY engineer for the chosen day, not only those out right now,
  // so a finished shift can still be opened. Only today keeps polling.
  useEffect(() => {
    if (!token || sessionExpired) return;
    let active = true;
    const load = () => {
      getRoster(token, dayDate)
        .then((res) => {
          if (!active) return;
          setConfigured(res.configured);
          setEngineers(res.engineers);
          setError(null);
        })
        .catch((e) => {
          if (!active) return;
          if (isApiAuthError(e)) {
            // Stop polling: every retry would fail the same way.
            setSessionExpired(true);
            setError(null);
            return;
          }
          setError(e instanceof Error ? e.message : "Failed to load");
        });
    };
    load();
    if (dayDate !== todayStr()) {
      return () => {
        active = false;
      };
    }
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [token, dayDate, sessionExpired]);

  // The checked engineer's whole day: route, distance, time on duty, stops and
  // timeline. Only TODAY keeps polling — a past day is finished, so re-fetching
  // it every 30s would just churn.
  useEffect(() => {
    if (!token || selectedId == null) {
      setDay(null);
      return;
    }
    let active = true;
    const load = () => {
      getEngineerDay(token, selectedId, dayDate)
        .then((d) => {
          if (!active) return;
          setDay(d);
          setDayLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setDay(null);
          setDayLoading(false);
        });
    };
    setDayLoading(true);
    load();
    if (dayDate !== todayStr()) {
      return () => {
        active = false;
      };
    }
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [token, selectedId, dayDate, engineers.length]);

  const shiftDay = (days: number) => {
    const d = new Date(`${dayDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    const next = d.toISOString().slice(0, 10);
    // Never walk into the future — there is nothing recorded there.
    if (next <= todayStr()) setDayDate(next);
  };

  // Bucketing lives in lib/rosterBuckets so the tab labels and the rows they show
  // are computed by the same code — they used to be two hand-written conditions
  // that could disagree, and did: "On duty 1" listed everyone Payroll could not match.
  const filtered = useMemo(
    () => filterRoster(engineers, stateFilter, query),
    [engineers, query, stateFilter],
  );
  const bucketCounts = useMemo(() => countBuckets(engineers), [engineers]);

  // The null check is load-bearing: an engineer Payroll cannot match has
  // engineer_id null, so comparing against a null selectedId matched the first
  // unlinked engineer and the panel opened on its own — and Clear, which sets
  // selectedId back to null, could never close it.
  const selected =
    selectedId == null ? null : engineers.find((e) => e.engineer_id === selectedId) ?? null;

  const onDutyCount = bucketCounts.on_duty;
  const totalKm = useMemo(
    () => engineers.reduce((sum, e) => sum + (e.distance_km ?? 0), 0),
    [engineers],
  );
  const staleCount = useMemo(() => engineers.filter((e) => e.stale).length, [engineers]);
  // Only people actually out get a live marker; a finished shift would otherwise
  // leave a pin sitting where they were hours ago. An unlinked engineer has no
  // Payroll id and no position, so they never reach the map.
  const liveOnMap = useMemo(
    () =>
      engineers
        .filter((e) => e.state === "on_duty" && e.engineer_id != null)
        .map((e) => ({ ...e, engineer_id: e.engineer_id as number })),
    [engineers],
  );

  const pathPoints = useMemo<[number, number][]>(
    () => (day?.points ?? []).map((p) => [p.latitude, p.longitude] as [number, number]),
    [day],
  );
  const stopMarkers = useMemo(
    () =>
      (day?.stops ?? []).map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
        minutes: s.minutes,
        label: `${clock(s.arrived_at)} · stopped ${duration(s.minutes)}${
          s.case_number ? ` · ${s.case_number}` : ""
        }`,
      })),
    [day],
  );

  return (
    <div style={{ padding: embedded ? 0 : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!embedded && <h1 style={{ fontSize: 20, fontWeight: 600 }}>Live Engineer Tracking</h1>}
        {/* The day at a glance: who is out, how many we can actually see, and
            the total ground covered across everyone on duty. */}
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280", alignItems: "center" }}>
          <span>
            <strong style={{ color: "#111827", fontSize: 15 }}>{onDutyCount}</strong> on duty
            <span style={{ color: "#9ca3af" }}> of {engineers.length}</span>
          </span>
          {staleCount > 0 && (
            <span style={{ color: "#b45309" }}>
              <strong style={{ fontSize: 15 }}>{staleCount}</strong> no signal
            </span>
          )}
          <span>
            <strong style={{ color: "#111827", fontSize: 15 }}>{totalKm.toFixed(1)}</strong> km total
          </span>
        </div>
      </div>

      {/* Says which of the two it is. An expired login and an unconfigured
          integration both leave an empty board, and they need opposite actions. */}
      {sessionExpired && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>Your login has expired.</strong> Nothing is wrong with tracking — sign in again
            and the board fills straight back up.
          </span>
          <button
            onClick={() => {
              clearSession();
              window.location.replace("/");
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #b45309",
              background: "#b45309",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign in again
          </button>
        </div>
      )}
      {!configured && !sessionExpired && (
        <p style={{ color: "#b45309", marginTop: 12 }}>
          Payroll integration is not configured. Set PAYROLL_API_URL / PAYROLL_API_USER /
          PAYROLL_API_PASSWORD in the OpenCall backend environment.
        </p>
      )}
      {error && !sessionExpired && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}

      {/* Map on the left, the engineers on it down the right \u2014 the two
          things the office looks at together. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16, alignItems: "stretch", minHeight: 520 }}>
        <div style={{ flex: "1 1 520px", minWidth: 380, minHeight: 420, display: "flex", flexDirection: "column" }}>
      {/* Free live map (Leaflet + OpenStreetMap, no API key/billing). Click a
          marker to select that engineer and draw today's path. */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <LiveTrackingMap
          height="100%"
          engineers={liveOnMap}
          selectedId={selectedId}
          pathPoints={pathPoints}
          stops={stopMarkers}
          onSelect={(id) => setSelectedId(id)}
        />
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
          Map © OpenStreetMap contributors — free tiles. Positions refresh every 30s while engineers have the app open.
        </p>
      </div>

        </div>

        <aside
          style={{
            flex: "0 1 360px",
            minWidth: 300,
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>Track</div>
          </div>
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

      {/* Pick ANY engineer — on duty, finished, or never started. The whole point
          of the roster is that a shift ending does not take someone off the board.
          "Not in Payroll" is a separate tab because it is a data problem to fix,
          not a duty state: those engineers' cases are being skipped entirely. */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        {(
          [
            ["all", `All ${bucketCounts.all}`, "#2563eb"],
            ["on_duty", `On duty ${bucketCounts.on_duty}`, "#2563eb"],
            ["off", `Off duty ${bucketCounts.off}`, "#2563eb"],
            ["unmatched", `Not in Payroll ${bucketCounts.unmatched}`, "#dc2626"],
          ] as const
        ).map(([value, label, accent]) => (
          <button
            key={value}
            onClick={() => setStateFilter(value)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              borderColor: stateFilter === value ? accent : "#d1d5db",
              background: stateFilter === value ? accent : "#fff",
              color: stateFilter === value ? "#fff" : value === "unmatched" ? "#b91c1c" : "#374151",
            }}
          >
            {label}
          </button>
        ))}
      </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filtered.map((e, index) => {
            const chosen = isRowSelected(e, selectedId);
            return (
              <div
                key={rosterRowKey(e, index)}
                data-testid="engineer-row"
                data-selected={chosen ? "true" : "false"}
                onClick={() => e.engineer_id != null && setSelectedId(e.engineer_id)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 14px",
                  borderBottom: "1px solid #f3f4f6",
                  background: chosen ? "#eff6ff" : undefined,
                  cursor: e.engineer_id == null ? "default" : "pointer",
                }}
              >
                {/* Initials rather than a photo: we have no pictures, and a grey
                    silhouette twenty times over reads as missing data. */}
                <div
                  style={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: e.state === "unmatched" ? "#fee2e2" : "#e0e7ff",
                    color: e.state === "unmatched" ? "#b91c1c" : "#4338ca",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {initials(e.engineer_name)}
                  <span
                    title={e.state === "on_duty" ? "On duty" : "Not on duty"}
                    style={{
                      position: "absolute",
                      right: -1,
                      top: -1,
                      width: 11,
                      height: 11,
                      borderRadius: 999,
                      border: "2px solid #fff",
                      background:
                        e.state !== "on_duty"
                          ? "#d1d5db"
                          : e.stale
                            ? "#f59e0b"
                            : "#22c55e",
                    }}
                  />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span
                      data-testid="engineer-name"
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.engineer_name}
                    </span>
                    {e.branch && (
                      <span style={{ fontSize: 10.5, color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {e.branch}
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 3 }}>
                    <DutyBadge row={e} />
                  </div>

                  {/* The two numbers the office asks about. Not battery level —
                      the app does not report one and inventing it would be a
                      number people would act on. */}
                  {e.state !== "unmatched" && (
                    <div style={{ marginTop: 4, display: "flex", gap: 10, fontSize: 11, color: "#6b7280" }}>
                      <span>{duration(e.duty_minutes)}</span>
                      <span style={{ fontWeight: 600, color: "#374151" }}>{e.distance_km} km</span>
                      {e.active_case_number && (
                        <span style={{ color: "#2563eb" }}>{e.active_case_number}</span>
                      )}
                    </div>
                  )}

                  {e.latitude != null && e.longitude != null && (
                    <a
                      href={mapsLink(e.latitude, e.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      style={{ display: "inline-block", marginTop: 3, fontSize: 11, color: "#2563eb" }}
                    >
                      Open in Maps
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && configured && (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              {engineers.length === 0
                ? "No engineers found. Every active employee appears here once Payroll is reachable."
                : stateFilter === "unmatched" && !query.trim()
                  ? "Every engineer in the register is matched in Payroll \u2014 no cases are being skipped."
                  : "No match for this filter."}
            </div>
          )}
        </div>
        </aside>
      </div>

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
              Duty: <DutyBadge row={selected} />
              {selected.duty_started_at && (
                <>
                  {" "}
                  {clock(selected.duty_started_at)}
                  {selected.duty_ended_at ? ` – ${clock(selected.duty_ended_at)}` : " onwards"} (
                  {duration(selected.duty_minutes)})
                </>
              )}
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
            </span>
          </div>

          {/* The day itself: pick a date, read the three numbers, then read the
              timeline top to bottom the way the day happened. */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid #bfdbfe",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* Plain words, not chevron glyphs — ‹ and › rendered as empty
                boxes in the console's font, so the buttons looked broken. */}
            <button onClick={() => shiftDay(-1)} style={arrowStyle} title="Previous day">
              Prev
            </button>
            <strong style={{ fontSize: 14, minWidth: 110, textAlign: "center" }}>
              {dayLabel(dayDate)}
            </strong>
            <button
              onClick={() => shiftDay(1)}
              disabled={dayDate >= todayStr()}
              style={{ ...arrowStyle, opacity: dayDate >= todayStr() ? 0.35 : 1 }}
              title="Next day"
            >
              Next
            </button>
            <input
              type="date"
              value={dayDate}
              max={todayStr()}
              onChange={(e) => e.target.value && setDayDate(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13 }}
            />
            {dayLoading && <span style={{ fontSize: 12, color: "#6b7280" }}>loading…</span>}
          </div>

          {day && (
            <>
              <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
                <Stat label="Duration" value={duration(day.duty_minutes)} />
                <Stat label="Distance" value={`${day.total_km} km`} />
                <Stat label="Stops" value={String(day.stop_count)} />
                <Stat
                  label="Seen"
                  value={
                    day.first_seen && day.last_seen
                      ? `${clock(day.first_seen)} – ${clock(day.last_seen)}`
                      : "—"
                  }
                />
              </div>

              {day.events.length === 0 ? (
                <p style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
                  Nothing recorded on this day — no duty was started and no position came in.
                </p>
              ) : (
                <ol
                  style={{
                    marginTop: 12,
                    maxHeight: 260,
                    overflowY: "auto",
                    listStyle: "none",
                    padding: 0,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {day.events.map((e, i) => (
                    <li key={`${e.at}-${i}`} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                      <span style={{ color: "#6b7280", minWidth: 62, fontVariantNumeric: "tabular-nums" }}>
                        {clock(e.at)}
                      </span>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          marginTop: 5,
                          flexShrink: 0,
                          background: EVENT_COLOR[e.type] ?? "#6b7280",
                        }}
                      />
                      <span style={{ color: "#111827" }}>
                        {e.label}
                        {e.case_number && (
                          <span style={{ color: "#6b7280" }}> · {e.case_number}</span>
                        )}
                        {e.latitude != null && e.longitude != null && (
                          <>
                            {" "}
                            <a
                              href={mapsLink(e.latitude, e.longitude)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#2563eb" }}
                            >
                              view on map
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
