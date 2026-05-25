"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { changeOwnPassword } from "../../../lib/adminApiClient";
import {
  clearSession,
  readSession,
  type ClientSession,
} from "../../../lib/session";

export default function ChangeOwnPasswordPage() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      await changeOwnPassword(session.token, {
        currentPassword,
        newPassword,
      });
      setSuccess("Password updated. Please sign in again.");
      clearSession();
      setTimeout(() => router.replace("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginBrand">
          <div className="brandMark large" aria-hidden="true">
            OC
          </div>
          <div>
            <p className="eyebrow">Account</p>
            <h1>Change password</h1>
            <p>
              {session.user.mustChangePassword
                ? "An administrator has reset your password. Choose a new one to continue."
                : "Choose a new password. You will be signed out after the change."}
            </p>
          </div>
        </div>

        {error ? <div className="alert">{error}</div> : null}
        {success ? <div className="alert success">{success}</div> : null}

        <form className="loginForm" onSubmit={handleSubmit}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          >
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
