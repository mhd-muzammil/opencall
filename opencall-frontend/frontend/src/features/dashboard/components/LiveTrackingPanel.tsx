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

// Below this, a phone is close enough to flat that it explains a silence.
const LOW_BATTERY_PERCENT = 15;
// And a band above it. A single cliff meant 16% was styled exactly like 98%,
// while the point of showing charge at all is to catch a phone coming to the end
// of its day in time to ring the engineer. 30% at nine in the morning does not
// survive a shift.
const WATCH_BATTERY_PERCENT = 30;

/** How a charge figure should be treated: urgent, worth noticing, or ordinary. */
function batteryTone(level: number | null | undefined, charging: boolean | null | undefined) {
  if (level == null || charging) return undefined;
  if (level <= LOW_BATTERY_PERCENT) return "warn" as const;
  if (level <= WATCH_BATTERY_PERCENT) return "watch" as const;
  return undefined;
}

/**
 * One of the numbers across the top of the board, as a bordered tile.
 *
 * Distinct from Stat above, which is the borderless kind used inside a single
 * engineer's day. These sit over the whole board and have to hold their own
 * against a map, so they carry a box.
 *
 * A number is only worth its size if you can tell what it counts, so the label
 * travels with it rather than sitting in a legend somewhere.
 */
function SummaryStat({
  value,
  of,
  label,
  tone,
  hint,
  onClick,
  active,
}: {
  value: string;
  of?: string;
  label: string;
  tone?: "warn";
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const warn = tone === "warn";
  // A count nobody can act on is trivia. Where there are engineers behind the
  // number, the tile is the way to them — a fifth filter pill would have broken
  // the 2x2 below, and the number is where the eye already is.
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      title={hint}
      {...(onClick ? { onClick, type: "button" as const } : {})}
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        border: `1px solid ${active ? (warn ? "#f59e0b" : "#93c5fd") : warn ? "#fde68a" : "#e5e7eb"}`,
        background: active ? (warn ? "#fef3c7" : "#eff6ff") : warn ? "#fffbeb" : "#fff",
        minWidth: 96,
        textAlign: "left",
        font: "inherit",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: warn ? "#b45309" : "#111827" }}>
          {value}
        </span>
        {of && <span style={{ fontSize: 12, color: "#9ca3af" }}>{of}</span>}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          color: warn ? "#b45309" : "#6b7280",
        }}
      >
        {label}
      </div>
    </Tag>
  );
}

/**
 * One number on an engineer's row, with its label under it.
 *
 * Small enough that four fit across the rail, labelled enough that none of them
 * has to be guessed at. No borders — a row already has enough edges.
 */
function RowStat({
  value,
  label,
  tone,
  strong,
  hint,
}: {
  value: string;
  label: string;
  tone?: "warn" | "watch" | "chip";
  strong?: boolean;
  hint?: string;
}) {
  const color =
    tone === "warn"
      ? "#b91c1c"
      : tone === "watch"
        ? "#b45309"
        : tone === "chip"
          ? "#1d4ed8"
          : strong
            ? "#111827"
            : "#374151";
  // A chip for the case number and a fill for the urgent band. The case number
  // was bare link-blue text three pixels above a real link, so it read as
  // clickable and was not; and only one thing in a row should be shouting.
  const boxed =
    tone === "chip" || tone === "warn"
      ? {
          background: tone === "chip" ? "#eff6ff" : "#fef2f2",
          padding: "1px 6px",
          borderRadius: 4,
          display: "inline-block",
        }
      : {};
  return (
    <div title={hint} style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: strong || tone ? 700 : 600,
          color,
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          ...boxed,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          color: tone === "warn" ? "#b91c1c" : tone === "watch" ? "#b45309" : "#9ca3af",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

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
              // Going dark looks identical either way, and the charge on the
              // last fix is the only thing that tells them apart. Saying which
              // is the difference between "chase them" and "they will be back".
              row.battery_level != null && row.battery_level <= LOW_BATTERY_PERCENT
                ? `On duty, but the phone has stopped reporting. It was on ${row.battery_level}% — it has probably gone flat.`
                : row.battery_level != null
                  ? `On duty, but the phone has stopped reporting. It was on ${row.battery_level}%, so this is signal, not charge.`
                  : "On duty, but the phone has stopped reporting",
            ]
          // Reporting again after a spell offline. Worth saying out loud: the
          // route just filled in behind them, so a gap that was there a minute
          // ago is not a gap any more.
          : row.queued_minutes != null && row.queued_minutes > 0
            ? [
                "#dbeafe",
                "#1d4ed8",
                "#3b82f6",
                `Caught up · ${row.queued_minutes}m dark`,
                `The phone was offline for about ${row.queued_minutes} minutes and has just sent what it recorded while it was. The route behind them is complete.`,
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
  // One of the reasons this page gets opened is "whose phone is about to die",
  // and answering it meant reading every row. Counted once, up top.
  // Clicking a headline number should show you the engineers behind it. Kept
  // separate from the bucket tabs because it cuts across them — it narrows
  // whatever tab you are on rather than replacing it.
  const [focus, setFocus] = useState<"stale" | "low_battery" | null>(null);

  const lowBatteryCount = useMemo(
    () => engineers.filter((e) => e.state === "on_duty" && batteryTone(e.battery_level, e.is_charging)).length,
    [engineers],
  );
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

  // Prefer the road version when Payroll has managed to produce one: the fixes
  // are 30 seconds apart, so joining the raw ones draws a line that cuts corners
  // and crosses buildings. Falls back to the raw trail when there is no road
  // version — an older Payroll, no Ola key, or Ola unreachable — so the route
  // always draws, just less precisely.
  const pathPoints = useMemo<[number, number][]>(() => {
    const road = day?.road_path;
    if (road && road.points.length > 1) {
      return road.points.map(([lat, lon]) => [lat, lon] as [number, number]);
    }
    return (day?.points ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);
  }, [day]);

  // Where the road-matched part of the line stops and the raw fixes begin.
  //
  // Fixes are snapped in batches, so the newest few minutes of a live trail are
  // still the phone's own coordinates. Drawing both as one solid line claims a
  // precision the tail does not have — the map should say which part is which,
  // and only when there IS a mix, since a route that is all one or all the other
  // needs no explaining.
  const rawFromIndex = useMemo(() => {
    const road = day?.road_path;
    if (!road || road.source !== "partial" || road.raw <= 0) return undefined;
    const index = road.points.length - road.raw;
    return index > 0 && index < road.points.length ? index : undefined;
  }, [day]);
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
        {/* The day at a glance. These are the numbers the office looks at
            most, and they used to be set in 13px grey — smaller than the filter
            pills below them, which nobody glances at twice. The figure leads
            now and the label explains it, rather than the other way round. */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
          <SummaryStat
            value={String(onDutyCount)}
            of={`of ${engineers.length}`}
            label="On duty"
            {...(onDutyCount > 0
              ? {
                  onClick: () => {
                    setFocus(null);
                    setStateFilter("on_duty");
                  },
                  active: stateFilter === "on_duty" && focus === null,
                }
              : {})}
          />
          {staleCount > 0 && (
            <SummaryStat
              value={String(staleCount)}
              label="No signal"
              tone="warn"
              hint="On duty, but their phone has stopped reporting — click to see who"
              onClick={() => setFocus(focus === "stale" ? null : "stale")}
              active={focus === "stale"}
            />
          )}
          {lowBatteryCount > 0 && (
            <SummaryStat
              value={String(lowBatteryCount)}
              label="Low battery"
              tone="warn"
              hint={`${lowBatteryCount} on duty at ${WATCH_BATTERY_PERCENT}% or less and not charging — they will go quiet before the day is out. Click to see who.`}
              onClick={() => setFocus(focus === "low_battery" ? null : "low_battery")}
              active={focus === "low_battery"}
            />
          )}
          <SummaryStat value={totalKm.toFixed(1)} of="km" label="Travelled today" />
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 16,
          // flex-start, not stretch: the two halves carry their own
          // height below rather than one dragging the other taller.
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            flex: "1 1 520px",
            minWidth: 380,
            height: "clamp(420px, 68vh, 760px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
      {/* Free live map (Leaflet + OpenStreetMap, no API key/billing). Click a
          marker to select that engineer and draw today's path. */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <LiveTrackingMap
          height="100%"
          engineers={liveOnMap}
          selectedId={selectedId}
          pathPoints={pathPoints}
          {...(rawFromIndex !== undefined ? { rawFromIndex } : {})}
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
            // A CEILING, not a height. The same bound as the map stops
            // twenty-five engineers stretching the page, but as a fixed height
            // it also held the panel open at 420px on the ordinary day when one
            // person is out — a row, then a third of a screen of white, which
            // reads as something failing to load rather than as a quiet day.
            maxHeight: "clamp(420px, 68vh, 760px)",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {/* One engineer's day takes the panel over, with a way back to
              everyone. It used to render below the map AND the list, which on
              any real screen put the answer off the bottom of the page. */}
          {selected ? (
            <>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>Engineer day</div>
          </div>
      {/* Selected engineer detail */}
      {selected && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setSelectedId(null)}
              title="Back to all engineers"
              style={{
                display: "grid",
                placeItems: "center",
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              &#8592;
            </button>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: 999,
                background: "#e0e7ff",
                color: "#4338ca",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {initials(selected.engineer_name)}
            </div>
            <strong style={{ fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected.engineer_name}
            </strong>
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
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
            </>
          ) : (
            <>
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
      {/* A 2x2 grid, not a wrapping row. Four labels with counts do not fit
          across the rail at any sensible size, and letting them wrap left
          "Not in Payroll 5" stranded alone on a second line looking like an
          afterthought. Two by two is deliberate and even. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 14 }}>
        {(
          [
            ["all", "All", "#2563eb", bucketCounts.all],
            ["on_duty", "On duty", "#2563eb", bucketCounts.on_duty],
            ["off", "Off duty", "#2563eb", bucketCounts.off],
            ["unmatched", "Not in Payroll", "#dc2626", bucketCounts.unmatched],
          ] as const
        ).map(([value, label, accent, count]) => (
          <button
            key={value}
            onClick={() => setStateFilter(value)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              padding: "7px 11px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              borderColor: stateFilter === value ? accent : "#e5e7eb",
              background: stateFilter === value ? accent : "#fff",
              color: stateFilter === value ? "#fff" : value === "unmatched" ? "#b91c1c" : "#374151",
              textAlign: "left",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </span>
            {/* The count in its own chip: the label stays readable when it is
                long, and the number stays findable when it is not. */}
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
                background: stateFilter === value ? "rgba(255,255,255,0.25)" : "#f3f4f6",
                color: stateFilter === value ? "#fff" : "#6b7280",
              }}
            >
              {count}
            </span>
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
                    {/* On the name line, not under the figures. Four labelled
                        figures and a link do not share a line at the rail's
                        width, so down there it wrapped and cost every row an
                        extra line — a screenful of scrolling across 22 of them.
                        Up here there is room going spare. */}
                    {e.latitude != null && e.longitude != null && (
                      <a
                        href={mapsLink(e.latitude, e.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          marginLeft: "auto",
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: "#2563eb",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Maps ↗
                      </a>
                    )}
                  </div>

                  <div style={{ marginTop: 3 }}>
                    <DutyBadge row={e} />
                  </div>

                  {/* The reason, on the row rather than in a tooltip nobody
                      hovers for. Only on rows that have actually gone quiet, so
                      an ordinary row costs no height. */}
                  {e.state === "on_duty" && e.stale && e.battery_level != null && (
                    <div style={{ marginTop: 3, fontSize: 11, color: "#b45309" }}>
                      {e.battery_level <= LOW_BATTERY_PERCENT
                        ? `Was on ${e.battery_level}% — phone has probably gone flat`
                        : `Was on ${e.battery_level}% — signal, not charge`}
                    </div>
                  )}

                  {/* The numbers the office asks about, each one labelled.
                      They used to run together as one line of unlabelled grey
                      text — "26m 7.24 km 45% OC-003169" — which the person who
                      built the screen can read and nobody else can: 45% could
                      as easily have been progress through a job as charge left
                      in a phone. The value leads, the label says what it is.

                      Battery is here at all only because the app now reports
                      it; it was deliberately left off while it did not, since a
                      made-up figure is worse than a missing one. */}
                  {e.state !== "unmatched" && (
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      <RowStat value={duration(e.duty_minutes)} label="On duty" />
                      <RowStat value={`${e.distance_km} km`} label="Travelled" strong />
                      {e.battery_level != null && (
                        <RowStat
                          value={`${e.battery_level}%`}
                          label={e.is_charging ? "Charging" : "Battery"}
                          {...(batteryTone(e.battery_level, e.is_charging)
                            ? { tone: batteryTone(e.battery_level, e.is_charging)! }
                            : {})}
                          hint={
                            e.is_charging
                              ? `Phone on ${e.battery_level}%, charging`
                              : e.battery_level <= LOW_BATTERY_PERCENT
                                ? `Phone on ${e.battery_level}% and not charging — expect it to go quiet`
                                : `Phone on ${e.battery_level}%`
                          }
                        />
                      )}
                      {e.active_case_number && (
                        <RowStat value={e.active_case_number} label="On case" tone="chip" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && configured && (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              {engineers.length === 0
                ? "No engineers found. Every active employee appears here once Payroll is reachable."
                : stateFilter === "unmatched" && !query.trim()
                  ? "Every engineer in the register is matched in Payroll \u2014 no cases are being skipped."
                  : focus === "stale"
                    ? "Nobody on duty has gone quiet."
                    : focus === "low_battery"
                      ? "No phone is running low."
                      : query.trim()
                        ? `Nobody matches “${query.trim()}” in this tab.`
                        : "Nobody is in this tab right now."}
              </div>
              {(query.trim() || stateFilter !== "all" || focus) && (
                <button
                  onClick={() => {
                    setQuery("");
                    setStateFilter("all");
                  }}
                  style={{
                    marginTop: 12,
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Show all {engineers.length}
                </button>
              )}
            </div>
          )}
        </div>
            </>
          )}
        </aside>
      </div>


    </div>
  );
}
