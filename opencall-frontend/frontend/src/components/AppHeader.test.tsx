import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppHeader,
  closeOpenDetailsOnOutsideClick,
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
    expect(html).toContain("Home / Dashboards / Overview");
    expect(html).toContain("Generate Report");
    expect(html).toContain("Export");
  });

  it("parses stored compact header preference defensively", () => {
    expect(HEADER_COMPACT_STORAGE_KEY).toBe("opencall.headerCompact");
    expect(parseHeaderCompactPreference("true")).toBe(true);
    expect(parseHeaderCompactPreference("false")).toBe(false);
    expect(parseHeaderCompactPreference("unexpected")).toBeNull();
    expect(parseHeaderCompactPreference(null)).toBeNull();
  });
});

// The header wires this to a document-level pointerdown listener so the profile
// and Export <details> popovers close on any click outside them — natively a
// <details> only toggles via its own <summary>.
describe("closeOpenDetailsOnOutsideClick", () => {
  const OUTSIDE = {} as Node;
  const INSIDE = {} as Node;

  function fakeDetails(open: boolean, ownNodes: readonly Node[] = [INSIDE]) {
    return {
      open,
      contains: (node: Node | null) => ownNodes.includes(node as Node),
    };
  }

  it("closes an open popover when the pointer goes down outside it", () => {
    const details = fakeDetails(true);

    closeOpenDetailsOnOutsideClick([details], OUTSIDE);

    expect(details.open).toBe(false);
  });

  it("leaves the popover open when the pointer goes down inside it", () => {
    const details = fakeDetails(true);

    closeOpenDetailsOnOutsideClick([details], INSIDE);

    expect(details.open).toBe(true);
  });

  it("leaves an already-closed popover alone", () => {
    const details = fakeDetails(false);

    closeOpenDetailsOnOutsideClick([details], OUTSIDE);

    expect(details.open).toBe(false);
  });

  it("skips unmounted popovers and closes on an unknown target", () => {
    const details = fakeDetails(true);

    // null ref (e.g. Export menu not rendered) must not throw; a non-Node
    // event target closes everything open.
    closeOpenDetailsOnOutsideClick([null, details], null);

    expect(details.open).toBe(false);
  });

  it("closes only the popovers the target is outside of", () => {
    const profileNode = {} as Node;
    const profile = fakeDetails(true, [profileNode]);
    const exportMenu = fakeDetails(true);

    // Pointer down inside the profile popover: export closes, profile stays.
    closeOpenDetailsOnOutsideClick([exportMenu, profile], profileNode);

    expect(exportMenu.open).toBe(false);
    expect(profile.open).toBe(true);
  });
});
