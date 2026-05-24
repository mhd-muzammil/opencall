"use client";

import { useEffect, useMemo, useState } from "react";
import { listAdminRegions, type AdminRegion } from "../../../lib/adminApiClient";
import {
  listActivity,
  type ActivityEventType,
  type ActivityRow,
} from "../../../lib/monitoringApiClient";
import { readSession, type ClientSession } from "../../../lib/session";

const EVENT_TYPES: ActivityEventType[] = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "USER_CREATED",
  "USER_PROFILE_UPDATED",
  "USER_ROLE_CHANGED",
  "USER_REGION_REASSIGNED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "UPLOAD_CREATED",
  "REPORT_GENERATED",
  "REPORT_ROW_EDITED",
];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (value === null || value === undefined) return `${key}: —`;
      if (typeof value === "object") return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${String(value)}`;
    })
    .join(" · ");
}

function eventTone(eventType: ActivityEventType, status: string): string {
  if (status === "FAILURE") return "bad";
  if (eventType === "LOGIN_SUCCESS" || eventType === "USER_CREATED" || eventType === "REPORT_GENERATED") return "good";
  if (eventType === "USER_DEACTIVATED" || eventType === "LOGIN_FAILED") return "bad";
  if (eventType === "REPORT_ROW_EDITED" || eventType === "UPLOAD_CREATED") return "neutral";
  return "neutral";
}

export default function AdminActivityPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterRegion, setFilterRegion] = useState<string>("");
  const [filterEvent, setFilterEvent] = useState<ActivityEventType | "">("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    listAdminRegions(session.token)
      .then(setRegions)
      .catch(() => setRegions([]));
  }, [session]);

  function reload() {
    if (!session) return;
    setBusy(true);
    setError(null);
    listActivity(session.token, {
      ...(filterRegion ? { regionId: filterRegion } : {}),
      ...(filterEvent ? { eventType: filterEvent } : {}),
      ...(filterFrom ? { from: new Date(filterFrom).toISOString() } : {}),
      ...(filterTo ? { to: new Date(filterTo).toISOString() } : {}),
      limit,
      offset,
    })
      .then((result) => {
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load activity"))
      .finally(() => setBusy(false));
  }

  useEffect(reload, [session, filterRegion, filterEvent, filterFrom, filterTo, offset, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  const eventLabel = useMemo(() => {
    const map: Record<string, string> = {
      LOGIN_SUCCESS: "Login",
      LOGIN_FAILED: "Login failed",
      PASSWORD_CHANGED: "Password changed",
      PASSWORD_RESET: "Password reset (admin)",
      USER_CREATED: "User created",
      USER_PROFILE_UPDATED: "User profile updated",
      USER_ROLE_CHANGED: "Role changed",
      USER_REGION_REASSIGNED: "Region reassigned",
      USER_DEACTIVATED: "User deactivated",
      USER_REACTIVATED: "User reactivated",
      UPLOAD_CREATED: "Upload",
      REPORT_GENERATED: "Report generated",
      REPORT_ROW_EDITED: "Row edited",
    };
    return (type: ActivityEventType) => map[type] ?? type;
  }, []);

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h2>Activity feed</h2>
          <small className="muted">
            Every login, upload, report, and row edit is recorded with actor and region.
          </small>
        </div>
        <div className="adminPageActions">
          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setOffset(0);
              reload();
            }}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="adminFilters">
        <label className="adminField">
          <span>Region</span>
          <select
            value={filterRegion}
            onChange={(e) => {
              setOffset(0);
              setFilterRegion(e.target.value);
            }}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>Event</span>
          <select
            value={filterEvent}
            onChange={(e) => {
              setOffset(0);
              setFilterEvent(e.target.value as ActivityEventType | "");
            }}
          >
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {eventLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>From</span>
          <input
            type="datetime-local"
            value={filterFrom}
            onChange={(e) => {
              setOffset(0);
              setFilterFrom(e.target.value);
            }}
          />
        </label>
        <label className="adminField">
          <span>To</span>
          <input
            type="datetime-local"
            value={filterTo}
            onChange={(e) => {
              setOffset(0);
              setFilterTo(e.target.value);
            }}
          />
        </label>
      </div>

      {error && <div className="adminError">{error}</div>}

      <div className="adminTableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Region</th>
              <th>Event</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {busy ? "Loading…" : "No activity for the current filters."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.occurredAt)}</td>
                <td>
                  <strong>{row.actorUsername ?? row.actorEmail ?? "—"}</strong>
                  {row.actorRole && (
                    <span className={`adminTag ${row.actorRole === "SUPER_ADMIN" ? "neutral" : ""}`}>
                      {row.actorRole === "SUPER_ADMIN" ? "Super" : "Region"}
                    </span>
                  )}
                </td>
                <td>{row.regionName ? `${row.regionName} (${row.regionCode})` : "—"}</td>
                <td>{eventLabel(row.eventType)}</td>
                <td className="muted" style={{ maxWidth: 480 }}>{metadataPreview(row.metadata)}</td>
                <td>
                  <span className={`adminTag ${eventTone(row.eventType, row.status)}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminPaginator">
        <span className="muted">
          {total} events · page {currentPage} of {totalPages}
        </span>
        <div className="adminPaginatorButtons">
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || currentPage >= totalPages}
            onClick={() => setOffset(offset + limit)}
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
