import React from "react";
import iconImg from "../app/icon.png";
import type {
  DatabaseHealthResponse,
  LoginResponse,
  RuntimeHealthResponse,
} from "../lib/apiClient";

export type WorkspaceView = "overview" | "closed-calls" | "records" | "record-format" | "parts-catalog" | "quotations" | "rtpl" | "rtpl-dashboard" | "pivot" | "flex" | "productivity" | "tn-view-status" | "sla-tat" | "flex-eod-bod" | "admin-engineers" | "admin-rtpl-statuses" | "warranty" | "renewal-pipeline" | "vendor-dashboard";

export const HEADER_COMPACT_STORAGE_KEY = "opencall.headerCompact";

export function parseHeaderCompactPreference(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * Close any open <details> popover when the pointer goes down outside it. Native
 * <details> only toggles via its own <summary>, so without this the profile and
 * Export menus stay open until the trigger is clicked a second time.
 * A pointer-down inside the element (including its summary) leaves it alone —
 * the summary's own click still toggles it closed.
 */
export function closeOpenDetailsOnOutsideClick(
  detailsElements: ReadonlyArray<Pick<HTMLDetailsElement, "open" | "contains"> | null>,
  target: Node | null,
): void {
  for (const details of detailsElements) {
    if (details?.open && (target === null || !details.contains(target))) {
      details.open = false;
    }
  }
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
  const exportDetailsRef = React.useRef<HTMLDetailsElement | null>(null);
  const profileDetailsRef = React.useRef<HTMLDetailsElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      closeOpenDetailsOnOutsideClick(
        [exportDetailsRef.current, profileDetailsRef.current],
        event.target instanceof Node ? event.target : null,
      );
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const userDisplayName =
    (session.user.email ? session.user.email.split("@")[0] : null) ||
    session.user.username ||
    "user";
  const roleLabel = session.user.role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");

  // Admin Console entry point. Super/region admins are unchanged. A special-access
  // login only gets one when a console section is actually granted to it — today
  // that is Record Format, so it lands straight on that page.
  const adminConsoleHref = ((): string | null => {
    if (session.user.role === "SUPER_ADMIN") return "/admin/users";
    if (session.user.role === "REGION_ADMIN") return "/admin/engineers";
    if (
      session.user.role === "SPECIAL_ACCESS" &&
      session.user.specialAccess?.sections?.includes("record-format")
    ) {
      return "/admin/record-format";
    }
    return null;
  })();

  const getViewTitle = () => {
    switch (workspaceView) {
      case "records":
        return "Records Workspace";
      case "record-format":
        return "Record Format";
      case "parts-catalog":
        return "Parts Catalog";
      case "quotations":
        return "Quotations";
      case "rtpl":
        return "RTPL Analytics";
      case "rtpl-dashboard":
        return "RTPL Dashboard";
      case "pivot":
        return "WIP Aging Pivot Table";
      case "flex":
        return "Flex Dashboard";
      case "productivity":
        return "Engineer Productivity";
      case "tn-view-status":
        return "TN VIEW Status";
      case "sla-tat":
        return "SLA TaT Summary";
      case "flex-eod-bod":
        return "Flex EOD & BOD Dashboard";
      case "admin-engineers":
        return "Add Engineers";
      case "admin-rtpl-statuses":
        return "RTPL Statuses";
      case "warranty":
        return "HP Warranty Lookup";
      case "renewal-pipeline":
        return "Renewal Pipeline";
      default:
        return "Operational Overview";
    }
  };

  const getViewBreadcrumb = () => {
    switch (workspaceView) {
      case "records":
        return "Data & Operations / Records";
      case "record-format":
        return "Data & Operations / Record Format";
      case "parts-catalog":
        return "Data & Operations / Parts Catalog";
      case "quotations":
        return "Data & Operations / Quotations";
      case "rtpl":
        return "Dashboards / RTPL";
      case "rtpl-dashboard":
        return "Dashboards / RTPL Dashboard";
      case "pivot":
        return "Dashboards / WIP Aging";
      case "flex":
        return "Dashboards / Flex";
      case "productivity":
        return "Dashboards / Engineer Productivity";
      case "tn-view-status":
        return "Dashboards / TN VIEW Status";
      case "sla-tat":
        return "Dashboards / SLA TaT";
      case "flex-eod-bod":
        return "Dashboards / Flex EOD & BOD";
      case "admin-engineers":
        return "Administration / Engineers";
      case "admin-rtpl-statuses":
        return "Administration / RTPL Statuses";
      case "warranty":
        return "Data & Operations / Warranty Lookup";
      case "renewal-pipeline":
        return "Data & Operations / Renewal Pipeline";
      default:
        return "Dashboards / Overview";
    }
  };

  return (
    <header className="mainHeader">
      <div className="headerBreadcrumbs">
        <span className="breadcrumbParent">Home / {getViewBreadcrumb()}</span>
        <h1 className="breadcrumbTitle">{getViewTitle()}</h1>
      </div>

      <div className="headerRight">

        {/* Primary Operational Actions */}
        <div className="headerActionsGroup">
          {(session.user.role === "SUPER_ADMIN" || session.user.role === "REGION_ADMIN") && (
            <button
              className="premiumActionBtn primary"
              type="button"
              disabled={isBusy || !hasBatches}
              onClick={onGenerateReport}
              title="Generate report from current batches"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px" }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Generate Report
            </button>
          )}

          {hasReport && (
            <details className="exportMenuDetails" ref={exportDetailsRef}>
              <summary className="premiumActionBtn secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "4px" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </summary>
              <div className="exportDropdownPopover">
                <button type="button" onClick={onExportXlsx}>
                  Microsoft Excel (.xlsx)
                </button>
                <button type="button" onClick={onExportCsv}>
                  Comma Separated (.csv)
                </button>
              </div>
            </details>
          )}

          {session.user.regionId && (
            <span className="regionPill">
              Region: {session.user.regionId.toUpperCase()}
            </span>
          )}
        </div>

        {/* User Profile */}
        <details className="headerProfileDetails" ref={profileDetailsRef}>
          <summary className="headerProfileTrigger">
            <div className="profileAvatarWrap">
              <img
                src={iconImg.src}
                alt={userDisplayName.charAt(0).toUpperCase()}
              />
            </div>
          </summary>
          <div className="profileDropdownPopover">
            <div className="profileIdentityBlock">
              <strong>{userDisplayName}</strong>
              <span className="profileEmail">{session.user.email}</span>
              <span className="profileRoleBadge">{roleLabel}</span>
            </div>
            {adminConsoleHref ? (
              <a className="profilePopoverItem" href={adminConsoleHref}>
                Admin Console
              </a>
            ) : null}
            <a className="profilePopoverItem" href="/me/password">
              Change Password
            </a>
            <button className="profilePopoverItem logoutBtn" type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
