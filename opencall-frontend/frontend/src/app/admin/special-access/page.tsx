"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listAdminRegions,
  type AdminRegion,
} from "../../../lib/adminApiClient";
import {
  getSpecialAccessOptions,
  listAccessRoles,
  createAccessRole,
  deleteAccessRole,
  listSpecialAccess,
  createSpecialAccess,
  updateSpecialAccess,
  resetSpecialAccessPassword,
  deleteSpecialAccess,
  type SpecialAccessOptions,
  type AccessRole,
  type SpecialAccessRecord,
  type DataScope,
  type PermissionLevel,
} from "../../../lib/specialAccessApiClient";
import {
  fetchSpecialAccessLoginHistory,
  fetchSpecialAccessLoginSummary,
  type LoginLocationEntry,
  type LoginLocationSummaryItem,
} from "../../../lib/loginActivityApiClient";
import {
  LoginHistoryModal,
  LoginLocationCell,
} from "../../../features/admin/LoginLocation";
import { readSession, type ClientSession } from "../../../lib/session";

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function SpecialAccessPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [options, setOptions] = useState<SpecialAccessOptions | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [logins, setLogins] = useState<SpecialAccessRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession());
    setLoaded(true);
  }, []);

  const token = session?.token ?? null;

  async function refreshRoles(t: string) {
    setRoles(await listAccessRoles(t, true));
  }
  async function refreshLogins(t: string) {
    setLogins(await listSpecialAccess(t));
  }

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [opts, regs, rls, lgs] = await Promise.all([
          getSpecialAccessOptions(token),
          listAdminRegions(token),
          listAccessRoles(token, true),
          listSpecialAccess(token),
        ]);
        setOptions(opts);
        setRegions(regs);
        setRoles(rls);
        setLogins(lgs);
      } catch (e) {
        setError(errMsg(e, "Failed to load special access data"));
      }
    })();
  }, [token]);

  const activeRegions = useMemo(
    () => regions.filter((r) => r.isActive),
    [regions],
  );

  if (loaded && (!session || session.user.role !== "SUPER_ADMIN")) {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <h2>Special Access</h2>
        </div>
        <div className="adminError">
          Only a Super Admin can manage special access.
        </div>
      </section>
    );
  }

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Special Access</h2>
          <p className="muted">
            Create scoped logins (username + password) and reusable custom roles.
            Each login sees only the sections, regions and data you grant.
          </p>
        </div>
      </div>

      {error && <div className="adminError">{error}</div>}
      {notice && <div className="adminNotice">{notice}</div>}

      {token && options && (
        <>
          <RolesPanel
            token={token}
            options={options}
            roles={roles}
            onChanged={async () => {
              try {
                await refreshRoles(token);
                setNotice("Roles updated.");
                setError(null);
              } catch (e) {
                setError(errMsg(e, "Failed to refresh roles"));
              }
            }}
            onError={setError}
          />

          <LoginsPanel
            token={token}
            options={options}
            regions={activeRegions}
            roles={roles.filter((r) => r.isActive)}
            logins={logins}
            onChanged={async () => {
              try {
                await refreshLogins(token);
                setNotice("Logins updated.");
                setError(null);
              } catch (e) {
                setError(errMsg(e, "Failed to refresh logins"));
              }
            }}
            onError={setError}
          />
        </>
      )}
    </section>
  );
}

// ------------------------------ Roles ------------------------------

function RolesPanel({
  token,
  options,
  roles,
  onChanged,
  onError,
}: {
  token: string;
  options: SpecialAccessOptions;
  roles: AccessRole[];
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [dataScope, setDataScope] = useState<DataScope>("overall");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("view");
  const [busy, setBusy] = useState(false);

  function toggleSection(key: string) {
    setSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createAccessRole(token, {
        name: name.trim(),
        description: description.trim() || null,
        defaultSections: sections,
        defaultDataScope: dataScope,
        defaultPermissionLevel: permissionLevel,
      });
      setName("");
      setDescription("");
      setSections([]);
      setDataScope("overall");
      setPermissionLevel("view");
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to create role"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(role: AccessRole) {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await deleteAccessRole(token, role.id);
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to delete role"));
    }
  }

  return (
    <div className="panel">
      <h3>Custom roles</h3>
      <p className="muted">
        A role bundles default sections, data scope and permission level so you
        can reuse it when creating logins.
      </p>

      {roles.length > 0 && (
        <div className="tableScroll">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sections</th>
                <th>Data</th>
                <th>Permission</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.description && (
                      <>
                        <br />
                        <small className="muted">{r.description}</small>
                      </>
                    )}
                  </td>
                  <td>{r.defaultSections.length}</td>
                  <td>{r.defaultDataScope}</td>
                  <td>{r.defaultPermissionLevel}</td>
                  <td>{r.isActive ? "Active" : "Inactive"}</td>
                  <td>
                    <button
                      type="button"
                      className="btnGhost danger"
                      onClick={() => remove(r)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="adminForm" onSubmit={submit}>
        <h4>New role</h4>
        <label className="adminField">
          <span>Role name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Warranty Viewer"
            required
            maxLength={80}
          />
        </label>
        <label className="adminField">
          <span>Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </label>

        <fieldset className="adminField">
          <span>Default sections</span>
          <div className="checkGrid">
            {options.sections.map((s) => (
              <label key={s.key} className="checkItem">
                <input
                  type="checkbox"
                  checked={sections.includes(s.key)}
                  onChange={() => toggleSection(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="adminField">
          <span>Default data scope</span>
          <select
            value={dataScope}
            onChange={(e) => setDataScope(e.target.value as DataScope)}
          >
            {options.dataScopes.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} — {d.description}
              </option>
            ))}
          </select>
        </label>

        <label className="adminField">
          <span>Default permission</span>
          <select
            value={permissionLevel}
            onChange={(e) => setPermissionLevel(e.target.value as PermissionLevel)}
          >
            {options.permissionLevels.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.description}
              </option>
            ))}
          </select>
        </label>

        <div className="adminFormActions">
          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? "Creating…" : "Create role"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------ Logins ------------------------------

function LoginsPanel({
  token,
  options,
  regions,
  roles,
  logins,
  onChanged,
  onError,
}: {
  token: string;
  options: SpecialAccessOptions;
  regions: AdminRegion[];
  roles: AccessRole[];
  logins: SpecialAccessRecord[];
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [sections, setSections] = useState<string[]>([]);
  const [allRegions, setAllRegions] = useState(false);
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [dataScope, setDataScope] = useState<DataScope>("overall");
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("view");
  const [busy, setBusy] = useState(false);
  const [locationSummary, setLocationSummary] = useState<LoginLocationSummaryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyEntries, setHistoryEntries] = useState<LoginLocationEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const regionName = useMemo(() => {
    const map = new Map(regions.map((r) => [r.id, `${r.name} (${r.code})`]));
    return (id: string) => map.get(id) ?? id;
  }, [regions]);

  // Login-location summary loads independently; failure just leaves the column empty.
  useEffect(() => {
    let cancelled = false;
    fetchSpecialAccessLoginSummary(token)
      .then((s) => {
        if (!cancelled) setLocationSummary(s);
      })
      .catch(() => {
        /* optional column — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [token, logins]);

  const locationByLogin = useMemo(() => {
    const m = new Map<string, LoginLocationSummaryItem>();
    for (const s of locationSummary) m.set(s.principalId, s);
    return m;
  }, [locationSummary]);

  async function openHistory(rec: SpecialAccessRecord) {
    setHistoryOpen(true);
    setHistoryTitle(rec.username);
    setHistoryEntries([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const entries = await fetchSpecialAccessLoginHistory(token, rec.id);
      setHistoryEntries(entries);
    } catch (e) {
      setHistoryError(errMsg(e, "Failed to load login history"));
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleSection(key: string) {
    setSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }
  function toggleRegion(id: string) {
    setRegionIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  // Picking a role prefills the scope fields (still fully editable per login).
  function applyRole(id: string) {
    setRoleId(id);
    const role = roles.find((r) => r.id === id);
    if (role) {
      setSections(role.defaultSections);
      setDataScope(role.defaultDataScope);
      setPermissionLevel(role.defaultPermissionLevel);
    }
  }

  function resetForm() {
    setUsername("");
    setPassword("");
    setRoleId("");
    setSections([]);
    setAllRegions(false);
    setRegionIds([]);
    setDataScope("overall");
    setPermissionLevel("view");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sections.length === 0) {
      onError("Grant at least one section.");
      return;
    }
    if (!allRegions && regionIds.length === 0) {
      onError("Select at least one region, or grant all regions.");
      return;
    }
    if (password.length < 8) {
      onError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await createSpecialAccess(token, {
        username: username.trim(),
        password,
        roleId: roleId || null,
        sections,
        allRegions,
        regions: allRegions ? [] : regionIds,
        dataScope,
        permissionLevel,
      });
      resetForm();
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to create login"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(rec: SpecialAccessRecord) {
    try {
      await updateSpecialAccess(token, rec.id, { isActive: !rec.isActive });
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to update login"));
    }
  }

  async function resetPw(rec: SpecialAccessRecord) {
    const pw = window.prompt(`New password for "${rec.username}" (min 8 chars)`);
    if (!pw) return;
    if (pw.length < 8) {
      onError("Password must be at least 8 characters.");
      return;
    }
    try {
      await resetSpecialAccessPassword(token, rec.id, pw);
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to reset password"));
    }
  }

  async function remove(rec: SpecialAccessRecord) {
    if (!window.confirm(`Delete login "${rec.username}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteSpecialAccess(token, rec.id);
      onChanged();
    } catch (err) {
      onError(errMsg(err, "Failed to delete login"));
    }
  }

  return (
    <div className="panel">
      <h3>Scoped logins</h3>

      {logins.length > 0 && (
        <div className="tableScroll">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Sections</th>
                <th>Regions</th>
                <th>Data</th>
                <th>Permission</th>
                <th>Status</th>
                <th>Last location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {logins.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.username}</strong></td>
                  <td>{l.roleName ?? "—"}</td>
                  <td>{l.sections.join(", ") || "—"}</td>
                  <td>
                    {l.allRegions
                      ? "All regions"
                      : l.regions.map(regionName).join(", ") || "—"}
                  </td>
                  <td>{l.dataScope}</td>
                  <td>{l.permissionLevel}</td>
                  <td>{l.isActive ? "Active" : "Inactive"}</td>
                  <td>
                    <LoginLocationCell
                      summary={locationByLogin.get(l.id)}
                      onOpenHistory={() => void openHistory(l)}
                    />
                  </td>
                  <td>
                    <div className="rowActions">
                      <button
                        type="button"
                        className="btnGhost"
                        onClick={() => toggleActive(l)}
                      >
                        {l.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="btnGhost"
                        onClick={() => resetPw(l)}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btnGhost danger"
                        onClick={() => remove(l)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="adminForm" onSubmit={submit}>
        <h4>New login</h4>

        <label className="adminField">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. deva"
            required
            minLength={3}
            maxLength={64}
            pattern="[a-zA-Z0-9._\-]+"
            autoComplete="off"
          />
        </label>

        <label className="adminField">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
          <small className="muted">Minimum 8 characters.</small>
        </label>

        {roles.length > 0 && (
          <label className="adminField">
            <span>Role (optional — prefills the fields below)</span>
            <select value={roleId} onChange={(e) => applyRole(e.target.value)}>
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="adminField">
          <span>Sections</span>
          <div className="checkGrid">
            {options.sections.map((s) => (
              <label key={s.key} className="checkItem">
                <input
                  type="checkbox"
                  checked={sections.includes(s.key)}
                  onChange={() => toggleSection(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="adminField">
          <span>Regions</span>
          <label className="checkItem">
            <input
              type="checkbox"
              checked={allRegions}
              onChange={(e) => setAllRegions(e.target.checked)}
            />
            All regions
          </label>
          {!allRegions && (
            <div className="checkGrid">
              {regions.map((r) => (
                <label key={r.id} className="checkItem">
                  <input
                    type="checkbox"
                    checked={regionIds.includes(r.id)}
                    onChange={() => toggleRegion(r.id)}
                  />
                  {r.name} ({r.code})
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <label className="adminField">
          <span>Data scope</span>
          <select
            value={dataScope}
            onChange={(e) => setDataScope(e.target.value as DataScope)}
          >
            {options.dataScopes.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} — {d.description}
              </option>
            ))}
          </select>
        </label>

        <label className="adminField">
          <span>Permission</span>
          <select
            value={permissionLevel}
            onChange={(e) => setPermissionLevel(e.target.value as PermissionLevel)}
          >
            {options.permissionLevels.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.description}
              </option>
            ))}
          </select>
        </label>

        <div className="adminFormActions">
          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? "Creating…" : "Create login"}
          </button>
        </div>
      </form>

      <LoginHistoryModal
        open={historyOpen}
        title={historyTitle}
        entries={historyEntries}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
