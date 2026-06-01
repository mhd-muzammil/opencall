import type {
  DatabaseHealthResponse,
  LoginResponse,
  RuntimeHealthResponse,
} from "../lib/apiClient";
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
  hasBatches,
  isBusy,
  dbHealth,
  runtimeHealth,
  session,
  onWorkspaceViewChange,
  onRefreshHealth,
  onOpenUpload,
  onOpenHistory,
  onGenerateReport,
  onExportXlsx,
  onExportCsv,
  onLogout,
}: Readonly<{
  workspaceView: WorkspaceView;
  hasReport: boolean;
  hasBatches: boolean;
  isBusy: boolean;
  dbHealth: DatabaseHealthResponse | null;
  runtimeHealth: RuntimeHealthResponse | null;
  session: LoginResponse;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  onRefreshHealth: () => void;
  onOpenUpload: () => void;
  onOpenHistory: () => void;
  onGenerateReport: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
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
        <div className="headerPrimaryActions">
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
          {session.user.regionId ? (
            <span className="regionScopePill">Region {session.user.regionId.slice(0, 8)}</span>
          ) : null}
          {session.user.role === "SUPER_ADMIN" ? (
            <button
              className="iconButton topIconButton uploadAction"
              type="button"
              onClick={onOpenUpload}
              title="Upload source files"
            >
              <span aria-hidden="true" />
              Upload Files
            </button>
          ) : null}
          <button
            className="iconButton topIconButton historyAction"
            type="button"
            onClick={onOpenHistory}
            title="Report history"
          >
            <span aria-hidden="true" />
            History
          </button>
          {session.user.role === "SUPER_ADMIN" ? (
            <button
              className="topIconButton generateAction"
              type="button"
              disabled={isBusy || !hasBatches}
              onClick={onGenerateReport}
              title="Generate report from current batches"
            >
              <span aria-hidden="true" />
              Generate Report
            </button>
          ) : null}
          <details className="exportMenu">
            <summary aria-label="Open export actions">Export</summary>
            <div className="exportDropdown">
              <button type="button" disabled={!hasReport} onClick={onExportXlsx}>
                Excel (.xlsx)
              </button>
              <button type="button" disabled={!hasReport} onClick={onExportCsv}>
                CSV
              </button>
            </div>
          </details>
        </div>
        <div className="headerUtilityActions">
          <button
            className="iconButton topIconButton refreshAction"
            type="button"
            onClick={onRefreshHealth}
            title="Refresh health"
          >
            <span aria-hidden="true" />
            Refresh
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
              {session.user.role === "SUPER_ADMIN" || session.user.role === "REGION_ADMIN" ? (
                <a className="profileMenuItem" href={session.user.role === "SUPER_ADMIN" ? "/admin/users" : "/admin/engineers"}>
                  Admin Console
                </a>
              ) : null}
              <a className="profileMenuItem" href="/me/password">
                Change password
              </a>
              <button className="profileMenuItem danger" type="button" onClick={onLogout}>
                Log out
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
