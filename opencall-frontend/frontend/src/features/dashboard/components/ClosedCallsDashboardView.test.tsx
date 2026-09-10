// A render smoke test for the composed page.
//
// The page is assembled from a dozen components over four data sources, and the failure
// this guards against is structural rather than arithmetic: a card that reads zero because
// a source was never imported, a region grid that does not add up to its own rollup, or a
// search box that quietly rewrites the headline. The arithmetic itself is pinned in
// utils/closedCallsPeriod.test.ts and closedCalls/coverage.test.ts.
//
// Rendered with renderToStaticMarkup, matching the other component tests here: no effects
// run, so nothing fetches and the page is exercised exactly as a first paint.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReportRow } from "../types";
import { ClosedCallsDashboardView } from "./ClosedCallsDashboardView";

function row(input: {
  ticket: string;
  asp: string;
  sameDay?: boolean;
  flexStatus?: string;
  closedDate?: string;
}): ReportRow {
  const output: Record<string, unknown> = {
    "Ticket ID": input.ticket,
    "Work Location": input.asp,
    Engineer: "Jeeva",
    "Customer Name": "Prashanth",
    "RTPL status": "Case-Closed",
  };
  if (input.closedDate) output["Case Closed Date"] = input.closedDate;
  // The serve-time overlay parks the vendor's WIP value here whenever it fires, so the
  // key's PRESENCE is what says Flex has reported an outcome.
  if (input.flexStatus !== undefined) {
    output["Flex Status"] = input.flexStatus;
    output["Flex Status (WIP)"] = "";
  }
  return {
    serialNo: Number(input.ticket.replace(/\D/g, "")) || 1,
    output,
    carryForward: {
      closedSyntheticRow: true,
      sameDayClosedRow: input.sameDay !== false,
    },
  } as unknown as ReportRow;
}

const REGIONS = [
  { aspCode: "ASPS01461", regionName: "Chennai", closedCount: 900, activeCount: 120 },
  { aspCode: "ASPS01463", regionName: "Vellore", closedCount: 300, activeCount: 40 },
];

function render(
  overrides: Partial<Parameters<typeof ClosedCallsDashboardView>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(ClosedCallsDashboardView, {
      overallClosedCount: 1200,
      closedRegionBreakdown: REGIONS,
      closedRows: [
        row({ ticket: "WO-1", asp: "ASPS01461", flexStatus: "WO Closed" }),
        row({ ticket: "WO-2", asp: "ASPS01461", flexStatus: "Closed - Canceled" }),
        row({ ticket: "WO-3", asp: "ASPS01461" }),
        row({ ticket: "WO-4", asp: "ASPS01463", flexStatus: "WO Closed" }),
      ],
      selectedRegion: null,
      setSelectedRegion: vi.fn(),
      openRecordsWithFilter: vi.fn(),
      ...overrides,
    }),
  );
}

/** The text of the page with tags stripped, for "does it say this" assertions. */
function text(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("ClosedCallsDashboardView", () => {
  it("renders without a summary token — every comparison section is simply absent", () => {
    // A view-only session gets no read token. The page must still show OUR closed count
    // rather than failing or rendering zeros for the sources it cannot reach.
    const markup = render();
    expect(markup).toContain("Our closed count");
    expect(text(markup)).toContain("Flex Closure ASP Report has not been imported yet");
    expect(text(markup)).toContain("Raw data has not been synced yet");
    // No reconciliation panel without a token to read it with.
    expect(markup).not.toContain("Flex reconciliation");
  });

  it("defaults to today, which is the report-day rule and says so", () => {
    const markup = text(render());
    expect(markup).toContain("report day");
    expect(markup).toContain("same-day closed rows");
  });

  it("splits our count into completed, cancelled and unknown", () => {
    // Only "WO Closed" is a finished job. "Closed - Canceled" is abandoned, and a row Flex
    // has not reported on at all is unknown rather than assumed billable.
    const markup = text(render());
    expect(markup).toContain("2 closed");
    expect(markup).toContain("1 cancelled");
    expect(markup).toContain("1 unknown");
  });

  it("makes the region cards sum to the rollup", () => {
    // The rollup once showed today's closures while each region card showed its all-time
    // ledger, so the parts never came to the whole.
    const markup = render();
    const cards = markup.match(/class="ccN">([\d,]+) <small>closed<\/small>/g) ?? [];
    const numbers = cards.map((card) =>
      Number((/([\d,]+)/.exec(card)?.[1] ?? "0").replace(/,/g, "")),
    );
    expect(numbers.length).toBe(REGIONS.length + 1);
    const [rollup, ...regions] = numbers as [number, ...number[]];
    expect(rollup).toBe(regions.reduce((sum, value) => sum + value, 0));
    expect(rollup).toBe(4);
  });

  it("counts the ledger for the period, not the all-time badge", () => {
    expect(text(render())).toContain("4 in period");
  });

  it("hides the import controls without an import token", () => {
    expect(render()).not.toContain("Import closure dates");
    expect(render({ closureImportToken: "tok" })).toContain("Import closure dates");
  });

  it("hides the feedback column control without a feedback token", () => {
    expect(render()).not.toContain("Feedback</button>");
    expect(render({ feedbackToken: "tok" })).toContain("Feedback</button>");
  });

  it("renders the ledger with twelve columns, not the old sixteen", () => {
    // Customer name, mail and contact used to be three more columns repeating what the
    // Customer / Segment cell already showed.
    const head = /<thead>[\s\S]*?<\/thead>/.exec(render())?.[0] ?? "";
    expect((head.match(/<th[ >]/g) ?? []).length).toBe(12);
    expect(head).not.toContain("Customer Mail");
  });
});
