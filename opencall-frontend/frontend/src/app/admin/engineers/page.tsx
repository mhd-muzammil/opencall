"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAdminEngineers,
  createAdminEngineer,
  updateAdminEngineer,
  deactivateAdminEngineer,
  reactivateAdminEngineer,
} from "../../../lib/apiClient";
import { listAdminRegions, type AdminRegion } from "../../../lib/adminApiClient";
import { readSession, type ClientSession } from "../../../lib/session";
import type { Engineer } from "../../../lib/api/types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

type ViewMode = "list" | "add" | "edit";

export default function AdminEngineersPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [engineers, setEngineers] = useState<Engineer[] | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [filterRegion, setFilterRegion] = useState<string>("");
  const [filterActive, setFilterActive] = useState<"" | "active" | "inactive">("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedEngineer, setSelectedEngineer] = useState<Engineer | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const s = readSession();
    setSession(s);
    if (s?.user.role === "REGION_ADMIN" && s.user.regionId) {
      setFilterRegion(s.user.regionId);
      setFormRegion(s.user.regionId);
    }
  }, []);

  const loadData = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const [eRes, rRes] = await Promise.all([
        getAdminEngineers(session.token, {}),
        listAdminRegions(session.token),
      ]);
      setEngineers(eRes.rows);
      setRegions(rRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load engineers");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session) {
      void loadData();
    }
  }, [session]);

  const regionLookup = useMemo(() => {
    const m = new Map<string, AdminRegion>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

  const activeRegions = regions.filter((r) => r.isActive);

  const filtered = useMemo(() => {
    if (!engineers) return [];
    return engineers.filter((e) => {
      if (filterRegion && e.regionId !== filterRegion) return false;
      if (filterActive === "active" && !e.isActive) return false;
      if (filterActive === "inactive" && e.isActive) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.engineerName.toLowerCase().includes(s) &&
          !(e.engineerCode?.toLowerCase().includes(s))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [engineers, filterRegion, filterActive, search]);

  const openAddForm = () => {
    setSelectedEngineer(null);
    setFormName("");
    setFormCode("");
    setFormRegion(session?.user.role === "REGION_ADMIN" ? session.user.regionId || "" : "");
    setFormEmail("");
    setFormPhone("");
    setFormError(null);
    setViewMode("add");
  };

  const openEditForm = (e: Engineer) => {
    setSelectedEngineer(e);
    setFormName(e.engineerName);
    setFormCode(e.engineerCode || "");
    setFormRegion(e.regionId);
    setFormEmail(e.email || "");
    setFormPhone(e.phone || "");
    setFormError(null);
    setViewMode("edit");
  };

  const backToList = () => {
    setViewMode("list");
    setSelectedEngineer(null);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormBusy(true);
    setFormError(null);
    try {
      if (viewMode === "add") {
        await createAdminEngineer(session.token, {
          engineerName: formName.trim(),
          engineerCode: formCode.trim() || null,
          regionId: formRegion,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
        });
      } else if (viewMode === "edit" && selectedEngineer) {
        await updateAdminEngineer(session.token, selectedEngineer.id, {
          engineerName: formName.trim(),
          engineerCode: formCode.trim() || null,
          regionId: formRegion,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
        });
      }
      setViewMode("list");
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save engineer");
    } finally {
      setFormBusy(false);
    }
  };

  const handleToggleActive = async (engineer: Engineer) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (engineer.isActive) {
        await deactivateAdminEngineer(session.token, engineer.id);
      } else {
        await reactivateAdminEngineer(session.token, engineer.id);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setBusy(false);
    }
  };

  // --- ADD / EDIT form ---
  if (viewMode === "add" || viewMode === "edit") {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>{viewMode === "add" ? "New engineer" : "Edit engineer"}</h2>
          </div>
        </div>

        <form className="adminForm" onSubmit={handleSave}>
          <label className="adminField">
            <span>Name *</span>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Engineer full name"
              required
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Code</span>
            <input
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder="Optional engineer code"
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Region *</span>
            <select
              value={formRegion}
              onChange={(e) => setFormRegion(e.target.value)}
              required
              disabled={session?.user.role === "REGION_ADMIN"}
            >
              <option value="">Select region…</option>
              {activeRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </label>

          <label className="adminField">
            <span>Email</span>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="Optional email address"
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Phone</span>
            <input
              type="tel"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="Optional phone number"
              autoComplete="off"
            />
          </label>

          {formError && <div className="adminError">{formError}</div>}

          <div className="adminFormActions">
            <button type="submit" className="btnPrimary" disabled={formBusy}>
              {formBusy ? "Saving…" : viewMode === "add" ? "Create engineer" : "Save changes"}
            </button>
            <button
              type="button"
              className="btnSecondary"
              onClick={backToList}
              disabled={formBusy}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  // --- LIST view ---
  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Engineers</h2>
        </div>
        <div className="adminPageActions">
          <button className="btnPrimary" onClick={openAddForm}>
            + New engineer
          </button>
        </div>
      </div>

      <div className="adminFilters">
        <label className="adminField">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or Code..."
          />
        </label>
        {session?.user.role === "SUPER_ADMIN" && (
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
        )}
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
      {busy && !engineers && <p className="muted">Loading engineers…</p>}

      {engineers && (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Region</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No engineers match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => {
                const region = regionLookup.get(e.regionId);
                return (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.engineerName}</strong>
                    </td>
                    <td>{e.engineerCode || "—"}</td>
                    <td>{region ? `${region.name}` : "—"}</td>
                    <td>{e.email || "—"}</td>
                    <td>
                      <span className={`adminTag ${e.isActive ? "good" : "bad"}`}>
                        {e.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(e.createdAt)}</td>
                    <td style={{ textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button className="btnSecondary" onClick={() => openEditForm(e)}>
                        Edit
                      </button>
                      <button
                        className={e.isActive ? "btnDanger" : "btnSecondary"}
                        onClick={() => handleToggleActive(e)}
                        disabled={busy}
                      >
                        {e.isActive ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
