"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  LoginLocationEntry,
  LoginLocationInfo,
  LoginLocationSummaryItem,
} from "../../lib/loginActivityApiClient";

/**
 * Admin-only presentation of "where a login came from". Used in both the Users list and the
 * Special Access logins list. The observed principal never sees these components — they live
 * only inside SUPER_ADMIN admin pages.
 */

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/** Best-effort browser + OS from a user-agent string (display only). */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /edg/i.test(ua) ? "Edge"
      : /opr|opera/i.test(ua) ? "Opera"
      : /chrome|crios/i.test(ua) ? "Chrome"
      : /firefox|fxios/i.test(ua) ? "Firefox"
      : /safari/i.test(ua) ? "Safari"
      : "Browser";
  const os =
    /windows/i.test(ua) ? "Windows"
      : /android/i.test(ua) ? "Android"
      : /iphone|ipad|ios/i.test(ua) ? "iOS"
      : /mac os|macintosh/i.test(ua) ? "macOS"
      : /linux/i.test(ua) ? "Linux"
      : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Human-readable label for an activity event type. */
export function describeEvent(eventType: string): string {
  const map: Record<string, string> = {
    LOGIN_SUCCESS: "Logged in",
    LOGIN_FAILED: "Failed login",
    LOGOUT: "Logged out",
    PASSWORD_CHANGED: "Changed password",
    PASSWORD_RESET: "Password reset",
    REPORT_ROW_EDITED: "Edited a case",
    REPORT_GENERATED: "Generated report",
    UPLOAD_CREATED: "Uploaded a file",
    USER_CREATED: "Created a user",
    USER_PROFILE_UPDATED: "Updated a user",
    USER_ROLE_CHANGED: "Changed a role",
    USER_REGION_REASSIGNED: "Reassigned region",
    USER_DEACTIVATED: "Deactivated a user",
    USER_REACTIVATED: "Reactivated a user",
    VENDOR_ACCESS_CREATED: "Created a vendor",
    VENDOR_ACCESS_UPDATED: "Updated a vendor",
    VENDOR_ACCESS_DELETED: "Deleted a vendor",
    VENDOR_CASE_ASSIGNED: "Assigned a case",
    VENDOR_CASE_UNASSIGNED: "Unassigned a case",
  };
  if (map[eventType]) return map[eventType];
  const s = eventType.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Show a friendlier IP: strip the IPv4-mapped IPv6 prefix (::ffff:127.0.0.1 → 127.0.0.1). */
function displayIp(ip: string): string {
  const rest = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(rest) ? rest : ip;
}

function LocationLabel({
  info,
  ip,
}: {
  info: LoginLocationInfo | null;
  ip: string | null;
}): React.JSX.Element {
  const label = info?.label ?? (ip ? "Unknown location" : "—");
  const pin = info?.isPrivate ? "🖧" : "📍";
  return (
    <span>
      <span style={{ fontWeight: 600, color: "#111827" }}>
        {label !== "—" ? `${pin} ${label}` : "—"}
      </span>
      {ip && (
        <>
          <br />
          <small className="muted" style={{ fontFamily: "monospace" }}>
            {displayIp(ip)}
            {info?.isp ? ` · ${info.isp}` : ""}
          </small>
        </>
      )}
    </span>
  );
}

/**
 * A clickable "Last location" table cell. Shows the resolved place + when, and opens the
 * history when clicked. Renders "Never" when the principal has no recorded login.
 */
export function LoginLocationCell({
  summary,
  onOpenHistory,
}: {
  summary: LoginLocationSummaryItem | null | undefined;
  onOpenHistory: () => void;
}): React.JSX.Element {
  if (!summary) {
    return <span className="muted">No activity yet</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpenHistory}
      title="View activity history"
      style={{
        display: "block",
        textAlign: "left",
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      <LocationLabel info={summary.location} ip={summary.ip} />
      <br />
      <small className="muted">
        {describeEvent(summary.eventType)} · {formatWhen(summary.lastSeenAt)} ›
      </small>
    </button>
  );
}

/** OpenStreetMap embed centred on a point with a marker — no API key, no dependency. */
function osmEmbedUrl(lat: number, lon: number): string {
  const d = 0.05; // ~5 km half-box → city-level zoom
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}
function osmLargeUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`;
}

/** Live map pinned at a login's approximate (city-level, IP-derived) location. */
function LocationMap({
  info,
  ip,
  when,
}: {
  info: LoginLocationInfo | null;
  ip: string | null;
  when: string;
}): React.JSX.Element {
  const hasCoords = info?.lat != null && info?.lon != null;
  return (
    <div style={{ marginBottom: 16 }}>
      {hasCoords ? (
        <>
          <iframe
            title="Login location map"
            src={osmEmbedUrl(info.lat as number, info.lon as number)}
            style={{ width: "100%", height: 300, border: 0, borderRadius: 8 }}
            loading="lazy"
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "baseline",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <div>
              <span style={{ fontWeight: 600, color: "#111827" }}>
                📍 {info?.label}
              </span>{" "}
              <small className="muted">
                {when}
                {ip ? ` · ${displayIp(ip)}` : ""}
              </small>
            </div>
            <a
              href={osmLargeUrl(info.lat as number, info.lon as number)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13 }}
            >
              View larger map ↗
            </a>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            Approximate location from IP (city-level) — not exact GPS.
          </p>
        </>
      ) : (
        <div
          style={{
            height: 120,
            display: "grid",
            placeItems: "center",
            borderRadius: 8,
            background: "#f3f4f6",
            color: "#6b7280",
            textAlign: "center",
            padding: 12,
          }}
        >
          {info?.isPrivate
            ? "🖧 Local / Private network — no map location"
            : "No map location available for this login"}
        </div>
      )}
    </div>
  );
}

/**
 * Modal: a live map pinned to the selected login + the full login history. Clicking any
 * history row re-centres the map on that login's place.
 */
export function LoginHistoryModal({
  open,
  title,
  entries,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  title: string;
  entries: LoginLocationEntry[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}): React.JSX.Element | null {
  // Default the map to the most recent login that actually has coordinates.
  const firstCoordIndex = useMemo(() => {
    const idx = entries.findIndex(
      (e) => e.location?.lat != null && e.location?.lon != null,
    );
    return idx >= 0 ? idx : 0;
  }, [entries]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    setSelectedIndex(firstCoordIndex);
  }, [firstCoordIndex, open]);

  if (!open) return null;
  const selected = entries[selectedIndex] ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "min(720px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            background: "#fff",
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              Where they&apos;ve been active
            </p>
            <h3 style={{ margin: "2px 0 0", color: "#111827" }}>{title}</h3>
          </div>
          <button type="button" className="btnGhost" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {loading && <p className="muted">Loading login history…</p>}
          {error && <div className="adminError">{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <p className="muted">No login events recorded yet.</p>
          )}
          {!loading && !error && entries.length > 0 && (
            <>
              {selected && (
                <LocationMap
                  info={selected.location}
                  ip={selected.ip}
                  when={formatWhen(selected.occurredAt)}
                />
              )}
              <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>
                Click a row to show it on the map:
              </p>
              <table className="adminTable" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Location</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const isSelected = i === selectedIndex;
                    return (
                      <tr
                        key={`${e.occurredAt}-${i}`}
                        onClick={() => setSelectedIndex(i)}
                        style={{
                          cursor: "pointer",
                          background: isSelected ? "#eef2ff" : undefined,
                        }}
                      >
                        <td style={{ whiteSpace: "nowrap" }}>
                          {formatWhen(e.occurredAt)}
                        </td>
                        <td>{describeEvent(e.eventType)}</td>
                        <td>
                          <LocationLabel info={e.location} ip={e.ip} />
                        </td>
                        <td>
                          <small className="muted">
                            {describeUserAgent(e.userAgent)}
                          </small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
