"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RTPL_STATUS_GROUPS, isScheduledStatus } from "@opencall/shared";
import { readSession, clearSession, type ClientSession } from "../../lib/session";
import {
  fetchVendorReport,
  fetchVendorAssignments,
  fetchVendorEngineers,
  updateVendorReportRow,
  type VendorCaseAssignment,
  type VendorEngineer,
  type VendorPermissionLevel,
} from "../../lib/vendorAccessApiClient";
import type { GeneratedReportResponse } from "../../lib/api/types";

type Row = GeneratedReportResponse["rows"][number];
type Tab = "my-cases" | "cases-summary" | "closed-cases" | "activity";

const TAB_LABEL: Record<Tab, string> = {
  "my-cases": "My Cases",
  "cases-summary": "Summary",
  "closed-cases": "Closed",
  activity: "Activity",
};

const MANUAL = "Manual Entry Required";

/** The fields a vendor may edit — same set the main Records Table exposes. */
const EDITABLE: Array<{ column: string; field: string; kind: "engineer" | "status" | "text" | "textarea" }> = [
  { column: "Engineer", field: "engineer", kind: "engineer" },
  { column: "RTPL status", field: "rtpl_status", kind: "status" },
  { column: "Evening status", field: "evening_rtpl_status", kind: "status" },
  { column: "Location", field: "location", kind: "text" },
  { column: "Segment", field: "segment", kind: "text" },
  { column: "WIP aging", field: "wip_aging", kind: "text" },
  { column: "Status Aging", field: "status_aging", kind: "text" },
  { column: "HP Owner Status", field: "hp_owner_status", kind: "text" },
  { column: "Part", field: "part", kind: "text" },
  { column: "RCA", field: "rca", kind: "textarea" },
  { column: "Current Remarks", field: "remarks", kind: "textarea" },
];

function out(row: Row): Record<string, unknown> {
  return row.output as Record<string, unknown>;
}
function cell(row: Row, column: string): string {
  const raw = String(out(row)[column] ?? "").trim();
  return raw === MANUAL ? "" : raw;
}
function isClosed(row: Row): boolean {
  return Boolean(row.carryForward?.closedSyntheticRow);
}

export default function VendorPortalPage() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [report, setReport] = useState<GeneratedReportResponse | null>(null);
  const [permission, setPermission] = useState<VendorPermissionLevel>("view");
  const [assignments, setAssignments] = useState<VendorCaseAssignment[]>([]);
  const [engineers, setEngineers] = useState<VendorEngineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("my-cases");
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<Row | null>(null);

  useEffect(() => {
    const s = readSession();
    // Vendors sign in through the main OpenCall login (which bounces them here).
    if (!s || s.user.role !== "VENDOR_ACCESS") {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  const reload = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [rep, asg, eng] = await Promise.all([
        fetchVendorReport(session.token),
        fetchVendorAssignments(session.token),
        fetchVendorEngineers(session.token).catch(() => []),
      ]);
      setReport(rep.report);
      setPermission(rep.permissionLevel);
      setAssignments(asg);
      setEngineers(eng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your cases");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grantedTabs = useMemo<Tab[]>(() => {
    const s = session?.user.vendorAccess?.sections ?? [];
    return (["my-cases", "cases-summary", "closed-cases", "activity"] as Tab[]).filter((t) => s.includes(t));
  }, [session]);

  useEffect(() => {
    if (grantedTabs.length > 0 && !grantedTabs.includes(tab)) setTab(grantedTabs[0]!);
  }, [grantedTabs, tab]);

  const rows = report?.rows ?? [];
  const openRows = rows.filter((r) => !isClosed(r));
  const closedRows = rows.filter(isClosed);

  const filteredMyCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openRows;
    return openRows.filter((r) =>
      ["Ticket ID", "Customer Name", "Work Location", "RTPL status", "Engineer"]
        .map((k) => String(out(r)[k] ?? "").toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [openRows, search]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const s = String(out(r)["RTPL status"] ?? "").trim() || "(blank)";
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function signOut() {
    clearSession();
    router.replace("/");
  }

  if (!session) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "#f1f5f9" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Vendor Portal</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {session.user.vendorAccess?.username} · {rows.length} assigned case{rows.length === 1 ? "" : "s"} · {permission === "update" ? "can update" : "view only"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void reload()} style={btnGhost}>↻ Refresh</button>
          <button type="button" onClick={signOut} style={{ ...btnGhost, color: "#dc2626" }}>Sign out</button>
        </div>
      </header>

      <nav style={{ display: "flex", gap: 4, padding: "10px 20px 0", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        {grantedTabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "none", background: "none",
            borderBottom: tab === t ? "2px solid #4f46e5" : "2px solid transparent",
            color: tab === t ? "#4f46e5" : "#6b7280", cursor: "pointer",
          }}>
            {TAB_LABEL[t]}{t === "closed-cases" && closedRows.length > 0 ? ` (${closedRows.length})` : ""}
          </button>
        ))}
      </nav>

      <main style={{ padding: 20, maxWidth: 1280, margin: "0 auto" }}>
        {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>Loading your cases…</div>
        ) : rows.length === 0 ? (
          <div style={card}>No cases have been assigned to you yet.</div>
        ) : tab === "my-cases" ? (
          <>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search my cases…" style={{ ...input, marginBottom: 12 }} />
            <CaseTable rows={filteredMyCases} canUpdate={permission === "update"} onEdit={setEditRow} />
          </>
        ) : tab === "closed-cases" ? (
          <CaseTable rows={closedRows} canUpdate={false} onEdit={setEditRow} />
        ) : tab === "cases-summary" ? (
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>My cases by status</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
              <Stat label="Total" value={rows.length} color="#4f46e5" />
              <Stat label="Open" value={openRows.length} color="#0891b2" />
              <Stat label="Closed" value={closedRows.length} color="#059669" />
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {statusCounts.map(([s, c]) => (
                <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", background: "#f9fafb", borderRadius: 7, fontSize: 13 }}>
                  <span>{s}</span><strong>{c}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Assignment activity</h3>
            {assignments.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>No activity yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {assignments.map((a) => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", background: "#f9fafb", borderRadius: 7, fontSize: 12.5 }}>
                    <span><strong>{a.ticketId || a.normalizedTicketId}</strong>{a.caseId ? ` · Case ${a.caseId}` : ""}</span>
                    <span style={{ color: "#6b7280" }}>assigned {new Date(a.assignedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {editRow && session && (
        <EditCaseModal
          token={session.token}
          row={editRow}
          engineers={engineers}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); void reload(); }}
        />
      )}
    </div>
  );
}

/** Records-table-style case table. Horizontally scrollable so all columns fit. */
function CaseTable({
  rows, canUpdate, onEdit,
}: Readonly<{ rows: Row[]; canUpdate: boolean; onEdit: (r: Row) => void }>) {
  if (rows.length === 0) return <div style={card}>No cases here.</div>;
  const cols = ["Ticket ID", "Customer Name", "Work Location", "Engineer", "RTPL status", "Evening status", "WIP aging", "Segment", "Part", "Current Remarks"];
  return (
    <div style={{ ...card, padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
        <thead>
          <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
            <th style={th}>#</th>
            {cols.map((c) => (<th key={c} style={th}>{c === "RTPL status" ? "Morning" : c === "Current Remarks" ? "Remarks" : c === "Work Location" ? "Region" : c}</th>))}
            {canUpdate && <th style={th}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.serialNo} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ ...td, color: "#9ca3af" }}>{i + 1}</td>
              {cols.map((c) => (
                <td key={c} style={c === "Ticket ID" ? { ...td, fontWeight: 600, color: "#1d4ed8" } : td}>
                  {cell(r, c) || "-"}
                </td>
              ))}
              {canUpdate && (
                <td style={td}>
                  {r.id ? (
                    <button type="button" onClick={() => onEdit(r)} style={btnSmall}>Update</button>
                  ) : (<span style={{ color: "#9ca3af" }}>—</span>)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Advanced edit modal — all records-table fields, engineer + status dropdowns. */
function EditCaseModal({
  token, row, engineers, onClose, onSaved,
}: Readonly<{
  token: string; row: Row; engineers: VendorEngineer[]; onClose: () => void; onSaved: () => void;
}>) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE.map((f) => [f.field, cell(row, f.column)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string, v: string) => setValues((c) => ({ ...c, [field]: v }));
  const engineerNames = engineers.map((e) => e.engineerName).filter(Boolean);

  async function save() {
    const rowId = row.id;
    if (!rowId) { setError("This case cannot be updated."); return; }

    // Only send changed fields, so a save never clobbers an untouched field.
    const patch: Record<string, string | null> = {};
    for (const f of EDITABLE) {
      const next = (values[f.field] ?? "").trim();
      if (next !== cell(row, f.column)) patch[f.field] = next === "" ? null : next;
    }
    if (Object.keys(patch).length === 0) { onClose(); return; }

    // Mirror the server guard: scheduling requires an engineer.
    const settingScheduled =
      isScheduledStatus(patch["rtpl_status"] ?? undefined) ||
      isScheduledStatus(patch["evening_rtpl_status"] ?? undefined);
    if (settingScheduled) {
      const eng = ("engineer" in patch ? patch["engineer"] ?? "" : cell(row, "Engineer")).trim();
      if (!eng || eng === MANUAL) { setError("Assign an engineer before scheduling."); return; }
    }

    setSaving(true); setError(null);
    try {
      await updateVendorReportRow({ token, rowId, values: patch as never });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setSaving(false);
    }
  }

  return (
    <div onClick={() => !saving && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", zIndex: 100, padding: 16, overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 22, width: 520, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h3 style={{ margin: "0 0 2px", fontSize: 16 }}>Update case</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#6b7280" }}>
          {String(out(row)["Ticket ID"] ?? "")} · {String(out(row)["Customer Name"] ?? "")} · {String(out(row)["Work Location"] ?? "")}
        </p>

        {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {EDITABLE.map((f) => {
            const full = f.kind === "textarea";
            const v = values[f.field] ?? "";
            return (
              <label key={f.field} style={{ display: "block", gridColumn: full ? "1 / -1" : "auto" }}>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{f.column}</span>
                {f.kind === "engineer" ? (
                  <select value={v} onChange={(e) => set(f.field, e.target.value)} style={input}>
                    <option value="">— none —</option>
                    {v && !engineerNames.includes(v) && <option value={v}>{v}</option>}
                    {engineerNames.map((n) => (<option key={n} value={n}>{n}</option>))}
                  </select>
                ) : f.kind === "status" ? (
                  <select value={v} onChange={(e) => set(f.field, e.target.value)} style={input}>
                    <option value="">— none —</option>
                    {v && !RTPL_STATUS_GROUPS.some((g) => g.options.includes(v as never)) && <option value={v}>{v}</option>}
                    {RTPL_STATUS_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.options.map((o) => (<option key={o} value={o}>{o}</option>))}
                      </optgroup>
                    ))}
                  </select>
                ) : f.kind === "textarea" ? (
                  <textarea rows={2} value={v} onChange={(e) => set(f.field, e.target.value)} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
                ) : (
                  <input value={v} onChange={(e) => set(f.field, e.target.value)} style={input} />
                )}
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} style={{ ...btnGhost, background: "#4f46e5", color: "#fff", border: "none" }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: Readonly<{ label: string; value: number; color: string }>) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, fontSize: 13, color: "#6b7280" };
const th: React.CSSProperties = { padding: "9px 12px", fontWeight: 700, color: "#374151" };
const td: React.CSSProperties = { padding: "8px 12px", color: "#1f2937" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" };
const btnGhost: React.CSSProperties = { padding: "7px 12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer" };
const btnSmall: React.CSSProperties = { padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4f46e5", cursor: "pointer" };
