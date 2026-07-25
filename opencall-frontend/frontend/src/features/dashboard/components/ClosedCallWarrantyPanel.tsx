"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ClosedCallWarrantyListRow,
  ClosedCallWarrantyStatus,
} from "@opencall/shared";
import { fetchClosedCallWarrantyList } from "../../../lib/warrantyApiClient";

/**
 * Self-contained "Warranty Lookup" list. For every closed call (from the latest report) it
 * shows the HP warranty status of its device serial, resolved from the permanent warranty
 * cache. Uncached serials are enqueued automatically on the backend (capped ~100/day) and
 * fill in over time as the warranty worker runs — the list refreshes itself every 45s.
 *
 * Needs only a token: the closed-call list + warranty are computed server-side, so this can
 * live anywhere (it sits in the Warranty Lookup section).
 */

// Poll fast while serials are still being looked up so a resolved one shows
// within seconds; back off once nothing is in flight to keep the panel cheap.
const ACTIVE_REFRESH_MS = 7_000;
const IDLE_REFRESH_MS = 60_000;

const STATUS_META: Record<
  ClosedCallWarrantyStatus,
  { label: string; bg: string; fg: string }
> = {
  IN_WARRANTY: { label: "✅ In warranty", bg: "#dcfce7", fg: "#166534" },
  OUT_OF_WARRANTY: { label: "❌ Out of warranty", bg: "#fee2e2", fg: "#991b1b" },
  NOT_FOUND: { label: "❓ Not found", bg: "#f3f4f6", fg: "#4b5563" },
  CHECKING: { label: "⏳ Checking…", bg: "#dbeafe", fg: "#1e40af" },
  NO_SERIAL: { label: "— No serial", bg: "#f3f4f6", fg: "#9ca3af" },
  NOT_CHECKED: { label: "· Not checked", bg: "#f9fafb", fg: "#9ca3af" },
};

const SUMMARY_ORDER: ClosedCallWarrantyStatus[] = [
  "IN_WARRANTY",
  "OUT_OF_WARRANTY",
  "NOT_FOUND",
  "CHECKING",
  "NO_SERIAL",
  "NOT_CHECKED",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  const [y, m, d] = parts;
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Today in IST (YYYY-MM-DD) — the reference point for "days left". */
function istTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Whole days from today (IST) until the ISO date; negative when already past. */
function daysUntil(iso: string, todayIso: string): number {
  const end = Date.parse(`${iso}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(today)) return 0;
  return Math.round((end - today) / 86_400_000);
}

function metaFor(status: ClosedCallWarrantyStatus) {
  return STATUS_META[status] ?? STATUS_META.NOT_CHECKED;
}

/** "X days left" for in-warranty, "Expired X days ago" for out-of-warranty, else "—". */
function WarrantyLeftCell({
  row,
  todayIso,
}: {
  row: ClosedCallWarrantyListRow;
  todayIso: string;
}) {
  if (
    !row.endDate ||
    (row.status !== "IN_WARRANTY" && row.status !== "OUT_OF_WARRANTY")
  ) {
    return <span style={{ color: "#9ca3af" }}>—</span>;
  }
  const d = daysUntil(row.endDate, todayIso);
  if (d >= 0) {
    return (
      <span style={{ color: "#166534", fontWeight: 600, whiteSpace: "nowrap" }}>
        {d.toLocaleString()} day{d === 1 ? "" : "s"} left
      </span>
    );
  }
  const past = Math.abs(d);
  return (
    <span style={{ color: "#991b1b", fontWeight: 600, whiteSpace: "nowrap" }}>
      Expired {past.toLocaleString()} day{past === 1 ? "" : "s"} ago
    </span>
  );
}

function StatusBadge({ status }: { status: ClosedCallWarrantyStatus }) {
  const meta = metaFor(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: meta.bg,
        color: meta.fg,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function ClosedCallWarrantyPanel({
  token,
}: Readonly<{ token: string | null | undefined }>) {
  const [rows, setRows] = useState<ClosedCallWarrantyListRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const firstLoadDone = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      if (!firstLoadDone.current) setLoading(true);
      // Re-poll fast unless the fetch shows nothing left in flight.
      let nextDelay = ACTIVE_REFRESH_MS;
      try {
        const resp = await fetchClosedCallWarrantyList(token);
        if (cancelled) return;
        setAvailable(resp.available);
        setDailyRemaining(resp.dailyRemaining);
        setRows(resp.rows);
        setLastError(null);
        // Only rows still being looked up will change soon; once none remain,
        // back off (NOT_CHECKED rows won't move until a later day's budget).
        const inFlight = resp.rows.some((r) => r.status === "CHECKING");
        nextDelay = inFlight ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
      } catch (e) {
        if (!cancelled) setLastError(e instanceof Error ? e.message : "Failed to load warranty");
      } finally {
        if (!cancelled) {
          setLoading(false);
          firstLoadDone.current = true;
        }
      }
      if (!cancelled) {
        timer = setTimeout(() => void load(), nextDelay);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  const counts = useMemo(() => {
    const c: Record<ClosedCallWarrantyStatus, number> = {
      IN_WARRANTY: 0,
      OUT_OF_WARRANTY: 0,
      NOT_FOUND: 0,
      CHECKING: 0,
      NO_SERIAL: 0,
      NOT_CHECKED: 0,
    };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  // Click a summary chip to show only that status; click it again (or "Show all") to clear.
  const [activeFilter, setActiveFilter] = useState<ClosedCallWarrantyStatus | null>(null);
  const visibleRows = useMemo(
    () => (activeFilter ? rows.filter((r) => r.status === activeFilter) : rows),
    [rows, activeFilter],
  );
  const todayIso = istTodayIso();

  return (
    <section
      style={{
        marginTop: 24,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#111827" }}>🛡️ Closed-call warranty</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            HP warranty status for every closed call, by device serial. New serials are checked
            automatically (~100/day) and the list refreshes itself.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>
          {loading && !firstLoadDone.current
            ? "Loading…"
            : activeFilter
              ? `${visibleRows.length} of ${rows.length} closed calls`
              : `${rows.length} closed calls`}
          {dailyRemaining !== null && (
            <>
              <br />
              Today&apos;s lookup budget left: <strong>{dailyRemaining}</strong>
            </>
          )}
        </div>
      </div>

      {!available && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 13,
          }}
        >
          Warranty lookup is not enabled on this server (run <code>pnpm migrate:warranty</code>{" "}
          and start the warranty worker).
        </div>
      )}

      {lastError && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>{lastError}</div>
      )}

      {/* Summary chips — click one to filter the table to that status. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "14px 0" }}>
        {SUMMARY_ORDER.map((status) => {
          const meta = metaFor(status);
          const isActive = activeFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setActiveFilter(isActive ? null : status)}
              title={isActive ? "Click to show all" : `Show only "${meta.label}"`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: meta.bg,
                color: meta.fg,
                border: isActive ? `2px solid ${meta.fg}` : "2px solid transparent",
                cursor: "pointer",
                boxShadow: isActive ? `0 0 0 2px ${meta.bg}` : "none",
              }}
            >
              {meta.label}
              <strong>{counts[status] ?? 0}</strong>
            </button>
          );
        })}
        {activeFilter && (
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: "#111827",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕ Show all
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto", borderRadius: 8, border: "1px solid #f0f0f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 1 }}>
              {["Ticket ID", "Customer", "Serial", "Region", "Warranty", "Start date", "End date", "Warranty left"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontWeight: 700,
                    color: "#374151",
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                  {loading
                    ? "Loading closed calls…"
                    : activeFilter
                      ? "No closed calls with this warranty status."
                      : "No closed calls found."}
                </td>
              </tr>
            )}
            {visibleRows.map((r, i) => (
              <tr key={`${r.ticketId}-${i}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                  {r.ticketId}
                </td>
                <td style={{ padding: "8px 12px", color: "#374151" }}>{r.customer}</td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {r.serial || "—"}
                </td>
                <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>{r.region}</td>
                <td style={{ padding: "8px 12px" }}>
                  <StatusBadge status={r.status} />
                </td>
                <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                  {fmtDate(r.startDate)}
                </td>
                <td style={{ padding: "8px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                  {fmtDate(r.endDate)}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <WarrantyLeftCell row={r} todayIso={todayIso} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
