"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedReportResponse } from "../../../lib/api/types";
import {
  assignVendorCases,
  createVendorAccess,
  deleteVendorAccess,
  getVendorAccessOptions,
  listVendorAccess,
  listVendorAssignments,
  resetVendorAccessPassword,
  unassignVendorCase,
  updateVendorAccess,
  type VendorAccessListItem,
  type VendorAccessOptions,
  type VendorCaseAssignment,
  type VendorPermissionLevel,
} from "../../../lib/vendorAccessApiClient";

type Row = GeneratedReportResponse["rows"][number];

/** Mirrors backend getNormalizedTicketKey, for the "already assigned" hint. */
function normTicket(value: unknown): string {
  const s = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "");
  const m = /^WO0*(\d+)$/.exec(s);
  if (m?.[1]) return m[1].replace(/^0+(?=\d)/, "");
  return s;
}

/**
 * Vendor Dashboard — the single, SEPARATE home for everything vendor-related: create
 * vendor logins, grant views/permission, ASSIGN CASES (from a case table) and MONITOR each
 * vendor's cases. Deliberately NOT part of the OpenCall Records Table.
 */
export function VendorDashboard({
  token, report,
}: Readonly<{ token: string; report: GeneratedReportResponse | null }>) {
  const [options, setOptions] = useState<VendorAccessOptions | null>(null);
  const [vendors, setVendors] = useState<VendorAccessListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadVendors = useCallback(async () => {
    setVendors(await listVendorAccess(token));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [opts, list] = await Promise.all([
          getVendorAccessOptions(token),
          listVendorAccess(token),
        ]);
        if (cancelled) return;
        setOptions(opts);
        setVendors(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="vendorDashboard" style={{ padding: "8px 4px" }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Vendor Dashboard</h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
          Create vendors, assign cases and monitor them here. Vendors log in at{" "}
          <strong>/vendor</strong> and see only their assigned cases.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {options && (
            <CreateVendorForm token={token} options={options} onCreated={() => void reloadVendors()} onError={setError} />
          )}
          <VendorList vendors={vendors} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {selected && options ? (
          <VendorDetail
            key={selected.id}
            token={token}
            vendor={selected}
            options={options}
            report={report}
            onChanged={() => void reloadVendors()}
            onDeleted={() => { setSelectedId(null); void reloadVendors(); }}
            onError={setError}
          />
        ) : (
          <div style={cardStyle}>Select a vendor on the left to assign cases and monitor it.</div>
        )}
      </div>
    </div>
  );
}

function CreateVendorForm({
  token, options, onCreated, onError,
}: Readonly<{ token: string; options: VendorAccessOptions; onCreated: () => void; onError: (m: string) => void }>) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sections, setSections] = useState<string[]>(options.sections.map((s) => s.key));
  const [permissionLevel, setPermissionLevel] = useState<VendorPermissionLevel>("view");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const toggle = (key: string) => setSections((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  async function submit() {
    const uname = username.trim();
    if (uname.length < 3) return onError("Username must be at least 3 characters.");
    if (!/^[a-zA-Z0-9._-]+$/.test(uname)) {
      return onError(
        "Username can only use letters, numbers, dot (.), underscore (_) or hyphen (-) — no spaces. e.g. vendor_salem",
      );
    }
    if (sections.length === 0) return onError("Grant at least one view.");
    if (password.length < 8) return onError("Password must be at least 8 characters.");
    setBusy(true);
    onError("");
    try {
      await createVendorAccess(token, { username: uname, password, sections, permissionLevel });
      setCreated({ username: uname, password });
      setUsername(""); setPassword(""); setSections(options.sections.map((s) => s.key)); setPermissionLevel("view");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create failed");
    } finally { setBusy(false); }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>New vendor login</h3>
      {created && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, color: "#065f46" }}>
          ✓ Created <strong>{created.username}</strong>. Share these with the vendor — they log in at{" "}
          <strong>/vendor</strong> (via the main OpenCall login):
          <div style={{ marginTop: 4, fontFamily: "monospace" }}>
            {created.username} / {created.password}
          </div>
        </div>
      )}
      <label style={lbl}>Username</label>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        minLength={3}
        maxLength={64}
        pattern="[a-zA-Z0-9._\-]+"
        placeholder="e.g. vendor_salem"
        style={inp}
      />
      <span style={{ display: "block", fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
        Letters, numbers, dot, underscore, hyphen — no spaces.
      </span>
      <label style={lbl}>Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} style={inp} />
      <label style={lbl}>Vendor views</label>
      <div className="checkGrid">
        {options.sections.map((s) => (
          <label key={s.key} className="checkItem">
            <input type="checkbox" checked={sections.includes(s.key)} onChange={() => toggle(s.key)} /> {s.label}
          </label>
        ))}
      </div>
      <label style={lbl}>Permission</label>
      <select value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value as VendorPermissionLevel)} style={inp}>
        {options.permissionLevels.map((p) => (<option key={p.value} value={p.value}>{p.label} — {p.description}</option>))}
      </select>
      <button type="button" onClick={() => void submit()} disabled={busy} style={primaryBtn}>{busy ? "Creating…" : "Create vendor"}</button>
    </div>
  );
}

function VendorList({
  vendors, selectedId, onSelect,
}: Readonly<{ vendors: VendorAccessListItem[]; selectedId: string | null; onSelect: (id: string) => void }>) {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Vendors ({vendors.length})</h3>
      {vendors.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No vendor logins yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {vendors.map((v) => (
            <button key={v.id} type="button" onClick={() => onSelect(v.id)} style={{
              textAlign: "left", border: selectedId === v.id ? "2px solid #4f46e5" : "1px solid #e5e7eb",
              background: selectedId === v.id ? "#eef2ff" : "#fff", borderRadius: 8, padding: "8px 12px",
              cursor: "pointer", color: "#111827", font: "inherit",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: selectedId === v.id ? "#4338ca" : "#111827" }}>
                  {v.username || "(no username)"}
                </span>
                <span style={{ fontSize: 11, color: v.isActive ? "#059669" : "#9ca3af", fontWeight: 700, flexShrink: 0 }}>{v.isActive ? "Active" : "Inactive"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 3 }}>{v.assignedCases} cases · {v.permissionLevel} · {v.sections.length} views</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VendorDetail({
  token, vendor, options, report, onChanged, onDeleted, onError,
}: Readonly<{
  token: string; vendor: VendorAccessListItem; options: VendorAccessOptions;
  report: GeneratedReportResponse | null; onChanged: () => void; onDeleted: () => void; onError: (m: string) => void;
}>) {
  const [sections, setSections] = useState<string[]>(vendor.sections);
  const [permissionLevel, setPermissionLevel] = useState<VendorPermissionLevel>(vendor.permissionLevel);
  const [assignments, setAssignments] = useState<VendorCaseAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<number, { ticketId: string; caseId: string }>>(new Map());
  const [busy, setBusy] = useState(false);

  const loadAssignments = useCallback(async () => {
    setAssignments(await listVendorAssignments(token, vendor.id));
  }, [token, vendor.id]);

  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const toggle = (key: string) => setSections((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  async function saveGrants() {
    setBusy(true); onError("");
    try { await updateVendorAccess(token, vendor.id, { sections, permissionLevel }); onChanged(); }
    catch (err) { onError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function toggleActive() {
    setBusy(true);
    try { await updateVendorAccess(token, vendor.id, { isActive: !vendor.isActive }); onChanged(); }
    finally { setBusy(false); }
  }
  async function resetPassword() {
    const pw = window.prompt("New password (min 8 chars):");
    if (!pw) return;
    if (pw.length < 8) return onError("Password must be at least 8 characters.");
    try { await resetVendorAccessPassword(token, vendor.id, pw); onError(""); }
    catch (err) { onError(err instanceof Error ? err.message : "Reset failed"); }
  }
  async function remove() {
    if (!window.confirm(`Delete vendor "${vendor.username}"? Its case assignments are removed too.`)) return;
    try { await deleteVendorAccess(token, vendor.id); onDeleted(); }
    catch (err) { onError(err instanceof Error ? err.message : "Delete failed"); }
  }
  async function unassign(a: VendorCaseAssignment) {
    setBusy(true);
    try { await unassignVendorCase(token, vendor.id, a.id); await loadAssignments(); onChanged(); }
    catch (err) { onError(err instanceof Error ? err.message : "Unassign failed"); }
    finally { setBusy(false); }
  }

  const assignedKeys = useMemo(() => new Set(assignments.map((a) => a.normalizedTicketId)), [assignments]);

  // Case table: search-narrowed rows from the report, capped for performance.
  const searchResults = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const out: Row[] = [];
    for (const row of report.rows) {
      const o = row.output as Record<string, unknown>;
      const hay = [o["Ticket ID"], o["Customer Name"], o["Work Location"], o["Case ID"], o["RTPL status"]]
        .map((v) => String(v ?? "").toLowerCase());
      if (hay.some((h) => h.includes(q))) {
        out.push(row);
        if (out.length >= 150) break;
      }
    }
    return out;
  }, [report, search]);

  function togglePick(row: Row) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(row.serialNo)) next.delete(row.serialNo);
      else next.set(row.serialNo, {
        ticketId: String((row.output as Record<string, unknown>)["Ticket ID"] ?? "").trim(),
        caseId: String((row.output as Record<string, unknown>)["Case ID"] ?? "").trim(),
      });
      return next;
    });
  }

  async function assignPicked() {
    const cases = [...picked.values()].filter((c) => c.ticketId);
    if (cases.length === 0) return;
    setBusy(true); onError("");
    try {
      await assignVendorCases(token, vendor.id, cases);
      setPicked(new Map()); setSearch("");
      await loadAssignments(); onChanged();
    } catch (err) { onError(err instanceof Error ? err.message : "Assign failed"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Grants + account */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{vendor.username}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void toggleActive()} disabled={busy} style={ghostBtn}>{vendor.isActive ? "Deactivate" : "Activate"}</button>
            <button type="button" onClick={() => void resetPassword()} style={ghostBtn}>Reset password</button>
            <button type="button" onClick={() => void remove()} style={{ ...ghostBtn, color: "#dc2626", borderColor: "#fecaca" }}>Delete</button>
          </div>
        </div>
        <label style={lbl}>Vendor views</label>
        <div className="checkGrid">
          {options.sections.map((s) => (
            <label key={s.key} className="checkItem">
              <input type="checkbox" checked={sections.includes(s.key)} onChange={() => toggle(s.key)} /> {s.label}
            </label>
          ))}
        </div>
        <label style={lbl}>Permission</label>
        <select value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value as VendorPermissionLevel)} style={inp}>
          {options.permissionLevels.map((p) => (<option key={p.value} value={p.value}>{p.label} — {p.description}</option>))}
        </select>
        <button type="button" onClick={() => void saveGrants()} disabled={busy} style={primaryBtn}>{busy ? "Saving…" : "Save views & permission"}</button>
      </div>

      {/* Assign cases — case table */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Assign cases to {vendor.username}</h3>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
          {report ? "Search the report, tick the cases, then assign." : "No report loaded."}
        </p>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search WO / customer / region / case id…" style={inp} />
        {search.trim() && (
          <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 8 }}>
            {searchResults.length === 0 ? (
              <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>No matching cases.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  {searchResults.map((row) => {
                    const o = row.output as Record<string, unknown>;
                    const already = assignedKeys.has(normTicket(o["Ticket ID"]));
                    return (
                      <tr key={row.serialNo} style={{ borderBottom: "1px solid #f3f4f6", opacity: already ? 0.55 : 1 }}>
                        <td style={{ padding: "6px 8px", width: 30 }}>
                          <input type="checkbox" disabled={already} checked={picked.has(row.serialNo)} onChange={() => togglePick(row)} />
                        </td>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>{String(o["Ticket ID"] ?? "-")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(o["Customer Name"] ?? "-")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(o["Work Location"] ?? "-")}</td>
                        <td style={{ padding: "6px 8px", color: "#9ca3af" }}>{already ? "assigned" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
        {picked.size > 0 && (
          <button type="button" onClick={() => void assignPicked()} disabled={busy} style={{ ...primaryBtn, background: "#059669" }}>
            {busy ? "Assigning…" : `Assign ${picked.size} case${picked.size === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {/* Monitor — assigned cases */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Assigned cases ({assignments.length})</h3>
          <button type="button" onClick={() => void loadAssignments()} style={ghostBtn}>↻ Refresh</button>
        </div>
        {assignments.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No cases assigned yet.</div>
        ) : (
          <div style={{ maxHeight: 320, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {assignments.map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid #f3f4f6", borderRadius: 6 }}>
                <span style={{ fontSize: 12.5 }}>
                  <strong>{a.ticketId || a.normalizedTicketId}</strong>{a.caseId ? ` · Case ${a.caseId}` : ""}
                  <span style={{ color: "#9ca3af" }}> · {new Date(a.assignedAt).toLocaleDateString()}</span>
                </span>
                <button type="button" onClick={() => void unassign(a)} disabled={busy} style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 16 }} aria-label="Unassign">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 12, padding: 16, fontSize: 13, color: "#374151" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", margin: "10px 0 4px" };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" };
const primaryBtn: React.CSSProperties = { width: "100%", marginTop: 12, padding: "9px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer" };
