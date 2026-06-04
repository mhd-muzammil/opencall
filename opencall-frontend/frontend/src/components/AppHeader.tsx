import React, { useEffect, useState } from "react";
import iconImg from "../app/icon.png";
import type {
  DatabaseHealthResponse,
  LoginResponse,
  RuntimeHealthResponse,
} from "../lib/apiClient";
export type WorkspaceView = "overview" | "records";

export const HEADER_COMPACT_STORAGE_KEY = "opencall.headerCompact";

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

export function parseHeaderCompactPreference(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readHeaderCompactPreference(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseHeaderCompactPreference(
    window.localStorage.getItem(HEADER_COMPACT_STORAGE_KEY),
  );
}

function writeHeaderCompactPreference(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HEADER_COMPACT_STORAGE_KEY, String(value));
}

function HeaderVisibilityIcon({ hidden }: Readonly<{ hidden: boolean }>) {
  return (
    <svg
      className="headerCompactIcon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      focusable="false"
    >
      {hidden ? (
        <>
          <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3.2" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M9.2 5.5A10.6 10.6 0 0 1 12 5c6.1 0 9.5 7 9.5 7a16.7 16.7 0 0 1-3.1 3.8" />
          <path d="M14.6 14.6A3.5 3.5 0 0 1 9.4 9.4" />
          <path d="M6 6.8A16.5 16.5 0 0 0 2.5 12s3.4 7 9.5 7a10.8 10.8 0 0 0 4.1-.8" />
        </>
      )}
    </svg>
  );
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
  initialCompact,
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
  initialCompact?: boolean;
}>) {
  const userDisplayName = displayNameFromEmail(session.user.email);
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const [isHeaderCompact, setIsHeaderCompact] = useState(initialCompact ?? false);

  useEffect(() => {
    if (initialCompact !== undefined) {
      return;
    }

    const savedPreference = readHeaderCompactPreference();

    if (savedPreference !== null) {
      setIsHeaderCompact(savedPreference);
      return;
    }

    if (window.matchMedia?.("(max-width: 640px)").matches) {
      setIsHeaderCompact(true);
    }
  }, [initialCompact]);

  function handleCompactToggle() {
    setIsHeaderCompact((current) => {
      const next = !current;
      writeHeaderCompactPreference(next);
      return next;
    });
  }

  if (isHeaderCompact) {
    return (
      <div className="topBar compact" aria-label="Header hidden">
        <button
          className="iconButton topIconButton headerCompactToggle"
          type="button"
          aria-label="Show header actions"
          title="Show header actions"
          onClick={handleCompactToggle}
        >
          <HeaderVisibilityIcon hidden />
        </button>
      </div>
    );
  }

  return (
    <header className="topBar">
      <div className="brandBlock">
        <div className="brandMark" aria-hidden="true">
          <img
            src={iconImg.src}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
          />
        </div>
        <div>
          <p className="eyebrow">RENDERWAYS TECHNOLOGY</p>
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
              <span className="profileAvatar" aria-hidden="true" style={{ overflow: "hidden" }}>
                <img
                  src={iconImg.src}
                  alt={userInitial}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              </span>
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
          <button
            className="iconButton topIconButton headerCompactToggle"
            type="button"
            aria-label="Hide header actions"
            title="Hide header actions"
            onClick={handleCompactToggle}
          >
            <HeaderVisibilityIcon hidden={false} />
          </button>
        </div>
      </div>
    </header>
  );
}
