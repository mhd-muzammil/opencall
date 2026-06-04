import iconImg from "../../app/icon.png";
import type {
  DatabaseHealthResponse,
  RuntimeHealthResponse,
} from "../../lib/apiClient";
import { StatusPill } from "../../components/StatusPill";

export function SessionLoadingScreen() {
  return (
    <main className="loginShell">
      <section className="loginCard loading">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            <img
              src={iconImg.src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
            />
          </div>
          <div>
            <p className="eyebrow">Open Call</p>
            <h1>Loading workspace</h1>
          </div>
        </div>
      </section>
    </main>
  );
}

export function LoginScreen({
  username,
  password,
  isBusy,
  message,
  dbHealth,
  runtimeHealth,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: Readonly<{
  username: string;
  password: string;
  isBusy: boolean;
  message: string | null;
  dbHealth: DatabaseHealthResponse | null;
  runtimeHealth: RuntimeHealthResponse | null;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginBrand">
          <div className="brandMark large" aria-hidden="true">
            <img
              src={iconImg.src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
            />
          </div>
          <div>
            <p className="eyebrow">Open Call</p>
            <h1>Operational Workspace</h1>
            <p>Sign in to upload source reports, generate call plans, and review daily records.</p>
          </div>
        </div>

        {message ? <div className="alert">{message}</div> : null}

        <form className="loginForm" onSubmit={onSubmit}>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="opencall"
              autoComplete="username"
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={isBusy || !username.trim() || !password}>
            {isBusy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="loginStatusGrid" aria-label="System status">
          <StatusPill tone={dbHealth?.connected ? "good" : "bad"}>
            DB {dbHealth?.connected ? "connected" : dbHealth?.status ?? "checking"}
          </StatusPill>
          <StatusPill tone={runtimeHealth?.ok ? "good" : "bad"}>
            Runtime {runtimeHealth?.ok ? "ready" : runtimeHealth?.status ?? "checking"}
          </StatusPill>
        </div>
      </section>
    </main>
  );
}
