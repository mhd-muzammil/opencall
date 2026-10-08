"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAdminRtplStatuses,
  createAdminRtplStatus,
  updateAdminRtplStatus,
  deactivateAdminRtplStatus,
  reactivateAdminRtplStatus,
  deleteAdminRtplStatus,
  getAdminBodEodRows,
  createAdminBodEodRow,
  updateAdminBodEodRow,
  deleteAdminBodEodRow,
} from "../lib/apiClient";
import { readSession, type ClientSession } from "../lib/session";
import type { AdminBodEodRow, RtplStatus } from "../lib/api/types";
import {
  CUSTOM_ROW_ANCHORS,
  CUSTOM_ROW_PRODUCTIVITY_CHOICES,
  STATUS_BUCKETS,
  STATUS_BUCKET_LABELS,
  bodEodRowLabel,
  lockedStatusBucket,
  setCustomBodEodRows,
  suggestStatusBucket,
  type StatusBucket,
} from "@opencall/shared";

function productivityLabel(value: string): string {
  return CUSTOM_ROW_PRODUCTIVITY_CHOICES.find((c) => c.value === value)?.label ?? value;
}

/** The add/edit form for a custom BOD/EOD row. */
interface RowFormState {
  row: AdminBodEodRow | null;
  label: string;
  productivityBucket: string;
  afterRow: StatusBucket;
  /** Opened from the status form: go back to it with the new row chosen. */
  returnToStatus: boolean;
}

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
  // Success feedback, e.g. how many existing records a rename cascaded into.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<RtplStatus | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  // The BOD/EOD row the status counts under. Empty on a new status: the admin
  // has to choose, the name is never used to guess.
  const [formBucket, setFormBucket] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Custom BOD/EOD rows: rows an admin adds for statuses that fit none of the
  // built-in ones.
  const [tab, setTab] = useState<"statuses" | "rows">("statuses");
  const [customRows, setCustomRows] = useState<AdminBodEodRow[]>([]);
  const [rowForm, setRowForm] = useState<RowFormState | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const loadData = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const [res, rowsRes] = await Promise.all([
        getAdminRtplStatuses(session.token, {}),
        // A backend without custom rows yet answers 404: no rows, nothing else breaks.
        getAdminBodEodRows(session.token).catch(() => ({ rows: [] as AdminBodEodRow[] })),
      ]);
      setStatuses(res.statuses);
      setCustomRows(rowsRes.rows);
      // So row labels resolve everywhere in this tab straight away.
      setCustomBodEodRows(
        rowsRes.rows.map(({ key, label, productivityBucket, afterRow, sortOrder, isActive }) => ({
          key,
          label,
          productivityBucket,
          afterRow,
          sortOrder,
          isActive,
        })),
      );
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
    setFormBucket("");
    setFormError(null);
    setViewMode("add");
  };

  const openEditForm = (s: RtplStatus) => {
    setSelected(s);
    setFormName(s.name);
    setFormCategory(s.category);
    // A status the migration left on the old keyword rules stays there until
    // the admin deliberately picks a row; no row is pre-filled for it.
    setFormBucket(s.bodEodBucket ?? "");
    setFormError(null);
    setViewMode("edit");
  };

  const backToList = () => {
    setViewMode("list");
    setSelected(null);
    setFormError(null);
  };

  const openRowForm = (row: AdminBodEodRow | null, returnToStatus = false) => {
    setFormError(null);
    setRowForm({
      row,
      label: row?.label ?? "",
      productivityBucket: row?.productivityBucket ?? "",
      afterRow: row?.afterRow ?? "TO_BE_CANCEL",
      returnToStatus,
    });
  };

  const closeRowForm = () => {
    setRowForm(null);
    setFormError(null);
  };

  const handleSaveRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !rowForm) return;
    if (!rowForm.productivityBucket) {
      setFormError("Choose how this row counts in Engineer Productivity.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      const input = {
        label: rowForm.label.trim(),
        productivityBucket: rowForm.productivityBucket,
        afterRow: rowForm.afterRow,
      };
      const { row } = rowForm.row
        ? await updateAdminBodEodRow(session.token, rowForm.row.id, input)
        : await createAdminBodEodRow(session.token, input);
      await loadData();
      onStatusesChanged?.();
      // Back to the status being added, with the new row already chosen.
      if (rowForm.returnToStatus) setFormBucket(row.key);
      setNotice(rowForm.row ? `Row "${row.label}" saved.` : `Row "${row.label}" created.`);
      setRowForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save row");
    } finally {
      setFormBusy(false);
    }
  };

  const handleToggleRow = async (row: AdminBodEodRow) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await updateAdminBodEodRow(session.token, row.id, { isActive: !row.isActive });
      await loadData();
      onStatusesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change row");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRow = async (row: AdminBodEodRow) => {
    if (!session) return;
    if (!window.confirm(`Delete BOD/EOD row "${row.label}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminBodEodRow(session.token, row.id);
      await loadData();
      onStatusesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete row");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const lockedBucket = lockedStatusBucket(formName.trim());
    const bodEodBucket = lockedBucket ?? formBucket;
    // Editing a status still on the old rules without choosing a row keeps it there.
    const keepsOldRules = viewMode === "edit" && !bodEodBucket && !selected?.bodEodBucket;
    if (!bodEodBucket && !keepsOldRules) {
      setFormError("Choose which BOD/EOD row this status counts under.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      setNotice(null);
      if (viewMode === "add") {
        await createAdminRtplStatus(session.token, {
          name: formName.trim(),
          category: formCategory.trim() || "Other",
          bodEodBucket,
        });
      } else if (viewMode === "edit" && selected) {
        const result = await updateAdminRtplStatus(session.token, selected.id, {
          name: formName.trim(),
          category: formCategory.trim() || "Other",
          ...(bodEodBucket ? { bodEodBucket } : {}),
        });
        // A rename rewrites the old value on existing report rows so dashboards
        // never show two cards for the same status — tell the admin it happened.
        if (result.renamedRowValues && result.renamedRowValues > 0) {
          setNotice(
            `Status renamed to "${result.status.name}" — ${result.renamedRowValues} existing record value(s) updated to match.`,
          );
        }
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

  // --- custom row ADD / EDIT form ---
  if (rowForm) {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>{rowForm.row ? "Edit BOD/EOD row" : "New BOD/EOD row"}</h2>
          </div>
        </div>

        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          A new line in the BOD &amp; EOD table, the mobile BOD/EOD screen and the Excel export,
          for statuses that fit none of the built-in rows.
        </p>

        <form className="adminForm" onSubmit={handleSaveRow}>
          <label className="adminField">
            <span>Row name *</span>
            <input
              value={rowForm.label}
              onChange={(e) => setRowForm({ ...rowForm, label: e.target.value })}
              placeholder="e.g. HP Approval"
              required
              maxLength={100}
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Show it after *</span>
            <select
              value={rowForm.afterRow}
              onChange={(e) => setRowForm({ ...rowForm, afterRow: e.target.value as StatusBucket })}
            >
              {CUSTOM_ROW_ANCHORS.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {STATUS_BUCKET_LABELS[bucket]}
                </option>
              ))}
            </select>
          </label>

          <label className="adminField">
            <span>In Engineer Productivity, these calls count as *</span>
            <select
              value={rowForm.productivityBucket}
              onChange={(e) => setRowForm({ ...rowForm, productivityBucket: e.target.value })}
              required
            >
              <option value="" disabled>
                Choose…
              </option>
              {CUSTOM_ROW_PRODUCTIVITY_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
            <small className="muted">
              &quot;Attended&quot; means the engineer did the work; &quot;Not attended&quot; means
              the visit did not happen.
            </small>
          </label>

          {formError && <div className="adminError">{formError}</div>}

          <div className="adminFormActions">
            <button type="submit" className="btnPrimary" disabled={formBusy}>
              {formBusy ? "Saving…" : rowForm.row ? "Save changes" : "Create row"}
            </button>
            <button type="button" className="btnSecondary" onClick={closeRowForm} disabled={formBusy}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  // --- ADD / EDIT form ---
  if (viewMode === "add" || viewMode === "edit") {
    // "Scheduled", "Customer Pending" and the closure statuses are matched by
    // exact name elsewhere; the backend refuses to rename or move them.
    const lockedBucket = selected ? lockedStatusBucket(selected.name) : null;
    const suggested = formName.trim() ? suggestStatusBucket(formName) : null;
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
              readOnly={lockedBucket !== null}
            />
          </label>

          <label className="adminField">
            <span>Counts under BOD/EOD row *</span>
            <select
              value={lockedBucket ?? formBucket}
              onChange={(e) => setFormBucket(e.target.value)}
              required
              disabled={lockedBucket !== null}
            >
              <option value="" disabled={!(viewMode === "edit" && !selected?.bodEodBucket)}>
                {viewMode === "edit" && !selected?.bodEodBucket
                  ? "Not chosen yet: counted by the old keyword rules"
                  : "Choose a row…"}
              </option>
              <optgroup label="Built-in rows">
                {STATUS_BUCKETS.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {STATUS_BUCKET_LABELS[bucket]}
                  </option>
                ))}
              </optgroup>
              {customRows.some((row) => row.isActive || row.key === formBucket) && (
                <optgroup label="Rows you added">
                  {customRows
                    .filter((row) => row.isActive || row.key === formBucket)
                    .map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                        {row.isActive ? "" : " (hidden)"}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            {lockedBucket === null && (
              <small className="muted">
                None of these fit?{" "}
                <button
                  type="button"
                  className="btnSecondary"
                  style={{ padding: "2px 8px", fontSize: "inherit" }}
                  onClick={() => openRowForm(null, true)}
                >
                  + Create a new BOD/EOD row
                </button>
              </small>
            )}
            {lockedBucket ? (
              <small className="muted">
                System status: other features match this exact name, so it cannot be renamed or
                moved to another row.
              </small>
            ) : viewMode === "add" || !selected?.bodEodBucket ? (
              !formBucket &&
              suggested && (
                <small className="muted">
                  Suggested from the name's wording:{" "}
                  <button
                    type="button"
                    className="btnSecondary"
                    style={{ padding: "2px 8px", fontSize: "inherit" }}
                    onClick={() => setFormBucket(suggested)}
                  >
                    {STATUS_BUCKET_LABELS[suggested]}
                  </button>
                </small>
              )
            ) : (
              <small className="muted">
                Moving a status recounts the BOD/EOD table and Engineer Productivity for every day,
                past days included. Days already closed with Final EOD keep their frozen productivity
                until they are reopened and closed again.
              </small>
            )}
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
          {tab === "statuses" ? (
            <button className="btnPrimary" onClick={openAddForm}>
              + New status
            </button>
          ) : (
            <button className="btnPrimary" onClick={() => openRowForm(null)}>
              + New BOD/EOD row
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={tab === "statuses" ? "btnPrimary" : "btnSecondary"}
          onClick={() => setTab("statuses")}
        >
          Statuses
        </button>
        <button
          type="button"
          className={tab === "rows" ? "btnPrimary" : "btnSecondary"}
          onClick={() => setTab("rows")}
        >
          BOD/EOD rows{customRows.length > 0 ? ` (${customRows.length} added)` : ""}
        </button>
      </div>

      {tab === "rows" && (
        <>
          <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
            The built-in rows (To be Schedule, Customer Pending, SSC Pending, …) are fixed. Add a
            row here when a status fits none of them, then choose that row on the status.
          </p>
          {error && <div className="adminError">{error}</div>}
          {notice && <div className="adminNotice">{notice}</div>}
          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Shown after</th>
                  <th>Counts in productivity as</th>
                  <th>Statuses</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No rows added yet. Use &quot;+ New BOD/EOD row&quot; to add one.
                    </td>
                  </tr>
                )}
                {customRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td>{STATUS_BUCKET_LABELS[row.afterRow] ?? row.afterRow}</td>
                    <td>{productivityLabel(row.productivityBucket)}</td>
                    <td>{row.statusCount}</td>
                    <td>
                      <span className={`adminTag ${row.isActive ? "good" : "bad"}`}>
                        {row.isActive ? "Shown" : "Hidden"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button className="btnSecondary" onClick={() => openRowForm(row)}>
                        Edit
                      </button>
                      <button
                        className={row.isActive ? "btnDanger" : "btnSecondary"}
                        onClick={() => handleToggleRow(row)}
                        disabled={busy}
                      >
                        {row.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        className="btnDanger"
                        onClick={() => handleDeleteRow(row)}
                        disabled={busy || row.statusCount > 0}
                        title={
                          row.statusCount > 0
                            ? "Move its statuses to another row first"
                            : undefined
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "statuses" && (
      <>

      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Statuses added here appear in the RTPL status dropdown for every region. Each status counts
        under the BOD/EOD row chosen for it: the same row in the BOD &amp; EOD table, the Overview
        tiles, the Excel export and Engineer Productivity.
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
      {notice && <div className="adminNotice">{notice}</div>}
      {busy && !statuses && <p className="muted">Loading RTPL statuses…</p>}

      {statuses && (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Status</th>
                <th>Category</th>
                <th>BOD/EOD row</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No RTPL statuses match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const locked = lockedStatusBucket(s.name) !== null;
                return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    {locked && (
                      <span
                        className="adminTag"
                        style={{ marginLeft: 8 }}
                        title="Matched by exact name elsewhere: cannot be renamed, moved, disabled or deleted"
                      >
                        System
                      </span>
                    )}
                  </td>
                  <td>{s.category}</td>
                  <td className={s.bodEodBucket ? undefined : "muted"}>
                    {s.bodEodBucket ? bodEodRowLabel(s.bodEodBucket) : "Not chosen (old rules)"}
                  </td>
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
                      disabled={busy || (locked && s.isActive)}
                    >
                      {s.isActive ? "Disable" : "Enable"}
                    </button>
                    <button className="btnDanger" onClick={() => handleDelete(s)} disabled={busy || locked}>
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </section>
  );
}
