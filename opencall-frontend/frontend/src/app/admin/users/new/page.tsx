"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { USER_SECTIONS } from "../../../../lib/userSections";
import {
  createAdminUser,
  listAdminRegions,
  type AdminRegion,
  type UserRole,
} from "../../../../lib/adminApiClient";
import { readSession, type ClientSession } from "../../../../lib/session";

const ALL_SECTION_KEYS = USER_SECTIONS.map((s) => s.key);

export default function NewAdminUserPage() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("REGION_ADMIN");
  const [regionId, setRegionId] = useState<string>("");
  // Section access (REGION_ADMIN only). Default: every section on (opt-out model),
  // so a new region admin sees everything unless the admin unticks something here.
  const [sections, setSections] = useState<Set<string>>(
    () => new Set(ALL_SECTION_KEYS),
  );
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
    if (requireRegion && sections.size === 0) {
      setError("Select at least one section for a Region Admin");
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
        // Only meaningful for REGION_ADMIN. If every section is ticked, send null
        // ("all sections") so the user isn't pinned to today's exact section list.
        ...(requireRegion
          ? {
              accessibleSections:
                sections.size === ALL_SECTION_KEYS.length
                  ? null
                  : ALL_SECTION_KEYS.filter((k) => sections.has(k)),
            }
          : {}),
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

        {requireRegion && (
          <div className="adminField">
            <span>Section access</span>
            <small className="muted">
              Untick a section to hide it from this user. All on by default.
            </small>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px 16px",
                marginTop: 8,
              }}
            >
              {USER_SECTIONS.map((s) => (
                <label
                  key={s.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sections.has(s.key)}
                    onChange={(e) =>
                      setSections((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.key);
                        else next.delete(s.key);
                        return next;
                      })
                    }
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
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
