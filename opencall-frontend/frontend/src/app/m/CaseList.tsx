"use client";

import { useMemo, useState } from "react";
import type { GeneratedReportResponse } from "../../lib/api/types";
import type { ClientSession } from "../../lib/session";
import { EditCaseSheet } from "./EditCaseSheet";

type Row = GeneratedReportResponse["rows"][number];

function val(row: Row, key: string): string {
  return String((row.output as Record<string, unknown>)[key] ?? "").trim();
}

/** Same rule as the web: view-only special-access credentials cannot edit rows. */
function canEditRows(session: ClientSession | null): boolean {
  if (!session) return false;
  if (session.user.role !== "SPECIAL_ACCESS") return true;
  return session.user.specialAccess?.permissionLevel === "edit";
}

/**
 * Shared mobile case list: search + compact rows + a detail sheet. Used by both the
 * Records and Closed Calls screens, which differ only in which rows they pass in.
 */
export function CaseList({
  rows,
  emptyText,
  session = null,
  onSaved,
}: Readonly<{
  rows: Row[];
  emptyText: string;
  /** Supplying a session enables the Edit action (subject to the permission rule). */
  session?: ClientSession | null;
  onSaved?: () => void;
}>) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const out = r.output as Record<string, unknown>;
      return [
        "Ticket ID",
        "Case ID",
        "Customer Name",
        "Engineer",
        "RTPL status",
        "Flex Status",
        "Location",
        "Part",
      ].some((k) => String(out[k] ?? "").toLowerCase().includes(q));
    });
  }, [rows, search]);

  // Render a bounded slice: phones choke long before 2,000 DOM rows.
  const [limit, setLimit] = useState(50);
  const visible = filtered.slice(0, limit);

  return (
    <>
      <input
        className="mSearch"
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(50);
        }}
        placeholder="Search ticket, customer, engineer…"
        style={{ marginBottom: 12 }}
      />

      <div className="mMuted" style={{ margin: "0 2px 10px" }}>
        {filtered.length.toLocaleString()} {filtered.length === 1 ? "case" : "cases"}
        {filtered.length > visible.length ? ` · showing ${visible.length}` : ""}
      </div>

      {visible.length === 0 ? (
        <div className="mCard">
          <div className="mMuted">{search ? `No match for "${search}"` : emptyText}</div>
        </div>
      ) : (
        <div className="mList">
          {visible.map((row) => {
            const status = val(row, "RTPL status") || val(row, "Flex Status");
            const aging = val(row, "WIP aging");
            return (
              <button
                key={row.id ?? row.serialNo}
                type="button"
                className="mRow"
                onClick={() => setSelected(row)}
              >
                <div className="mRow__top">
                  <span className="mRow__title">{val(row, "Ticket ID") || "—"}</span>
                  {aging && <span className="mChip">{aging}d</span>}
                </div>
                <div className="mRow__meta">
                  {val(row, "Customer Name") || "No customer"}
                  {status ? ` · ${status}` : ""}
                  <br />
                  {val(row, "Engineer") || "Unassigned"}
                  {val(row, "Location") ? ` · ${val(row, "Location")}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length > visible.length && (
        <button
          type="button"
          className="mBtn mBtn--ghost"
          style={{ marginTop: 12 }}
          onClick={() => setLimit((l) => l + 50)}
        >
          Load more
        </button>
      )}

      {selected && (
        <CaseSheet
          row={selected}
          canEdit={canEditRows(session)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {editing && session && (
        <EditCaseSheet
          row={editing}
          session={session}
          onClose={() => setEditing(null)}
          onSaved={() => onSaved?.()}
        />
      )}
    </>
  );
}

/** Bottom sheet showing every populated field of the selected case. */
function CaseSheet({
  row,
  canEdit,
  onEdit,
  onClose,
}: Readonly<{
  row: Row;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}>) {
  const entries = Object.entries(row.output as Record<string, unknown>).filter(
    ([, v]) => String(v ?? "").trim() !== "",
  );

  return (
    <div className="mSheetBackdrop" onClick={onClose}>
      <div className="mSheet" onClick={(e) => e.stopPropagation()}>
        <div className="mSheet__grip" />
        <div className="mSheet__title">{val(row, "Ticket ID") || "Case detail"}</div>

        <div style={{ display: "grid", gap: 10 }}>
          {entries.map(([key, value]) => (
            <div key={key}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--m-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                }}
              >
                {key}
              </div>
              <div style={{ fontSize: 14, marginTop: 2, wordBreak: "break-word" }}>
                {String(value)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" className="mBtn mBtn--ghost" onClick={onClose}>
            Close
          </button>
          {canEdit && (
            <button type="button" className="mBtn" onClick={onEdit}>
              ✎ Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
