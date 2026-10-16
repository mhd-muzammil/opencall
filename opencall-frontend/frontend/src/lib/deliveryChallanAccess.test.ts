import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../components/AppHeader";
import type { LoginResponse } from "./apiClient";
import { canSeeDeliveryChallans, DELIVERY_CHALLAN_SECTION } from "./deliveryChallanAccess";
import { USER_SECTION_KEYS } from "./userSections";

/**
 * Who gets the Delivery Challan sidebar entry (and its panel): the Quotations rule, with
 * the section's own key — never Quotations' grant standing in for it.
 */

/** A login granted exactly these sections. */
const granted =
  (...keys: string[]) =>
  (key: string) =>
    keys.includes(key);

describe("canSeeDeliveryChallans", () => {
  it("a super admin always sees it", () => {
    expect(
      canSeeDeliveryChallans({ role: "SUPER_ADMIN", isSpecialAccess: false, canSeeSection: granted() }),
    ).toBe(true);
  });

  it("a special-access login sees it only when the delivery-challans section is granted", () => {
    expect(
      canSeeDeliveryChallans({
        role: "SPECIAL_ACCESS",
        isSpecialAccess: true,
        canSeeSection: granted("delivery-challans"),
      }),
    ).toBe(true);
    expect(
      canSeeDeliveryChallans({ role: "SPECIAL_ACCESS", isSpecialAccess: true, canSeeSection: granted() }),
    ).toBe(false);
  });

  it("the Quotations grant is not this section's grant", () => {
    expect(
      canSeeDeliveryChallans({
        role: "SPECIAL_ACCESS",
        isSpecialAccess: true,
        canSeeSection: granted("quotations", "parts-catalog"),
      }),
    ).toBe(false);
  });

  it("a region admin does not see it, whatever sections they have", () => {
    expect(
      canSeeDeliveryChallans({
        role: "REGION_ADMIN",
        isSpecialAccess: false,
        canSeeSection: granted("delivery-challans"),
      }),
    ).toBe(false);
    expect(
      canSeeDeliveryChallans({ role: "REGION_ADMIN", isSpecialAccess: false, canSeeSection: () => true }),
    ).toBe(false);
  });

  it("nor does anyone else", () => {
    for (const role of ["VENDOR_ACCESS", "", null, undefined]) {
      expect(
        canSeeDeliveryChallans({ role, isSpecialAccess: false, canSeeSection: () => true }),
      ).toBe(false);
    }
  });

  it("uses its own section key, and leaves the Admin Console's region-admin list as it was", () => {
    expect(DELIVERY_CHALLAN_SECTION).toBe("delivery-challans");
    // A region admin never sees the section (above), so their section picker does not
    // offer it -- as it does not offer Quotations. The backend refuses the key there too.
    expect(USER_SECTION_KEYS).not.toContain("delivery-challans");
    expect(USER_SECTION_KEYS).not.toContain("quotations");
  });
});

describe("AppHeader on the Delivery Challan section", () => {
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

  it("is titled Delivery Challan, under Data & Operations", () => {
    const html = renderToStaticMarkup(
      createElement(AppHeader, {
        workspaceView: "delivery-challans",
        hasReport: false,
        hasBatches: false,
        isBusy: false,
        dbHealth: null,
        runtimeHealth: null,
        session,
        onWorkspaceViewChange: vi.fn(),
        onRefreshHealth: vi.fn(),
        onOpenUpload: vi.fn(),
        onOpenHistory: vi.fn(),
        onGenerateReport: vi.fn(),
        onExportXlsx: vi.fn(),
        onExportCsv: vi.fn(),
        onLogout: vi.fn(),
      }),
    );
    expect(html).toContain('<h1 class="breadcrumbTitle">Delivery Challan</h1>');
    expect(html).toContain("Home / Data &amp; Operations / Delivery Challan");
  });
});
