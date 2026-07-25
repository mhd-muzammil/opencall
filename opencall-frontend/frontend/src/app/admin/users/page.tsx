"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  listAdminRegions,
  listAdminUsers,
  type AdminRegion,
  type ManagedUser,
} from "../../../lib/adminApiClient";
import {
  fetchUserLoginHistory,
  fetchUserLoginSummary,
  type LoginLocationEntry,
  type LoginLocationSummaryItem,
} from "../../../lib/loginActivityApiClient";
import {
  LoginHistoryModal,
  LoginLocationCell,
} from "../../../features/admin/LoginLocation";
import { readSession, type ClientSession } from "../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function AdminUsersPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [filterRole, setFilterRole] = useState<"" | "SUPER_ADMIN" | "REGION_ADMIN">("");
  const [filterRegion, setFilterRegion] = useState<string>("");
  const [filterActive, setFilterActive] = useState<"" | "active" | "inactive">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationSummary, setLocationSummary] = useState<LoginLocationSummaryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyEntries, setHistoryEntries] = useState<LoginLocationEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    const s = readSession();
    setSession(s);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    Promise.all([
      listAdminUsers(session.token),
      listAdminRegions(session.token),
    ])
      .then(([u, r]) => {
        if (cancelled) return;
        setUsers(u);
        setRegions(r);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Login-location summary loads independently — if it fails (or the lookup is off) the
  // users list still renders, just without the "Last location" column filled.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchUserLoginSummary(session.token)
      .then((s) => {
        if (!cancelled) setLocationSummary(s);
      })
      .catch(() => {
        /* optional column — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const locationByUser = useMemo(() => {
    const m = new Map<string, LoginLocationSummaryItem>();
    for (const s of locationSummary) m.set(s.principalId, s);
    return m;
  }, [locationSummary]);

  async function openHistory(u: ManagedUser) {
    if (!session) return;
    setHistoryOpen(true);
    setHistoryTitle(u.username ?? u.email);
    setHistoryEntries([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const entries = await fetchUserLoginHistory(session.token, u.id);
      setHistoryEntries(entries);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load login history");
    } finally {
      setHistoryLoading(false);
    }
  }

  const regionLookup = useMemo(() => {
    const m = new Map<string, AdminRegion>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

  const filtered = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (filterRegion && u.regionId !== filterRegion) return false;
      if (filterActive === "active" && !u.isActive) return false;
      if (filterActive === "inactive" && u.isActive) return false;
      return true;
    });
  }, [users, filterRole, filterRegion, filterActive]);

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Users</h2>
        </div>
        <div className="adminPageActions">
          <Link className="btnPrimary" href="/admin/users/new">
            + New user
          </Link>
        </div>
      </div>

      <div className="adminFilters">
        <label className="adminField">
          <span>Role</span>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}>
            <option value="">All roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="REGION_ADMIN">Region Admin</option>
          </select>
        </label>
        <label className="adminField">
          <span>Region</span>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code}){r.isActive ? "" : " — inactive"}
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>Status</span>
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {error && <div className="adminError">{error}</div>}
      {busy && !users && <p className="muted">Loading users…</p>}

      {users && (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Region</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Last seen (location)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No users match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const region = u.regionId ? regionLookup.get(u.regionId) : null;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username ?? "—"}</strong>
                      {u.mustChangePassword && (
                        <span className="adminTag warn" title="User must change password on next login">
                          must change pw
                        </span>
                      )}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`adminTag ${u.role === "SUPER_ADMIN" ? "neutral" : ""}`}>
                        {u.role === "SUPER_ADMIN" ? "Super Admin" : "Region Admin"}
                      </span>
                    </td>
                    <td>{region ? `${region.name} (${region.code})` : "—"}</td>
                    <td>
                      <span className={`adminTag ${u.isActive ? "good" : "bad"}`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(u.lastLoginAt)}</td>
                    <td>
                      <LoginLocationCell
                        summary={locationByUser.get(u.id)}
                        onOpenHistory={() => void openHistory(u)}
                      />
                    </td>
                    <td>
                      <Link className="btnSecondary" href={`/admin/users/${u.id}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <LoginHistoryModal
        open={historyOpen}
        title={historyTitle}
        entries={historyEntries}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryOpen(false)}
      />
    </section>
  );
}
