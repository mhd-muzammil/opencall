"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAdminRtplStatuses,
  createAdminRtplStatus,
  updateAdminRtplStatus,
  deactivateAdminRtplStatus,
  reactivateAdminRtplStatus,
  deleteAdminRtplStatus,
} from "../lib/apiClient";
import { readSession, type ClientSession } from "../lib/session";
import type { RtplStatus } from "../lib/api/types";

// Default category suggestions, mirroring the original hardcoded grouping. New
// categories typed by the admin are also surfaced as suggestions once saved.
const DEFAULT_CATEGORIES = [
  "General Activity",
  "Scheduling & Engineer",
  "Parts & Inventory",
  "Quotations & Payments",
  "Visitation & Estimates",
  "Cancellations & Closures",
  "Returns & Yank",
  "Elevations / Escalations",
  "Validation & Testing",
  "Other",
];

type ViewMode = "list" | "add" | "edit";

interface AdminRtplStatusesManagerProps {
  /**
   * Called after any successful create/edit/delete/enable/disable so an embedding
   * view (e.g. the operational app) can refresh its own copy of the status list.
   */
  onStatusesChanged?: () => void;
}

export function AdminRtplStatusesManager({ onStatusesChanged }: AdminRtplStatusesManagerProps = {}) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [statuses, setStatuses] = useState<RtplStatus[] | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterActive, setFilterActive] = useState<"" | "active" | "inactive">("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<RtplStatus | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const loadData = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getAdminRtplStatuses(session.token, {});
      setStatuses(res.statuses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RTPL statuses");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session) {
      void loadData();
    }
  }, [session]);

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const s of statuses ?? []) set.add(s.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [statuses]);

  const filtered = useMemo(() => {
    if (!statuses) return [];
    return statuses.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false;
      if (filterActive === "active" && !s.isActive) return false;
      if (filterActive === "inactive" && s.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [statuses, filterCategory, filterActive, search]);

  const openAddForm = () => {
    setSelected(null);
    setFormName("");
    setFormCategory("");
    setFormError(null);
    setViewMode("add");
  };

  const openEditForm = (s: RtplStatus) => {
    setSelected(s);
    setFormName(s.name);
    setFormCategory(s.category);
    setFormError(null);
    setViewMode("edit");
  };

  const backToList = () => {
    setViewMode("list");
    setSelected(null);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormBusy(true);
    setFormError(null);
    try {
      if (viewMode === "add") {
        await createAdminRtplStatus(session.token, {
          name: formName.trim(),
          category: formCategory.trim() || "Other",
        });
      } else if (viewMode === "edit" && selected) {
        await updateAdminRtplStatus(session.token, selected.id, {
          name: formName.trim(),
          category: formCategory.trim() || "Other",
        });
      }
      setViewMode("list");
      await loadData();
      onStatusesChanged?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save status");
    } finally {
      setFormBusy(false);
    }
  };

  const handleToggleActive = async (s: RtplStatus) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (s.isActive) {
        await deactivateAdminRtplStatus(session.token, s.id);
      } else {
        await reactivateAdminRtplStatus(session.token, s.id);
      }
      await loadData();
      onStatusesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: RtplStatus) => {
    if (!session) return;
    if (!window.confirm(`Delete RTPL status "${s.name}"? This removes it from the dropdown for all regions. Existing report data is not affected.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdminRtplStatus(session.token, s.id);
      await loadData();
      onStatusesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete status");
    } finally {
      setBusy(false);
    }
  };

  // Region admins cannot manage the global RTPL status list.
  if (session && session.user.role !== "SUPER_ADMIN") {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>RTPL Statuses</h2>
          </div>
        </div>
        <p className="muted">
          Only a Super Admin can manage the RTPL status list. These statuses are shared across all regions.
        </p>
      </section>
    );
  }

  // --- ADD / EDIT form ---
  if (viewMode === "add" || viewMode === "edit") {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>{viewMode === "add" ? "New RTPL status" : "Edit RTPL status"}</h2>
          </div>
        </div>

        <form className="adminForm" onSubmit={handleSave}>
          <label className="adminField">
            <span>Status name *</span>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Part Order Pending"
              required
              maxLength={200}
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Category</span>
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="Pick or type a category (defaults to Other)"
              list="rtpl-category-suggestions"
              maxLength={100}
              autoComplete="off"
            />
            <datalist id="rtpl-category-suggestions">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          {formError && <div className="adminError">{formError}</div>}

          <div className="adminFormActions">
            <button type="submit" className="btnPrimary" disabled={formBusy}>
              {formBusy ? "Saving…" : viewMode === "add" ? "Create status" : "Save changes"}
            </button>
            <button type="button" className="btnSecondary" onClick={backToList} disabled={formBusy}>
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
          <h2>RTPL Statuses</h2>
        </div>
        <div className="adminPageActions">
          <button className="btnPrimary" onClick={openAddForm}>
            + New status
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Statuses added here appear in the RTPL status dropdown for every region.
      </p>

      <div className="adminFilters">
        <label className="adminField">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or category..."
          />
        </label>
        <label className="adminField">
          <span>Category</span>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categorySuggestions.map((c) => (
              <option key={c} value={c}>
                {c}
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
      {busy && !statuses && <p className="muted">Loading RTPL statuses…</p>}

      {statuses && (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Status</th>
                <th>Category</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No RTPL statuses match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>{s.category}</td>
                  <td>
                    <span className={`adminTag ${s.isActive ? "good" : "bad"}`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button className="btnSecondary" onClick={() => openEditForm(s)}>
                      Edit
                    </button>
                    <button
                      className={s.isActive ? "btnDanger" : "btnSecondary"}
                      onClick={() => handleToggleActive(s)}
                      disabled={busy}
                    >
                      {s.isActive ? "Disable" : "Enable"}
                    </button>
                    <button className="btnDanger" onClick={() => handleDelete(s)} disabled={busy}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
