import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getRenewalPipeline,
  saveRenewalLead,
  RENEWAL_LEAD_STATUSES,
  type RenewalLeadRow,
  type RenewalLeadStatus,
  type RenewalPipelineSummary,
  type RenewalWindow,
} from "../../../lib/renewalApiClient";

/**
 * AMC / Warranty Renewal Pipeline — the sales side of the warranty data we already collect.
 *
 * Every lead is DERIVED server-side from `hp_warranty_cache` (serials HP has already been
 * asked about) joined to the most recent call that carried the same serial. This page never
 * triggers an HP lookup, so it adds no load to the warranty worker; the list simply grows as
 * that cache fills. The only thing saved back is the follow-up state of a lead.
 */

const EMPTY_SUMMARY: RenewalPipelineSummary = {
  total: 0,
  expiring30: 0,
  expiring60: 0,
  expiring90: 0,
  expired: 0,
  byStatus: {
    New: 0,
    Contacted: 0,
    Quoted: 0,
    Won: 0,
    Lost: 0,
    "Not Interested": 0,
  },
};

const WINDOW_CHIPS: ReadonlyArray<{
  key: RenewalWindow;
  label: string;
  countOf: (summary: RenewalPipelineSummary) => number;
}> = [
  { key: "EXPIRING_30", label: "Next 30 days", countOf: (s) => s.expiring30 },
  { key: "EXPIRING_60", label: "Next 60 days", countOf: (s) => s.expiring60 },
  { key: "EXPIRING_90", label: "Next 90 days", countOf: (s) => s.expiring90 },
  { key: "EXPIRED", label: "Already expired", countOf: (s) => s.expired },
  { key: "ALL", label: "All", countOf: (s) => s.total },
];

const STATUS_COLORS: Record<RenewalLeadStatus, { bg: string; fg: string }> = {
  New: { bg: "#eef2ff", fg: "#3730a3" },
  Contacted: { bg: "#e0f2fe", fg: "#075985" },
  Quoted: { bg: "#fef3c7", fg: "#92400e" },
  Won: { bg: "#dcfce7", fg: "#166534" },
  Lost: { bg: "#fee2e2", fg: "#991b1b" },
  "Not Interested": { bg: "#f3f4f6", fg: "#4b5563" },
};

/** Colour + wording for the "warranty left" cell. */
function daysLeftDisplay(daysLeft: number): { text: string; color: string } {
  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return { text: `Expired ${ago} day${ago === 1 ? "" : "s"} ago`, color: "#b91c1c" };
  }
  if (daysLeft === 0) return { text: "Expires today", color: "#b91c1c" };
  if (daysLeft <= 30) return { text: `${daysLeft} days left`, color: "#b91c1c" };
  if (daysLeft <= 60) return { text: `${daysLeft} days left`, color: "#b45309" };
  return { text: `${daysLeft} days left`, color: "#15803d" };
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Same CSV-with-BOM download the report export uses — opens straight into Excel. */
function downloadLeadsAsCsv(rows: readonly RenewalLeadRow[]): void {
  const header = [
    "Customer",
    "Account",
    "Serial",
    "Product",
    "Product Number",
    "Region",
    "Warranty Start",
    "Warranty End",
    "Days Left",
    "Contact",
    "Email",
    "Last Ticket",
    "Last Seen",
    "Status",
    "Owner",
    "Remarks",
  ];
  const lines = [header.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.customerName,
        row.accountName,
        row.serial,
        row.product,
        row.productNumber ?? "",
        row.regionName,
        row.startDate ?? "",
        row.endDate,
        row.daysLeft,
        row.contact,
        row.customerMail,
        row.ticketId,
        row.lastSeenDate ?? "",
        row.status,
        row.owner,
        row.remarks,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `renewal-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface EditState {
  row: RenewalLeadRow;
  status: RenewalLeadStatus;
  owner: string;
  remarks: string;
}

export function RenewalPipelinePage({ token }: Readonly<{ token: string }>) {
  const [window_, setWindow] = useState<RenewalWindow>("EXPIRING_90");
  const [statusFilter, setStatusFilter] = useState<RenewalLeadStatus | "ALL">("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RenewalLeadRow[]>([]);
  const [summary, setSummary] = useState<RenewalPipelineSummary>(EMPTY_SUMMARY);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRenewalPipeline(token, {
        window: window_,
        status: statusFilter,
        search,
      });
      setRows(res.rows);
      setSummary(res.summary);
      setAvailable(res.available);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load the renewal pipeline",
      );
    } finally {
      setLoading(false);
    }
  }, [token, window_, statusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!edit) return;
    setSaving(true);
    try {
      const saved = await saveRenewalLead(token, {
        serial: edit.row.serial,
        status: edit.status,
        owner: edit.owner,
        remarks: edit.remarks,
      });
      // Patch the row in place so the table does not flash while the list reloads.
      setRows((current) =>
        current.map((row) =>
          row.serial === saved.serial
            ? {
                ...row,
                status: saved.status,
                owner: saved.owner,
                remarks: saved.remarks,
                updatedAt: saved.updatedAt,
              }
            : row,
        ),
      );
      setEdit(null);
      setMessage(`Saved ${saved.serial} → ${saved.status}`);
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save the lead");
    } finally {
      setSaving(false);
    }
  }

  const hotCount = useMemo(
    () => rows.filter((row) => row.daysLeft >= 0 && row.daysLeft <= 30).length,
    [rows],
  );

  const cellStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-color, #eef0f3)",
    whiteSpace: "nowrap",
  };
  const headStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontWeight: 700,
    textAlign: "left",
    borderBottom: "1px solid var(--border-color, #e5e7eb)",
    background: "var(--th-bg, #f3f4f6)",
    whiteSpace: "nowrap",
  };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: "999px",
    border: `1px solid ${active ? "#2563eb" : "#d1d5db"}`,
    background: active ? "#2563eb" : "#ffffff",
    color: active ? "#ffffff" : "#374151",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    // `.panel` is a CSS grid whose items default to `min-width: auto`, so without an
    // explicit `minWidth: 0` this section refuses to shrink below the table's intrinsic
    // width — the panel widens instead and the WHOLE PAGE scrolls sideways (taking the
    // top bar with it) rather than the table's own scroll container.
    <section style={{ padding: "8px 4px", minWidth: 0, maxWidth: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
          minWidth: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            Renewal Pipeline
          </h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
            Customers whose HP warranty is ending — AMC renewal leads built from warranty
            data we have already looked up. No new HP lookups are triggered here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadLeadsAsCsv(rows)}
          disabled={rows.length === 0}
          style={{
            padding: "8px 14px",
            minHeight: "36px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            background: rows.length === 0 ? "#f3f4f6" : "#ffffff",
            color: rows.length === 0 ? "#9ca3af" : "#374151",
            cursor: rows.length === 0 ? "not-allowed" : "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          Export ({rows.length})
        </button>
      </div>

      {!available ? (
        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            fontSize: "13px",
            color: "#92400e",
          }}
        >
          The renewal pipeline is not set up yet. Run <code>pnpm migrate:renewal-leads</code>{" "}
          on the API, and make sure the HP warranty subsystem has been migrated — leads are
          built from warranty lookups that have already been cached.
        </div>
      ) : null}

      {/* Window chips — counts are for everything visible to this user, so they stay
          stable while the table below is narrowed. */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        {WINDOW_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setWindow(chip.key)}
            style={chipStyle(window_ === chip.key)}
          >
            {chip.label} · {chip.countOf(summary)}
          </button>
        ))}
      </div>

      {/* Follow-up status chips. */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "12px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          style={chipStyle(statusFilter === "ALL")}
        >
          All statuses
        </button>
        {RENEWAL_LEAD_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            style={chipStyle(statusFilter === status)}
          >
            {status} · {summary.byStatus[status]}
          </button>
        ))}
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search customer, serial, contact…"
          style={{
            marginLeft: "auto",
            padding: "7px 12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontSize: "13px",
            minWidth: "240px",
          }}
        />
      </div>

      {message ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            fontSize: "13px",
            color: "#075985",
          }}
        >
          {message}
        </div>
      ) : null}

      {hotCount > 0 ? (
        <div style={{ marginBottom: "10px", fontSize: "12px", color: "#b91c1c", fontWeight: 600 }}>
          {hotCount} lead{hotCount === 1 ? "" : "s"} expiring within 30 days — contact these
          first.
        </div>
      ) : null}

      {/* The ONLY thing allowed to scroll sideways. `minWidth: 0` keeps this container
          shrinkable so the overflow happens here and never at page level. */}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "10px",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={headStyle}>Customer</th>
              <th style={headStyle}>Serial</th>
              <th style={headStyle}>Product</th>
              <th style={headStyle}>Region</th>
              <th style={headStyle}>Warranty start</th>
              <th style={headStyle}>Warranty end</th>
              <th style={headStyle}>Warranty left</th>
              <th style={headStyle}>Contact</th>
              <th style={headStyle}>Status</th>
              <th style={headStyle}>Owner</th>
              <th style={headStyle}>Last seen</th>
              <th style={headStyle} />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td style={{ ...cellStyle, textAlign: "center" }} colSpan={12}>
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td
                  style={{ ...cellStyle, textAlign: "center", color: "#6b7280" }}
                  colSpan={12}
                >
                  {available
                    ? "No renewal leads in this window yet. The list fills as the warranty worker caches more serials."
                    : "Renewal pipeline not set up."}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const left = daysLeftDisplay(row.daysLeft);
              const statusColor = STATUS_COLORS[row.status];
              return (
                <tr key={row.serial}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600 }}>{row.customerName || "-"}</div>
                    {row.accountName && row.accountName !== row.customerName ? (
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>
                        {row.accountName}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: "monospace" }}>{row.serial}</td>
                  <td style={cellStyle}>{row.product || "-"}</td>
                  <td style={cellStyle}>{row.regionName || "-"}</td>
                  <td style={cellStyle}>{row.startDate ?? "-"}</td>
                  <td style={cellStyle}>{row.endDate}</td>
                  <td style={{ ...cellStyle, color: left.color, fontWeight: 600 }}>
                    {left.text}
                  </td>
                  <td style={cellStyle}>
                    <div>{row.contact || "-"}</div>
                    {row.customerMail ? (
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>
                        {row.customerMail}
                      </div>
                    ) : null}
                  </td>
                  <td style={cellStyle}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "999px",
                        background: statusColor.bg,
                        color: statusColor.fg,
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={cellStyle}>{row.owner || "-"}</td>
                  <td style={cellStyle}>
                    <div>{row.lastSeenDate ?? "-"}</div>
                    {row.ticketId ? (
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>{row.ticketId}</div>
                    ) : null}
                  </td>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      onClick={() =>
                        setEdit({
                          row,
                          status: row.status,
                          owner: row.owner,
                          remarks: row.remarks,
                        })
                      }
                      style={{
                        padding: "4px 12px",
                        minHeight: "28px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        color: "#374151",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Follow up
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Portalled to <body>: `.panel` sets `backdrop-filter`, which makes it a containing
          block for fixed-position descendants — an inline modal would be positioned against
          the panel instead of the viewport. Same approach as QuotationsPage. */}
      {edit
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Update renewal lead"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => {
            if (!saving) setEdit(null);
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              width: "min(520px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: 700 }}>
              {edit.row.customerName || edit.row.serial}
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#6b7280" }}>
              {edit.row.serial} · {edit.row.product || "Unknown product"} · warranty ends{" "}
              {edit.row.endDate} ({daysLeftDisplay(edit.row.daysLeft).text})
            </p>

            <label
              style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}
            >
              Status
            </label>
            <select
              value={edit.status}
              onChange={(event) =>
                setEdit({ ...edit, status: event.target.value as RenewalLeadStatus })
              }
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              {RENEWAL_LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <label
              style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}
            >
              Owner (who is following this up)
            </label>
            <input
              value={edit.owner}
              onChange={(event) => setEdit({ ...edit, owner: event.target.value })}
              placeholder="Name"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            />

            <label
              style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}
            >
              Remarks
            </label>
            <textarea
              value={edit.remarks}
              onChange={(event) => setEdit({ ...edit, remarks: event.target.value })}
              rows={4}
              placeholder="What happened on the last call?"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
                marginBottom: "16px",
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setEdit(null)}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #2563eb",
                  background: saving ? "#93c5fd" : "#2563eb",
                  color: "#ffffff",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
    </section>
  );
}
