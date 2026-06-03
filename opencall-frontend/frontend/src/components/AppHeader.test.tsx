import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppHeader,
  HEADER_COMPACT_STORAGE_KEY,
  parseHeaderCompactPreference,
  type WorkspaceView,
} from "./AppHeader";
import type {
  DatabaseHealthResponse,
  LoginResponse,
  RuntimeHealthResponse,
} from "../lib/apiClient";

const session: LoginResponse = {
  token: "token",
  user: {
    id: "user-1",
    email: "admin@example.com",
    username: "admin",
    role: "SUPER_ADMIN",
    regionId: null,
    region_id: null,
    mustChangePassword: false,
  },
};

function renderHeader(
  overrides: Partial<Parameters<typeof AppHeader>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(AppHeader, {
      workspaceView: "overview" as WorkspaceView,
      hasReport: true,
      hasBatches: true,
      isBusy: false,
      dbHealth: null as DatabaseHealthResponse | null,
      runtimeHealth: null as RuntimeHealthResponse | null,
      session,
      onWorkspaceViewChange: vi.fn(),
      onRefreshHealth: vi.fn(),
      onOpenUpload: vi.fn(),
      onOpenHistory: vi.fn(),
      onGenerateReport: vi.fn(),
      onExportXlsx: vi.fn(),
      onExportCsv: vi.fn(),
      onLogout: vi.fn(),
      ...overrides,
    }),
  );
}

describe("AppHeader", () => {
  it("renders all operational actions in full mode", () => {
    const html = renderHeader();

    expect(html).toContain("Operational Overview");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Records");
    expect(html).toContain("Upload Files");
    expect(html).toContain("History");
    expect(html).toContain("Generate Report");
    expect(html).toContain("Export");
    expect(html).toContain("Refresh");
    expect(html).toContain("Hide header actions");
  });

  it("renders only the reveal control while the header is hidden", () => {
    const html = renderHeader({ initialCompact: true });

    expect(html).toContain('class="topBar compact"');
    expect(html).toContain("Show header actions");
    expect(html).toContain("headerCompactIcon");
    expect(html).not.toContain(">Show header<");
    expect(html).not.toContain("OC");
    expect(html).not.toContain("Operational Overview");
    expect(html).not.toContain("Open profile menu");
    expect(html).not.toContain("Upload Files");
    expect(html).not.toContain("Generate Report");
    expect(html).not.toContain("Refresh");
  });

  it("parses stored compact header preference defensively", () => {
    expect(HEADER_COMPACT_STORAGE_KEY).toBe("opencall.headerCompact");
    expect(parseHeaderCompactPreference("true")).toBe(true);
    expect(parseHeaderCompactPreference("false")).toBe(false);
    expect(parseHeaderCompactPreference("unexpected")).toBeNull();
    expect(parseHeaderCompactPreference(null)).toBeNull();
  });
});
