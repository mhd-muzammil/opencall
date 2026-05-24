"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createAdminUser,
  listAdminRegions,
  type AdminRegion,
  type UserRole,
} from "../../../../lib/adminApiClient";
import { readSession, type ClientSession } from "../../../../lib/session";

export default function NewAdminUserPage() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("REGION_ADMIN");
  const [regionId, setRegionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    listAdminRegions(session.token).then(setRegions).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load regions"),
    );
  }, [session]);

  // Region selector visibility tracks role per spec point 5.
  const requireRegion = role === "REGION_ADMIN";
  const activeRegions = regions.filter((r) => r.isActive);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);

    if (requireRegion && !regionId) {
      setError("Region is required for REGION_ADMIN");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    setBusy(true);
    try {
      await createAdminUser(session.token, {
        username: username.trim(),
        email: email.trim(),
        password,
        role,
        regionId: requireRegion ? regionId : null,
      });
      router.push("/admin/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>New user</h2>
        </div>
      </div>

      <form className="adminForm" onSubmit={handleSubmit}>
        <label className="adminField">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="chn.alice"
            required
            minLength={3}
            maxLength={64}
            pattern="[a-zA-Z0-9._\-]+"
            autoComplete="off"
          />
        </label>

        <label className="adminField">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alice@example.com"
            required
            autoComplete="off"
          />
        </label>

        <label className="adminField">
          <span>Initial password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={12}
            required
            autoComplete="new-password"
          />
          <small className="muted">
            Minimum 12 characters. The user will be required to change it on
            first login.
          </small>
        </label>

        <label className="adminField">
          <span>Role</span>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as UserRole;
              setRole(next);
              if (next === "SUPER_ADMIN") setRegionId("");
            }}
          >
            <option value="REGION_ADMIN">Region Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </label>

        {requireRegion && (
          <label className="adminField">
            <span>Region</span>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
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

        {error && <div className="adminError">{error}</div>}

        <div className="adminFormActions">
          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
          <button
            type="button"
            className="btnSecondary"
            onClick={() => router.back()}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
