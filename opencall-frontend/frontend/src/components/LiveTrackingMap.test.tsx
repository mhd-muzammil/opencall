// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the map does when you pick an engineer.
 *
 * The route was already being drawn, at whatever the map happened to be looking
 * at — so on a state-sized map you clicked someone and nothing appeared to
 * happen, and had to hunt for their day by hand. These cover the two rules that
 * fix it: fit to the day when one is picked, and do NOT refit afterwards, since
 * the board reloads every 30 seconds and would otherwise drag the map out from
 * under anyone who had panned away to look at something.
 */

const fitBounds = vi.fn();
const setView = vi.fn();
const invalidateSize = vi.fn();

vi.mock("react-leaflet", () => {
  const pass = (name: string) =>
    function Passthrough({ children }: { children?: React.ReactNode }) {
      return createElement("div", { "data-leaflet": name }, children);
    };
  return {
    MapContainer: pass("map"),
    TileLayer: pass("tiles"),
    CircleMarker: pass("circle-marker"),
    Circle: pass("circle"),
    Polyline: pass("polyline"),
    Popup: pass("popup"),
    useMap: () => ({
      fitBounds,
      setView,
      invalidateSize,
      getContainer: () => document.createElement("div"),
    }),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));

// A day in Salem, as the roster would hand it over.
const ROUTE: [number, number][] = [
  [11.664, 78.146],
  [11.671, 78.152],
  [11.679, 78.161],
];

function engineer(id: number, lat: number | null, lon: number | null) {
  return {
    engineer_id: id,
    engineer_name: `Engineer ${id}`,
    branch: "Salem",
    latitude: lat,
    longitude: lon,
    accuracy: 12,
    stale: false,
    duty_minutes: 90,
    distance_km: 4.2,
    last_seen_minutes: 1,
    status: "working",
    timestamp: null,
    active_case_number: null,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.clearAllMocks();
  // ResizeObserver is not in jsdom; the map only uses it to re-measure.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(props: Record<string, unknown>) {
  const { default: LiveTrackingMap } = await import("./LiveTrackingMap");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(LiveTrackingMap, props as never));
  });
  await act(async () => {});
}

async function update(props: Record<string, unknown>) {
  const { default: LiveTrackingMap } = await import("./LiveTrackingMap");
  await act(async () => {
    root.render(createElement(LiveTrackingMap, props as never));
  });
  await act(async () => {});
}

const base = {
  engineers: [engineer(91, 11.664, 78.146)],
  stops: [],
  onSelect: () => {},
  height: "400px",
};

describe("picking an engineer on the map", () => {
  it("brings their whole day into view", async () => {
    await render({ ...base, selectedId: 91, pathPoints: ROUTE });
    expect(fitBounds).toHaveBeenCalledWith(ROUTE, expect.objectContaining({ maxZoom: 16 }));
  });

  it("does not move the map when nobody is picked", async () => {
    await render({ ...base, selectedId: null, pathPoints: [] });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it("goes to where they are standing when there is no route yet", async () => {
    // Just went on duty: one fix, nothing to draw a line with.
    await render({ ...base, selectedId: 91, pathPoints: [] });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledWith([11.664, 78.146], 15);
  });

  it("leaves the map alone for someone with neither a route nor a position", async () => {
    await render({
      ...base,
      engineers: [engineer(91, null, null)],
      selectedId: 91,
      pathPoints: [],
    });
    expect(fitBounds).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it("does not refit on the 30-second refresh", async () => {
    // The board reloads every 30s. Refitting each time would drag the map back
    // from wherever the person watching had panned to.
    await render({ ...base, selectedId: 91, pathPoints: ROUTE });
    expect(fitBounds).toHaveBeenCalledTimes(1);

    await update({ ...base, selectedId: 91, pathPoints: [...ROUTE] });
    await update({ ...base, selectedId: 91, pathPoints: [...ROUTE, [11.688, 78.17]] });

    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it("fits again when a DIFFERENT engineer is picked", async () => {
    await render({ ...base, selectedId: 91, pathPoints: ROUTE });
    expect(fitBounds).toHaveBeenCalledTimes(1);

    const other: [number, number][] = [
      [13.08, 80.27],
      [13.09, 80.28],
    ];
    await update({
      ...base,
      engineers: [engineer(92, 13.08, 80.27)],
      selectedId: 92,
      pathPoints: other,
    });

    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(fitBounds).toHaveBeenLastCalledWith(other, expect.objectContaining({ maxZoom: 16 }));
  });

  it("draws the route with both of its ends marked", async () => {
    await render({ ...base, selectedId: 91, pathPoints: ROUTE });
    // Two polylines: the white casing and the blue line over it.
    expect(container.querySelectorAll('[data-leaflet="polyline"]')).toHaveLength(2);
    // A marker for the engineer, plus one for each end of the day.
    expect(
      container.querySelectorAll('[data-leaflet="circle-marker"]').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("draws no route line at all when there is no day", async () => {
    await render({ ...base, selectedId: 91, pathPoints: [] });
    expect(container.querySelectorAll('[data-leaflet="polyline"]')).toHaveLength(0);
  });
});
