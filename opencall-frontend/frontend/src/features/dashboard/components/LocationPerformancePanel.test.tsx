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

  it("renders all three charts", () => {
    const html = render();
    expect(html).toContain("Call conversion funnel");
    expect(html).toContain("Conversion rate by location");
    expect(html).toContain("Outcome mix by location");
  });

  it("gives every mark a hover tooltip carrying its own figures", () => {
    const html = render();
    // Tooltips enhance, never gate: the same values are in the table above.
    expect(html).toContain("Assigned: 31 of 31 assigned");
    expect(html).toContain("SALEM — Attended of assigned: 84.2% (16 of 19 assigned)");
  });

  it("labels each multi-series chart with a legend", () => {
    // Identity never rests on colour alone.
    const html = render();
    expect(html).toContain("Attended of assigned");
    expect(html).toContain("Closed of attended");
    expect(html).toContain("Under observation");
    expect(html).toContain("Other / not actioned");
  });

  it("colours a bar by its series, never by its own value", () => {
    // A value-ramp on nominal categories double-encodes length as hue. Salem
    // (84.2%) and Vellore (58.3%) sit in different performance bands, yet both
    // attendance bars carry the same slot-1 blue — the band colours stay in the
    // table above, where they label text rather than size a mark.
    const html = render();
    const bars = [...html.matchAll(/title="([^"]*Attended of assigned[^"]*)"[^>]*background:(#[0-9a-f]{6})/g)];
    expect(bars).toHaveLength(2);
    expect(new Set(bars.map((match) => match[2]))).toEqual(new Set(["#2a78d6"]));
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
