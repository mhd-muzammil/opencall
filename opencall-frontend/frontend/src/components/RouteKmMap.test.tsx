// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteKmPoint } from "../lib/payrollTrackingApiClient";

/**
 * The ROUTE KM map: a badge on every place the engineer marked, Ola's road
 * between them, and the day brought into view once per click -- not again while
 * someone is looking around it.
 */

const fitBounds = vi.fn();
const setView = vi.fn();
const invalidateSize = vi.fn();

// Leaflet swapped for plain elements that say what would be drawn, and where.
vi.mock("react-leaflet", async () => {
  const { createElement: h } = await import("react");
  const pass = (name: string) =>
    function Passthrough({
      children,
      positions,
      position,
      icon,
      pathOptions,
    }: {
      children?: ReactNode;
      positions?: unknown;
      position?: unknown;
      icon?: { options: { html: string; iconAnchor?: [number, number] } };
      pathOptions?: { color?: string };
    }) {
      return h(
        "div",
        {
          "data-leaflet": name,
          "data-positions": positions ? JSON.stringify(positions) : undefined,
          "data-position": position ? JSON.stringify(position) : undefined,
          "data-icon": icon?.options.html,
          "data-anchor": icon?.options.iconAnchor ? JSON.stringify(icon.options.iconAnchor) : undefined,
          "data-color": pathOptions?.color,
        },
        children,
      );
    };
  return {
    MapContainer: pass("map"),
    TileLayer: pass("tiles"),
    Marker: pass("marker"),
    Polyline: pass("polyline"),
    Popup: pass("popup"),
    useMap: () => ({
      fitBounds: (...args: unknown[]) => fitBounds(...args),
      setView: (...args: unknown[]) => setView(...args),
      invalidateSize: () => invalidateSize(),
      getContainer: () => document.createElement("div"),
    }),
  };
});
// A div icon is its options until Leaflet draws it.
vi.mock("leaflet", () => ({ divIcon: (options: unknown) => ({ options }) }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

// A day in Hosur: Login, two check-ins, Logout, at local times.
const at = (hour: number, minute: number) => new Date(2026, 8, 25, hour, minute).toISOString();
const POINTS: RouteKmPoint[] = [
  { kind: "login", at: at(9, 5), latitude: 12.7409, longitude: 77.8253, case_number: null },
  { kind: "checkin", at: at(10, 12), latitude: 12.7512, longitude: 77.8101, case_number: "OC-004546" },
  { kind: "checkin", at: at(11, 40), latitude: 12.7633, longitude: 77.7952, case_number: null },
  { kind: "logout", at: at(18, 2), latitude: 12.7411, longitude: 77.8249, case_number: null },
];
const PATH: [number, number][] = [
  [12.7409, 77.8253],
  [12.7466, 77.8188],
  [12.7512, 77.8101],
  [12.7633, 77.7952],
  [12.7411, 77.8249],
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // ResizeObserver is not in jsdom; the map only uses it to re-measure.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

type Props = { points: RouteKmPoint[]; path: [number, number][]; selectedKey: number | null; height?: string };

async function render(props: Props) {
  const { default: RouteKmMap } = await import("./RouteKmMap");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(RouteKmMap, props));
  });
  await act(async () => {});
}

async function update(props: Props) {
  const { default: RouteKmMap } = await import("./RouteKmMap");
  await act(async () => {
    root.render(createElement(RouteKmMap, props));
  });
  await act(async () => {});
}

const markers = () => Array.from(container.querySelectorAll('[data-leaflet="marker"]'));
/** The letter or number on a marker's badge. */
const badge = (marker: Element) => {
  const html = document.createElement("div");
  html.innerHTML = marker.getAttribute("data-icon") ?? "";
  return html.textContent;
};
const lines = () => Array.from(container.querySelectorAll('[data-leaflet="polyline"]'));

describe("RouteKmMap", () => {
  it("marks each place: L for the Login, the check-ins in order, D for the Logout", async () => {
    await render({ points: POINTS, path: PATH, selectedKey: 1 });
    expect(markers().map((m) => m.getAttribute("data-position"))).toEqual(
      POINTS.map((p) => JSON.stringify([p.latitude, p.longitude])),
    );
    expect(markers().map(badge)).toEqual(["L", "1", "2", "D"]);
    // Green, violet, red: each kind its own colour.
    expect(markers()[0]!.getAttribute("data-icon")).toContain("background:#16a34a");
    expect(markers()[1]!.getAttribute("data-icon")).toContain("background:#7c3aed");
    expect(markers()[2]!.getAttribute("data-icon")).toContain("background:#7c3aed");
    expect(markers()[3]!.getAttribute("data-icon")).toContain("background:#dc2626");
    // Each popup names the place, its time and its case.
    expect(markers().map((m) => m.textContent)).toEqual([
      "Login · 09:05",
      "Check-in 1 · 10:12 · OC-004546",
      "Check-in 2 · 11:40",
      "Logout · 18:02",
    ]);
  });

  it("draws Ola's road over a white casing, in a colour of its own", async () => {
    await render({ points: POINTS, path: PATH, selectedKey: 1 });
    expect(lines().map((l) => l.getAttribute("data-color"))).toEqual(["#ffffff", "#0f766e"]);
    expect(lines().map((l) => JSON.parse(l.getAttribute("data-positions")!))).toEqual([PATH, PATH]);
  });

  it("draws no line without a road, and still marks the places", async () => {
    await render({ points: POINTS, path: [], selectedKey: 1 });
    expect(lines()).toHaveLength(0);
    expect(markers()).toHaveLength(4);
  });

  it("says what the badges and the line mean", async () => {
    await render({ points: [], path: [], selectedKey: null });
    const text = container.textContent ?? "";
    for (const label of ["Login", "Check-in", "Logout", "Road route (Ola)"]) expect(text).toContain(label);
    // No office place on this map, so no word about one.
    expect(text).not.toContain("At the office");
  });

  it("a Login and Logout put at the office are hollow badges, said so, and side by side", async () => {
    const office = { latitude: 12.7242996, longitude: 77.826677 };
    const day: RouteKmPoint[] = [
      { kind: "login", at: at(9, 5), ...office, case_number: null, office: true },
      { kind: "checkin", at: at(10, 12), latitude: 12.7512, longitude: 77.8101, case_number: "OC-004546" },
      { kind: "logout", at: at(18, 2), ...office, case_number: null, office: true },
    ];
    await render({ points: day, path: [], selectedKey: 1 });

    // White inside the kind's own colour: not a GPS fix.
    expect(markers()[0]!.getAttribute("data-icon")).toContain("background:#fff;color:#16a34a");
    expect(markers()[2]!.getAttribute("data-icon")).toContain("background:#fff;color:#dc2626");
    expect(markers()[1]!.getAttribute("data-icon")).toContain("background:#7c3aed");
    expect(markers().map((m) => m.textContent)).toEqual([
      "Login (office) · 09:05",
      "Check-in 1 · 10:12 · OC-004546",
      "Logout (office) · 18:02",
    ]);
    // L and D on the same spot: the D is drawn one badge to the right of the L.
    expect(markers().map((m) => m.getAttribute("data-anchor"))).toEqual(["[12,12]", "[12,12]", "[-12,12]"]);
    expect(container.textContent).toContain("At the office (no GPS then)");
  });

  it("does not move the map when no day is picked", async () => {
    await render({ points: POINTS, path: PATH, selectedKey: null });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it("brings a clicked day's road into view once, and the next click's too", async () => {
    await render({ points: POINTS, path: PATH, selectedKey: 1 });
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds).toHaveBeenLastCalledWith(PATH, expect.objectContaining({ maxZoom: 16 }));

    // The same click drawn again is not refitted under someone looking around.
    await update({ points: [...POINTS], path: [...PATH], selectedKey: 1 });
    expect(fitBounds).toHaveBeenCalledTimes(1);

    const other: [number, number][] = [
      [13.0827, 80.2707],
      [13.0901, 80.2785],
    ];
    await update({ points: POINTS.slice(0, 2), path: other, selectedKey: 2 });
    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(fitBounds).toHaveBeenLastCalledWith(other, expect.objectContaining({ maxZoom: 16 }));
  });

  it("waits while the day loads, then fits to its places when there is no road", async () => {
    await render({ points: [], path: [], selectedKey: 1 });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();

    await update({ points: POINTS, path: [], selectedKey: 1 });
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds).toHaveBeenLastCalledWith(
      POINTS.map((p) => [p.latitude, p.longitude]),
      expect.objectContaining({ maxZoom: 16 }),
    );
  });

  it("goes to a lone place", async () => {
    await render({ points: POINTS.slice(0, 1), path: [], selectedKey: 1 });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledWith([12.7409, 77.8253], 15);
  });
});
