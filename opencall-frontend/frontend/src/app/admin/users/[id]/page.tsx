"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  adminPasswordReset,
  changeAdminUserRole,
  deactivateAdminUser,
  getAdminUser,
  listAdminRegions,
  reactivateAdminUser,
  reassignAdminUserRegion,
  updateAdminUserProfile,
  type AdminRegion,
  type ManagedUser,
  type UserRole,
} from "../../../../lib/adminApiClient";
import { readSession, type ClientSession } from "../../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [session, setSession] = useState<ClientSession | null>(null);
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editable fields
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [pendingRole, setPendingRole] = useState<UserRole>("REGION_ADMIN");
  const [pendingRegionId, setPendingRegionId] = useState("");
  const [reassignRegion, setReassignRegion] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [requirePwChange, setRequirePwChange] = useState(true);

  useEffect(() => {
    setSession(readSession());
  }, []);

  function reload() {
    if (!session || !userId) return;
    setBusy(true);
    Promise.all([getAdminUser(session.token, userId), listAdminRegions(session.token)])
      .then(([u, r]) => {
        setUser(u);
        setRegions(r);
        setEditEmail(u.email);
        setEditUsername(u.username ?? "");
        setPendingRole(u.role);
        setPendingRegionId(u.regionId ?? "");
        setReassignRegion(u.regionId ?? "");
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load user"),
      )
      .finally(() => setBusy(false));
  }

  useEffect(reload, [session, userId]);

  if (!user) {
    return (
      <section className="adminPage">
        {error ? <div className="adminError">{error}</div> : (
          <p className="muted">Loading user…</p>
        )}
      </section>
    );
  }

  const isSelf = session?.user.id === user.id;
  const activeRegions = regions.filter((r) => r.isActive);

  async function withGuard<T>(fn: () => Promise<T>, successMsg: string) {
    if (!session) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
      setInfo(successMsg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>
            {user.username ?? user.email}
            <span className={`adminTag ${user.isActive ? "good" : "bad"}`} style={{ marginLeft: 12 }}>
              {user.isActive ? "Active" : "Inactive"}
            </span>
            {isSelf && (
              <span className="adminTag warn" style={{ marginLeft: 8 }}>
                this is you
              </span>
            )}
          </h2>
        </div>
        <button
          type="button"
          className="btnSecondary"
          onClick={() => router.push("/admin/users")}
        >
          ← Back
        </button>
      </div>

      {error && <div className="adminError">{error}</div>}
      {info && <div className="adminInfo">{info}</div>}

      <div className="adminGrid">
        <div className="panel">
          <h3>Identity</h3>
          <dl className="adminDefList">
            <dt>ID</dt>
            <dd className="mono">{user.id}</dd>
            <dt>Role</dt>
            <dd>{user.role}</dd>
            <dt>Region</dt>
            <dd>
              {user.regionId
                ? regions.find((r) => r.id === user.regionId)?.name ?? user.regionId
                : "—"}
            </dd>
            <dt>Last login</dt>
            <dd>{formatDate(user.lastLoginAt)}</dd>
            <dt>Created</dt>
            <dd>{formatDate(user.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(user.updatedAt)}</dd>
            {user.deactivatedAt && (
              <>
                <dt>Deactivated</dt>
                <dd>{formatDate(user.deactivatedAt)}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="panel">
          <h3>Profile</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Email and username can be edited freely (no governance impact).
          </p>
          <form
            className="adminForm"
            onSubmit={(e) => {
              e.preventDefault();
              const body: { email?: string; username?: string } = {};
              if (editEmail !== user.email) body.email = editEmail.trim();
              if (editUsername !== (user.username ?? "")) {
                body.username = editUsername.trim();
              }
              if (Object.keys(body).length === 0) {
                setInfo("No changes");
                return;
              }
              withGuard(
                () => updateAdminUserProfile(session!.token, user.id, body),
                "Profile updated",
              );
            }}
          >
            <label className="adminField">
              <span>Username</span>
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                minLength={3}
                maxLength={64}
                pattern="[a-zA-Z0-9._\-]+"
              />
            </label>
            <label className="adminField">
              <span>Email</span>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
            </label>
            <div className="adminFormActions">
              <button type="submit" className="btnPrimary" disabled={busy}>
                Save profile
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h3>Role & region</h3>
          {isSelf ? (
            <p className="muted">
              Governance protection: a SUPER_ADMIN cannot modify their own role
              or region.
            </p>
          ) : (
            <form
              className="adminForm"
              onSubmit={(e) => {
                e.preventDefault();
                if (pendingRole === "REGION_ADMIN" && !pendingRegionId) {
                  setError("REGION_ADMIN requires a region");
                  return;
                }
                withGuard(
                  () =>
                    changeAdminUserRole(session!.token, user.id, {
                      role: pendingRole,
                      regionId:
                        pendingRole === "REGION_ADMIN" ? pendingRegionId : null,
                    }),
                  "Role updated. Outstanding sessions revoked.",
                );
              }}
            >
              <label className="adminField">
                <span>Role</span>
                <select
                  value={pendingRole}
                  onChange={(e) => {
                    const next = e.target.value as UserRole;
                    setPendingRole(next);
                    if (next === "SUPER_ADMIN") setPendingRegionId("");
                  }}
                >
                  <option value="REGION_ADMIN">Region Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </label>
              {pendingRole === "REGION_ADMIN" && (
                <label className="adminField">
                  <span>Region</span>
                  <select
                    value={pendingRegionId}
                    onChange={(e) => setPendingRegionId(e.target.value)}
                    required
                  >
                    <option value="">Select region…</option>
                    {activeRegions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="adminFormActions">
                <button type="submit" className="btnPrimary" disabled={busy}>
                  Change role
                </button>
              </div>
            </form>
          )}
        </div>

        {user.role === "REGION_ADMIN" && !isSelf && (
          <div className="panel">
            <h3>Reassign region</h3>
            <form
              className="adminForm"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reassignRegion) {
                  setError("Pick a region");
                  return;
                }
                withGuard(
                  () =>
                    reassignAdminUserRegion(session!.token, user.id, reassignRegion),
                  "Region reassigned. Outstanding sessions revoked.",
                );
              }}
            >
              <label className="adminField">
                <span>New region</span>
                <select
                  value={reassignRegion}
                  onChange={(e) => setReassignRegion(e.target.value)}
                  required
                >
                  {activeRegions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="adminFormActions">
                <button type="submit" className="btnPrimary" disabled={busy}>
                  Reassign
                </button>
              </div>
            </form>
          </div>
        )}

        {!isSelf && (
          <div className="panel">
            <h3>Account status</h3>
            {user.isActive ? (
              <>
                <p className="muted" style={{ marginBottom: 12 }}>
                  Deactivation revokes outstanding sessions. The last active
                  SUPER_ADMIN cannot be deactivated.
                </p>
                <button
                  type="button"
                  className="btnDanger"
                  disabled={busy}
                  onClick={() =>
                    withGuard(
                      () => deactivateAdminUser(session!.token, user.id),
                      "User deactivated",
                    )
                  }
                >
                  Deactivate user
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btnPrimary"
                disabled={busy}
                onClick={() =>
                  withGuard(
                    () => reactivateAdminUser(session!.token, user.id),
                    "User reactivated",
                  )
                }
              >
                Reactivate user
              </button>
            )}
          </div>
        )}

        {!isSelf && user.isActive && (
          <div className="panel">
            <h3>Reset password</h3>
            <form
              className="adminForm"
              onSubmit={(e) => {
                e.preventDefault();
                if (newPassword.length < 12) {
                  setError("Password must be at least 12 characters");
                  return;
                }
                withGuard(async () => {
                  await adminPasswordReset(session!.token, user.id, {
                    newPassword,
                    requireChangeOnNextLogin: requirePwChange,
                  });
                  setNewPassword("");
                }, "Password reset. The user's outstanding sessions were revoked.");
              }}
            >
              <label className="adminField">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="adminFieldInline">
                <input
                  type="checkbox"
                  checked={requirePwChange}
                  onChange={(e) => setRequirePwChange(e.target.checked)}
                />
                Require change on next login
              </label>
              <div className="adminFormActions">
                <button type="submit" className="btnPrimary" disabled={busy}>
                  Reset password
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
