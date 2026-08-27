"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAdminEngineers,
  createAdminEngineer,
  updateAdminEngineer,
  deactivateAdminEngineer,
  reactivateAdminEngineer,
  deleteAdminEngineer,
} from "../../../lib/apiClient";
import { listAdminRegions, type AdminRegion } from "../../../lib/adminApiClient";
import { readSession, type ClientSession } from "../../../lib/session";
import type { Engineer } from "../../../lib/api/types";
import { countByRegion } from "../../../lib/engineerRegionCounts";

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
  // Count-card filter: "" = all, "hp" = only engineers with an HP ID, "vendor" = only
  // engineers with a Vendor ID, "no-hp" = engineers with no HP ID. Applied on top of the
  // region/status/search filters.
  const [idFilter, setIdFilter] = useState<"" | "hp" | "vendor" | "no-hp">("");
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
  const [formHpId, setFormHpId] = useState("");
  const [formVendorId, setFormVendorId] = useState("");
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

  /**
   * The engineers behind the region boxes: status and search apply, the region filter does
   * NOT. Applying it would collapse the breakdown to whichever region is selected, and a
   * breakdown that only ever shows one row is not a breakdown — it is the number already on
   * the Total Engineers card.
   */
  const regionScoped = useMemo(() => {
    if (!engineers) return [];
    return engineers.filter((e) => {
      if (filterActive === "active" && !e.isActive) return false;
      if (filterActive === "inactive" && e.isActive) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.engineerName.toLowerCase().includes(s) &&
          !e.engineerCode?.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [engineers, filterActive, search]);

  const regionCounts = useMemo(
    () => countByRegion(regionScoped, regions),
    [regionScoped, regions],
  );

  // Engineers matching the region / status / search filters, BEFORE the count-card
  // (HP/Vendor) filter. The count cards summarise this set so their numbers stay in
  // step with the region/status filter the user has applied.
  const baseFiltered = useMemo(() => {
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

  const hpIdCount = useMemo(
    () => baseFiltered.filter((e) => (e.hpId ?? "").trim() !== "").length,
    [baseFiltered],
  );
  const vendorIdCount = useMemo(
    () => baseFiltered.filter((e) => (e.vendorId ?? "").trim() !== "").length,
    [baseFiltered],
  );
  // "Without HP ID": engineers missing an HP ID AND without a Vendor ID either — anyone
  // who has a Vendor ID is excluded from this count.
  const noHpIdCount = useMemo(
    () =>
      baseFiltered.filter(
        (e) => (e.hpId ?? "").trim() === "" && (e.vendorId ?? "").trim() === "",
      ).length,
    [baseFiltered],
  );

  // The rows the table actually shows: baseFiltered plus the active count-card filter.
  const filtered = useMemo(() => {
    if (idFilter === "hp") return baseFiltered.filter((e) => (e.hpId ?? "").trim() !== "");
    if (idFilter === "vendor") return baseFiltered.filter((e) => (e.vendorId ?? "").trim() !== "");
    if (idFilter === "no-hp")
      return baseFiltered.filter(
        (e) => (e.hpId ?? "").trim() === "" && (e.vendorId ?? "").trim() === "",
      );
    return baseFiltered;
  }, [baseFiltered, idFilter]);

  const openAddForm = () => {
    setSelectedEngineer(null);
    setFormName("");
    setFormCode("");
    setFormRegion(session?.user.role === "REGION_ADMIN" ? session.user.regionId || "" : "");
    setFormEmail("");
    setFormPhone("");
    setFormHpId("");
    setFormVendorId("");
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
    setFormHpId(e.hpId || "");
    setFormVendorId(e.vendorId || "");
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
          hpId: formHpId.trim(),
          vendorId: formVendorId.trim(),
        });
      } else if (viewMode === "edit" && selectedEngineer) {
        await updateAdminEngineer(session.token, selectedEngineer.id, {
          engineerName: formName.trim(),
          engineerCode: formCode.trim() || null,
          regionId: formRegion,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          hpId: formHpId.trim(),
          vendorId: formVendorId.trim(),
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

  const handleDelete = async (engineer: Engineer) => {
    if (!session) return;
    const confirmed = window.confirm(
      `Delete engineer "${engineer.engineerName}"? ` +
        `Past call records keep the engineer's name, but the engineer is removed ` +
        `from dropdowns and this cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminEngineer(session.token, engineer.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete engineer");
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
            <span>RTPL ID</span>
            <input
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder="Optional RTPL ID"
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

          <label className="adminField">
            <span>HP ID</span>
            <input
              type="text"
              value={formHpId}
              onChange={(e) => setFormHpId(e.target.value)}
              placeholder="Optional HP ID"
              autoComplete="off"
            />
          </label>

          <label className="adminField">
            <span>Vendor ID</span>
            <input
              type="text"
              value={formVendorId}
              onChange={(e) => setFormVendorId(e.target.value)}
              placeholder="Optional Vendor ID"
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
            placeholder="Name or RTPL ID..."
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

      {/* How many engineers each region has. Clicking one is the same act as picking that
          region in the dropdown above — same state, so the two can never disagree — and
          clicking the selected one again clears it, because the way out has to be where the
          way in was. Regions with nobody in them are shown too: an empty region is a hole in
          the roster, and it is the one thing the dropdown cannot tell you without visiting
          every entry in turn. */}
      {engineers && regionCounts.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "8px",
            }}
          >
            Engineers by region
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
              gap: "10px",
            }}
          >
            {regionCounts.map((region) => {
              const active = filterRegion === region.id && region.id !== "";
              const empty = region.count === 0;
              return (
                <button
                  key={region.id || "__none"}
                  type="button"
                  // A region with nobody in it has nothing to filter to, so it stays a
                  // label rather than pretending to be a control that does nothing.
                  disabled={empty || region.id === ""}
                  onClick={() => setFilterRegion(active ? "" : region.id)}
                  title={
                    empty
                      ? `No engineers in ${region.name}`
                      : region.id === ""
                        ? "These engineers' region no longer exists"
                        : active
                          ? "Showing this region — click to show all"
                          : `Show only ${region.name}`
                  }
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: active
                      ? "2px solid #4f46e5"
                      : "1px solid var(--border-color, #e5e7eb)",
                    background: active ? "#4f46e512" : "var(--card-bg, #ffffff)",
                    cursor: empty || region.id === "" ? "default" : "pointer",
                    opacity: empty ? 0.6 : 1,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "#6b7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {region.name}
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      marginTop: "2px",
                      color: empty ? "#9ca3af" : active ? "#4f46e5" : "#111827",
                    }}
                  >
                    {region.count}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Clickable count cards — each filters the table to that set. */}
      {engineers && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          {[
            { key: "" as const, label: "Total Engineers", value: baseFiltered.length, color: "#4f46e5" },
            { key: "hp" as const, label: "With HP ID", value: hpIdCount, color: "#059669" },
            { key: "no-hp" as const, label: "Without HP ID", value: noHpIdCount, color: "#dc2626" },
            { key: "vendor" as const, label: "With Vendor ID", value: vendorIdCount, color: "#d97706" },
          ].map((card) => {
            const active = idFilter === card.key;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => setIdFilter(card.key)}
                style={{
                  textAlign: "left",
                  padding: "16px 18px",
                  borderRadius: "12px",
                  border: active ? `2px solid ${card.color}` : "1px solid var(--border-color, #e5e7eb)",
                  background: active ? `${card.color}12` : "var(--card-bg, #ffffff)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {card.label}
                </div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: card.color, marginTop: "4px" }}>
                  {card.value}
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                  {card.key === ""
                    ? active
                      ? "Showing all"
                      : "Click to show all"
                    : active
                      ? "Filtering — click a card to change"
                      : "Click to filter"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="adminError">{error}</div>}
      {busy && !engineers && <p className="muted">Loading engineers…</p>}

      {engineers && (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Name</th>
                <th>RTPL ID</th>
                <th>Region</th>
                <th>Email</th>
                <th>HP ID</th>
                <th>Vendor ID</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No engineers match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((e, index) => {
                const region = regionLookup.get(e.regionId);
                return (
                  <tr key={e.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{e.engineerName}</strong>
                    </td>
                    <td>{e.engineerCode || "—"}</td>
                    <td>{region ? `${region.name}` : "—"}</td>
                    <td>{e.email || "—"}</td>
                    <td>{e.hpId || "—"}</td>
                    <td>{e.vendorId || "—"}</td>
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
                      <button
                        className="btnDanger"
                        onClick={() => handleDelete(e)}
                        disabled={busy}
                      >
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
    </section>
  );
}
