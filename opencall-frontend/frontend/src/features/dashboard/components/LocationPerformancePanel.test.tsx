import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationPerformancePanel } from "./LocationPerformancePanel";

// The team's own sheet for 05-08-2026: Salem four engineers, Vellore two.
const LIST = [
  { regionName: "SALEM", assigned: 6, attended: 6, closed: 3 },
  { regionName: "SALEM", assigned: 5, attended: 4, closed: 3 },
  { regionName: "SALEM", assigned: 5, attended: 4, closed: 4 },
  { regionName: "SALEM", assigned: 3, attended: 2, closed: 2 },
  { regionName: "VELLORE", assigned: 6, attended: 4, closed: 2 },
  { regionName: "VELLORE", assigned: 6, attended: 3, closed: 3 },
];

function render(
  props: Partial<Parameters<typeof LocationPerformancePanel>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(LocationPerformancePanel, { list: LIST, ...props }),
  );
}

describe("LocationPerformancePanel", () => {
  it("shows each region's conversion rates", () => {
    const html = render();
    // Salem 16/19 attended, 12/16 closed — the spreadsheet's own figures.
    expect(html).toContain("84.2%");
    expect(html).toContain("75.0%");
    // Vellore 7/12 attended, 5/7 closed.
    expect(html).toContain("58.3%");
    expect(html).toContain("71.4%");
  });

  it("shows an ALL LOCATIONS total from the pooled counts", () => {
    const html = render();
    expect(html).toContain("ALL LOCATIONS");
    // 23 of 31 assigned = 74.2%, NOT the mean of 84.2 and 58.3.
    expect(html).toContain("74.2%");
  });

  it("renders both charts", () => {
    const html = render();
    expect(html).toContain("Assigned vs Attended %");
    expect(html).toContain("Attended vs Closed %");
    // Each bar is labelled for screen readers with its own figures.
    expect(html).toContain("SALEM: 84.2% (16 of 19 assigned)");
    expect(html).toContain("VELLORE: 71.4% (5 of 7 attended)");
  });

  it("renders nothing while the day is still loading", () => {
    // The table above already shows a loading row; an empty chart frame beside
    // it reads as a broken widget.
    expect(render({ loading: true })).toBe("");
  });

  it("renders nothing when there are no engineers", () => {
    expect(render({ list: [] })).toBe("");
  });

  it("shows an em dash rather than 0% for a region with no assigned calls", () => {
    const html = render({
      list: [{ regionName: "IDLE", assigned: 0, attended: 0, closed: 0 }],
    });
    expect(html).toContain("IDLE");
    expect(html).toContain("—");
    expect(html).not.toContain("0.0%");
  });

  it("does not overflow the bar track when a rate exceeds 100%", () => {
    // Possible when a same-day closure was never booked. The printed value
    // still shows the true figure.
    const html = render({
      list: [{ regionName: "OVER", assigned: 4, attended: 5, closed: 1 }],
    });
    expect(html).toContain("125.0%");
    expect(html).toContain("width:100%");
    expect(html).not.toContain("width:125%");
  });
});
