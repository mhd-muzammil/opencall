import type {
  DatabaseHealthResponse,
  LoginResponse,
  RuntimeHealthResponse,
} from "../lib/apiClient";
import { StatusPill } from "./StatusPill";

export type WorkspaceView = "overview" | "records";

function formatRoleLabel(role: LoginResponse["user"]["role"]): string {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function displayNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  return localPart || email;
}

export function AppHeader({
  workspaceView,
  hasReport,
  dbHealth,
  runtimeHealth,
  session,
  isHistoryPanelOpen,
  onWorkspaceViewChange,
  onRefreshHealth,
  onToggleHistory,
  onLogout,
}: Readonly<{
  workspaceView: WorkspaceView;
  hasReport: boolean;
  dbHealth: DatabaseHealthResponse | null;
  runtimeHealth: RuntimeHealthResponse | null;
  session: LoginResponse;
  isHistoryPanelOpen: boolean;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  onRefreshHealth: () => void;
  onToggleHistory: () => void;
  onLogout: () => void;
}>) {
  const userDisplayName = displayNameFromEmail(session.user.email);
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <header className="topBar">
      <div className="brandBlock">
        <div className="brandMark" aria-hidden="true">OC</div>
        <div>
          <p className="eyebrow">Open Call</p>
          <h1>{workspaceView === "records" ? "Records Workspace" : "Operational Overview"}</h1>
        </div>
      </div>
      <div className="topActions">
        <div className="workspaceTabs" aria-label="Workspace view">
          <button
            className={workspaceView === "overview" ? "active" : ""}
            type="button"
            onClick={() => onWorkspaceViewChange("overview")}
          >
            Dashboard
          </button>
          <button
            className={workspaceView === "records" ? "active" : ""}
            type="button"
            disabled={!hasReport}
            onClick={() => onWorkspaceViewChange("records")}
          >
            Records
          </button>
        </div>
        <StatusPill tone={dbHealth?.connected ? "good" : "bad"}>
          DB {dbHealth?.connected ? "connected" : dbHealth?.status ?? "checking"}
        </StatusPill>
        <StatusPill tone={runtimeHealth?.ok ? "good" : "bad"}>
          Runtime {runtimeHealth?.ok ? "ready" : runtimeHealth?.status ?? "checking"}
        </StatusPill>
        <button
          className="iconButton topIconButton refreshAction"
          type="button"
          onClick={onRefreshHealth}
          title="Refresh health"
        >
          <span aria-hidden="true" />
          Refresh
        </button>
        <button
          className="iconButton topIconButton historyAction"
          type="button"
          onClick={onToggleHistory}
          title="Report history"
        >
          <span aria-hidden="true" />
          {isHistoryPanelOpen ? "Close History" : "History"}
        </button>
        <details className="profileMenu">
          <summary aria-label="Open profile menu">
            <span className="profileAvatar" aria-hidden="true">{userInitial}</span>
          </summary>
          <div className="profileDropdown">
            <div className="profileIdentity">
              <strong>{userDisplayName}</strong>
              <span>{session.user.email}</span>
              <em>{formatRoleLabel(session.user.role)}</em>
            </div>
            <button className="profileMenuItem" type="button">
              Settings
            </button>
            <button className="profileMenuItem danger" type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
