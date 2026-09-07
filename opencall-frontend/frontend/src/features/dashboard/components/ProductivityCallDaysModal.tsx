// The rows behind a range's number.
//
// Clicking a total on a multi-day view used to hand its ticket ids to the
// Records table, which renders ONE report's rows — so a month's 2441 opened onto
// today's still-open calls and showed 30. This shows the call-days themselves,
// which is the only set that can match a number counted across many days.
import { useMemo, useState, type CSSProperties } from "react";
import type { ProductivityCallDayDetail } from "@opencall/shared";
import {
  displayDate,
  distinctCallCount,
  OUTCOME_LABELS,
  uniqueCallRows,
} from "../utils/productivityCallDayViews";

const cell: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #e2e8f0",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const headCell: CSSProperties = {
  ...cell,
  background: "#f1f5f9",
  fontWeight: 600,
  color: "#334155",
  position: "sticky",
  top: 0,
};

export function ProductivityCallDaysModal({
  title,
  callDays,
  loading,
  error,
  onClose,
}: Readonly<{
  title: string;
  callDays: readonly ProductivityCallDayDetail[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}>) {
  // Bookings first, because that is the number that was clicked. Landing on the
  // smaller unique count would recreate the very mismatch this replaces.
  const [view, setView] = useState<"bookings" | "calls">("bookings");
  const [search, setSearch] = useState("");

  const uniqueRows = useMemo(() => uniqueCallRows(callDays), [callDays]);
  const distinctCalls = useMemo(() => distinctCallCount(callDays), [callDays]);
  const query = search.trim().toLowerCase();

  const visibleBookings = useMemo(
    () =>
      callDays.filter(
        (callDay) =>
          !query ||
          [
            callDay.ticketId,
            callDay.engineer,
            callDay.customerName,
            callDay.woOtcCode,
          ].some((field) => field.toLowerCase().includes(query)),
      ),
    [callDays, query],
  );

  const visibleCalls = useMemo(
    () =>
      uniqueRows.filter(
        (row) =>
          !query ||
          [row.ticketId, row.engineer, row.customerName, row.woOtcCode].some(
            (field) => field.toLowerCase().includes(query),
          ),
      ),
    [uniqueRows, query],
  );

  const visibleCount =
    view === "bookings" ? visibleBookings.length : visibleCalls.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          width: "min(1400px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "260px" }}>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>
              {title}
            </div>
            {/* Both numbers, always. A reader shown only one of them has to guess
                whether the other is a correction — which is how "it shows
                duplicates" started. */}
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
              {loading
                ? "Loading the rows behind this number..."
                : `${callDays.length.toLocaleString()} day-bookings across ${distinctCalls.toLocaleString()} calls`}
            </div>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search WO, engineer, customer"
            style={{
              padding: "7px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "13px",
              minWidth: "220px",
            }}
          />

          <button
            type="button"
            onClick={() => setView(view === "bookings" ? "calls" : "bookings")}
            style={{
              padding: "7px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              background: "#f8fafc",
              fontSize: "13px",
              cursor: "pointer",
              minHeight: "34px",
            }}
          >
            {view === "bookings" ? "Show unique calls" : "Show every booking"}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              background: "#ffffff",
              fontSize: "13px",
              cursor: "pointer",
              minHeight: "34px",
            }}
          >
            Close
          </button>
        </div>

        {view === "calls" && (
          <div
            style={{
              padding: "8px 20px",
              background: "#fffbeb",
              borderBottom: "1px solid #fde68a",
              fontSize: "12px",
              color: "#92400e",
            }}
          >
            One row per call <strong>per engineer</strong> — a call reassigned
            mid-cycle appears once for each engineer booked on it, so these rows
            do not add up to the {distinctCalls.toLocaleString()} distinct calls.
          </div>
        )}

        <div style={{ overflow: "auto", flex: 1 }}>
          {error ? (
            <div style={{ padding: "24px", color: "#b91c1c", fontSize: "13px" }}>
              {error}
            </div>
          ) : loading ? (
            <div style={{ padding: "24px", color: "#64748b", fontSize: "13px" }}>
              Loading...
            </div>
          ) : view === "bookings" ? (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={headCell}>Date</th>
                  <th style={headCell}>WO / Ticket ID</th>
                  <th style={headCell}>Booking</th>
                  <th style={headCell}>Engineer</th>
                  <th style={headCell}>Region</th>
                  <th style={headCell}>Outcome</th>
                  <th style={headCell}>Customer</th>
                  <th style={headCell}>Location</th>
                  <th style={headCell}>Product</th>
                  <th style={headCell}>WO OTC Code</th>
                </tr>
              </thead>
              <tbody>
                {visibleBookings.map((callDay, index) => (
                  <tr
                    key={`${callDay.date}|${callDay.engineer}|${callDay.ticketId}|${index}`}
                    style={{ background: index % 2 ? "#f8fafc" : "#ffffff" }}
                  >
                    <td style={cell}>{displayDate(callDay.date)}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{callDay.ticketId}</td>
                    {/* Why the WO above repeats. Emphasised when it is one of
                        several, muted when the call was booked once. */}
                    <td
                      style={{
                        ...cell,
                        color: callDay.bookingCount > 1 ? "#b45309" : "#94a3b8",
                        fontWeight: callDay.bookingCount > 1 ? 600 : 400,
                      }}
                    >
                      {callDay.bookingIndex} of {callDay.bookingCount}
                    </td>
                    <td style={cell}>{callDay.engineer}</td>
                    <td style={cell}>{callDay.regionName}</td>
                    <td style={cell}>{OUTCOME_LABELS[callDay.bucket]}</td>
                    <td style={cell}>{callDay.customerName}</td>
                    <td style={cell}>{callDay.location}</td>
                    <td style={cell}>{callDay.product}</td>
                    <td style={cell}>{callDay.woOtcCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={headCell}>WO / Ticket ID</th>
                  <th style={headCell}>Times booked</th>
                  <th style={headCell}>Days attended</th>
                  <th style={headCell}>Engineer</th>
                  <th style={headCell}>Region</th>
                  <th style={headCell}>First booked</th>
                  <th style={headCell}>Last booked</th>
                  <th style={headCell}>Final outcome</th>
                  <th style={headCell}>Closed in cycle</th>
                  <th style={headCell}>Customer</th>
                </tr>
              </thead>
              <tbody>
                {visibleCalls.map((row, index) => (
                  <tr
                    key={`${row.engineer}|${row.ticketId}`}
                    style={{ background: index % 2 ? "#f8fafc" : "#ffffff" }}
                  >
                    <td style={{ ...cell, fontWeight: 600 }}>{row.ticketId}</td>
                    <td
                      style={{
                        ...cell,
                        fontWeight: row.timesBooked > 1 ? 600 : 400,
                        color: row.timesBooked > 1 ? "#b45309" : "#334155",
                      }}
                    >
                      {row.timesBooked}
                    </td>
                    <td style={cell}>{row.daysAttended}</td>
                    <td style={cell}>{row.engineer}</td>
                    <td style={cell}>{row.regionName}</td>
                    <td style={cell}>{displayDate(row.firstBooked)}</td>
                    <td style={cell}>{displayDate(row.lastBooked)}</td>
                    <td style={cell}>{OUTCOME_LABELS[row.finalOutcome]}</td>
                    <td style={cell}>{row.closedInCycle ? "Yes" : "No"}</td>
                    <td style={cell}>{row.customerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && visibleCount === 0 && (
            <div style={{ padding: "24px", color: "#64748b", fontSize: "13px" }}>
              {callDays.length === 0
                ? "No bookings in this period."
                : `Nothing matches "${search}".`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
