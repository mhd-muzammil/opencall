"use client";

import { useState, type ComponentType } from "react";
import { CircleCheck, Hourglass, Locate, LocateOff, LogIn, LogOut, MapPin, Wifi, WifiOff } from "lucide-react";
import { formatKm, regionKey, regionTone } from "../../../lib/kmReport";
import {
  dayTimeline,
  hoursWords,
  initials,
  longDate,
  type DayReportColumn,
  type TimelineEntry,
  type TimelineKind,
} from "../../../lib/dayReport";

/**
 * The Day Report as cards: one per FSE-day, under its date. Each says who and
 * where at a glance -- km, check ins, Assigned / Attended / Closed, what needs a
 * look -- and then the day as it happened, one moment after another.
 */

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

const KIND: Record<TimelineKind, { color: string; tint: string; Icon: Icon }> = {
  login: { color: "#15803d", tint: "#dcfce7", Icon: LogIn },
  logout: { color: "#334155", tint: "#e2e8f0", Icon: LogOut },
  check_in: { color: "#2563eb", tint: "#dbeafe", Icon: MapPin },
  check_out: { color: "#7c3aed", tint: "#ede9fe", Icon: CircleCheck },
  wait: { color: "#64748b", tint: "#f1f5f9", Icon: Hourglass },
  gps_off: { color: "#dc2626", tint: "#fee2e2", Icon: LocateOff },
  gps_on: { color: "#059669", tint: "#d1fae5", Icon: Locate },
  net_off: { color: "#ea580c", tint: "#ffedd5", Icon: WifiOff },
  net_on: { color: "#0891b2", tint: "#cffafe", Icon: Wifi },
};
// A Logout the app closed rather than the engineer.
const AUTO = { color: "#b45309", tint: "#fef3c7" };

// A long day shows this many moments until "Show all" is pressed.
const VISIBLE = 8;

function Stat({ label, value, color, tint }: { label: string; value: string; color: string; tint: string }) {
  return (
    <div style={{ background: tint, borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Badge({ text, color, tint }: { text: string; color: string; tint: string }) {
  return (
    <span
      data-testid="day-card-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        background: tint,
        color,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  );
}

function Moment({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const kind = KIND[entry.kind];
  const tone = entry.auto ? AUTO : kind;
  const Icon = kind.Icon;
  const { place } = entry;
  return (
    <li data-testid="day-card-moment" style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, margin: 0 }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        {/* The line down to the next moment. */}
        {!last && (
          <span aria-hidden style={{ position: "absolute", top: 28, bottom: -2, width: 2, background: "#e5e7eb" }} />
        )}
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: tone.tint,
            color: tone.color,
            display: "grid",
            placeItems: "center",
            position: "relative",
          }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </span>
      </div>
      <div style={{ minWidth: 0, paddingBottom: last ? 0 : 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 700, color: tone.color, fontSize: 13 }}>{entry.title}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {entry.time}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: place.tone === "muted" ? "#9ca3af" : "#6b7280",
            fontStyle: place.tone === "muted" ? "italic" : undefined,
            overflowWrap: "anywhere",
            marginTop: 1,
          }}
        >
          {place.href ? (
            <a href={place.href} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
              {place.text}
            </a>
          ) : (
            place.text
          )}
        </div>
      </div>
    </li>
  );
}

function DayCard({ column, region }: { column: DayReportColumn; region: string | null }) {
  const [everything, setEverything] = useState(false);
  const tone = regionTone(regionKey(region));
  const { cell } = column;
  const moments = dayTimeline(column);
  const visible = everything ? moments : moments.slice(0, VISIBLE);
  const login = moments.find((m) => m.kind === "login");
  const logout = [...moments].reverse().find((m) => m.kind === "logout");
  const value = (n: number | null) => (n == null ? "-" : String(n));

  return (
    <article
      data-testid="day-card"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05), 0 6px 16px rgba(16, 24, 40, 0.05)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* The region's colour, as its box above has it. */}
      <div style={{ height: 5, background: tone.accent }} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 42,
              height: 42,
              flex: "0 0 auto",
              borderRadius: "50%",
              background: tone.tint,
              color: tone.accent,
              border: `2px solid ${tone.accent}`,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {initials(column.name)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              data-testid="day-card-name"
              style={{ fontSize: 16, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {column.name}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {region ? `${region} · ` : ""}
              {longDate(column.day)}
            </div>
          </div>
          <div style={{ textAlign: "right", flex: "0 0 auto" }}>
            <div data-testid="day-card-km" style={{ fontSize: 24, fontWeight: 800, color: "#111827", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {formatKm(cell.km)}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em", marginTop: 3 }}>KM</div>
          </div>
        </header>

        {/* The duty, from the first Login to the last Logout. */}
        {login && (
          <div
            data-testid="day-card-duty"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 13,
              color: "#374151",
              background: "#f8fafc",
              borderRadius: 10,
              padding: "6px 10px",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: KIND.login.color, fontWeight: 700 }}>
              <LogIn size={15} strokeWidth={2.4} /> {login.time}
            </span>
            <span style={{ color: "#9ca3af" }}>→</span>
            {cell.on_duty ? (
              <span style={{ color: KIND.login.color, fontWeight: 700 }}>On duty now</span>
            ) : logout ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: logout.auto ? AUTO.color : KIND.logout.color,
                  fontWeight: 700,
                }}
              >
                <LogOut size={15} strokeWidth={2.4} /> {logout.time}
              </span>
            ) : (
              <span style={{ color: "#9ca3af" }}>no Logout</span>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <Stat label="Check ins" value={String(cell.check_ins.length)} color="#0369a1" tint="#f0f9ff" />
          <Stat label="Assigned" value={value(cell.assigned)} color="#2563eb" tint="#eff6ff" />
          <Stat label="Attended" value={value(cell.attended)} color="#15803d" tint="#f0fdf4" />
          <Stat label="Closed" value={value(cell.closed)} color="#7c3aed" tint="#f5f3ff" />
        </div>

        {(cell.gps_off_minutes > 0 ||
          cell.net_off_minutes > 0 ||
          cell.waiting_minutes > 0 ||
          cell.logouts.some((m) => m.auto)) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cell.gps_off_minutes > 0 && (
              <Badge text={`GPS off ${hoursWords(cell.gps_off_minutes)}`} color="#b91c1c" tint="#fee2e2" />
            )}
            {cell.net_off_minutes > 0 && (
              <Badge text={`Net off ${hoursWords(cell.net_off_minutes)}`} color="#c2410c" tint="#ffedd5" />
            )}
            {cell.waiting_minutes > 0 && (
              <Badge text={`Waiting ${hoursWords(cell.waiting_minutes)}`} color="#475569" tint="#f1f5f9" />
            )}
            {cell.logouts.some((m) => m.auto) && <Badge text="Auto logout" color={AUTO.color} tint={AUTO.tint} />}
          </div>
        )}

        {moments.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: 10,
              padding: "14px 12px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            No duty recorded on this day.
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.08em", marginBottom: 8 }}>
              THE DAY
            </div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visible.map((entry, index) => (
                <Moment key={`${entry.kind}|${entry.at}|${index}`} entry={entry} last={index === visible.length - 1} />
              ))}
            </ol>
            {moments.length > VISIBLE && (
              <button
                type="button"
                onClick={() => setEverything((on) => !on)}
                style={{
                  font: "inherit",
                  marginTop: 8,
                  minHeight: 0,
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid #c7d2fe",
                  background: "#eef2ff",
                  color: "#4338ca",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {everything ? "Show less" : `Show all ${moments.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function DayReportCards({
  columns,
  regionById,
}: {
  columns: DayReportColumn[];
  regionById: Map<number, string | null>;
}) {
  // Under each date, its FSEs, in the order the report keeps them.
  const groups: { day: string; columns: DayReportColumn[] }[] = [];
  for (const column of columns) {
    const group = groups[groups.length - 1];
    if (group && group.day === column.day) group.columns.push(column);
    else groups.push({ day: column.day, columns: [column] });
  }
  return (
    <div data-testid="day-report-cards" style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 14 }}>
      {groups.map((group) => (
        <section key={group.day}>
          <h4
            data-testid="day-report-date"
            style={{
              margin: "0 0 10px",
              fontSize: 15,
              fontWeight: 800,
              color: "#1f2937",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              // The app's headings are uppercase; "3 FSES" is not how anyone writes it.
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            {longDate(group.day)}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#6b7280" }}>
              · {group.columns.length} {group.columns.length === 1 ? "FSE" : "FSEs"}
            </span>
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
            {group.columns.map((column) => (
              <DayCard
                key={`${column.day}|${column.engineerId}`}
                column={column}
                region={regionById.get(column.engineerId) ?? null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
