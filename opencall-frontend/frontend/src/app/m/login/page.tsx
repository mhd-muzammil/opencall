"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "../../../lib/apiClient";
import { useMobileSession } from "../session";

/**
 * Mobile login. Uses exactly the same auth endpoint and localStorage keys as the web
 * app, so a session started here is the same session the web recognises.
 */
export default function MobileLoginPage() {
  const router = useRouter();
  const { refreshSession } = useMobileSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = username.trim();
    if (!user || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await login(user, password);
      // Special-access logins carry their scope on a sibling field; fold it onto the
      // stored user so the whole session travels together (same as the web app).
      const storedUser = next.specialAccess
        ? { ...next.user, specialAccess: next.specialAccess }
        : next.user;
      window.localStorage.setItem("opencall.token", next.token);
      window.localStorage.setItem("opencall.user", JSON.stringify(storedUser));
      refreshSession();
      router.replace(next.user.mustChangePassword ? "/me/password" : "/m");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "28px 22px calc(28px + env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ marginBottom: 26 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            background: "var(--m-primary)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 16,
          }}
          aria-hidden="true"
        >
          R
        </div>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: "-0.6px" }}>
          Welcome back
        </h1>
        <p className="mMuted" style={{ margin: "6px 0 0" }}>
          Sign in to your Renderways operations account.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        {error && <div className="mError">{error}</div>}

        <label className="mField">
          <span>Username</span>
          <input
            className="mInput"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="text"
            placeholder="your username"
          />
        </label>

        <label className="mField">
          <span>Password</span>
          <div style={{ position: "relative" }}>
            <input
              className="mInput"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ paddingRight: 52 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 40,
                height: 40,
                border: "none",
                background: "transparent",
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>

        <button type="submit" className="mBtn" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mMuted" style={{ textAlign: "center", marginTop: 22, fontSize: 12 }}>
        Renderways Technology Pvt Ltd
      </p>
    </main>
  );
}
