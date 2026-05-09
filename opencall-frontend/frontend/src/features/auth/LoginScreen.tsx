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
          <div className="brandMark" aria-hidden="true">OC</div>
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
  email,
  isBusy,
  message,
  dbHealth,
  runtimeHealth,
  onEmailChange,
  onSubmit,
}: Readonly<{
  email: string;
  isBusy: boolean;
  message: string | null;
  dbHealth: DatabaseHealthResponse | null;
  runtimeHealth: RuntimeHealthResponse | null;
  onEmailChange: (email: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginBrand">
          <div className="brandMark large" aria-hidden="true">OC</div>
          <div>
            <p className="eyebrow">Open Call</p>
            <h1>Operational Workspace</h1>
            <p>Sign in to upload source reports, generate call plans, and review daily records.</p>
          </div>
        </div>

        {message ? <div className="alert">{message}</div> : null}

        <form className="loginForm" onSubmit={onSubmit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              autoFocus
            />
          </label>
          <button type="submit" disabled={isBusy || !email.trim()}>
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
