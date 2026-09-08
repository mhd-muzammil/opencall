import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProductivityCallDayDetail } from "@opencall/shared";
import { ProductivityCallDaysModal } from "./ProductivityCallDaysModal";

function callDay(
  overrides: Partial<ProductivityCallDayDetail> = {},
): ProductivityCallDayDetail {
  return {
    date: "2026-07-28",
    engineer: "Vignesh",
    regionCode: "ASPS01465",
    regionName: "HOSUR",
    regionId: "region-hosur",
    ticketId: "WO-035281038",
    bucket: "CX_RESCHEDULE",
    woOtcCode: "05F-Comp Field Install",
    customerName: "R",
    location: "Hosur (Dharmapuri)",
    product: "CISS",
    segment: "Consumer",
    caseCreatedTime: null,
    wipAging: "3",
    tat: null,
    flexStatus: "Open",
    rtplStatus: "Scheduled",
    eveningStatus: "",
    bookingIndex: 1,
    bookingCount: 3,
    ...overrides,
  };
}

function render(
  overrides: Partial<Parameters<typeof ProductivityCallDaysModal>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(ProductivityCallDaysModal, {
      title: "Vignesh - Assigned - Aug 2026 bill cycle",
      callDays: [callDay()],
      loading: false,
      error: null,
      onClose: vi.fn(),
      ...overrides,
    }),
  );
}

/**
 * globals.css styles bare `button` with `color: #ffffff` and `input` with
 * `width: 100%`, unlayered. A control here that sets a pale background without
 * its own colour renders white-on-white — which is how this modal first shipped:
 * the toggle read as a blank pill and Close was invisible entirely.
 */
describe("controls survive the global element styles", () => {
  it("gives every button its own colour", () => {
    const html = render();
    const buttons = html.match(/<button[^>]*>/g) ?? [];

    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const button of buttons) {
      expect(button).toMatch(/color:/);
    }
  });

  it("does not let the search box take the whole row", () => {
    const input = render().match(/<input[^>]*>/)?.[0] ?? "";
    expect(input).toMatch(/width:240px/);
  });

  it("labels all three actions", () => {
    const html = render();
    expect(html).toContain("Show unique calls");
    expect(html).toContain("Export");
    expect(html).toContain("Close");
  });
});

describe("what the header tells the reader", () => {
  // Quoting one number alone is what made a legitimate repeat look like
  // duplicated data. Both figures, always.
  it("states bookings and calls together", () => {
    const html = render({
      callDays: [
        callDay({ date: "2026-07-28", bookingIndex: 1 }),
        callDay({ date: "2026-07-29", bookingIndex: 2 }),
        callDay({ date: "2026-07-30", bookingIndex: 3 }),
      ],
    });

    expect(html).toContain("3 day-bookings across 1 calls");
  });

  it("shows which booking each row is", () => {
    expect(render()).toContain("1 of 3");
  });
});

describe("empty and error states", () => {
  it("says a period had no bookings rather than showing a bare table", () => {
    expect(render({ callDays: [] })).toContain("No bookings in this period");
  });

  it("shows the error instead of an empty list that looks like no work", () => {
    const html = render({ error: "Could not load the calls behind this number" });
    expect(html).toContain("Could not load the calls behind this number");
  });

  it("disables export while there is nothing to write", () => {
    const html = render({ callDays: [], loading: false, error: null });
    const exportButton =
      html.match(/<button[^>]*>(?:(?!<\/button>).)*Export(?:(?!<\/button>).)*<\/button>/s)?.[0] ??
      "";
    expect(exportButton).toMatch(/disabled/);
  });
});
