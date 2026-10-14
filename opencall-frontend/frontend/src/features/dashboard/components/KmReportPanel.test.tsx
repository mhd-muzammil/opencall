// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineerDay, EngineerKmDays } from "../../../lib/payrollTrackingApiClient";

/**
 * The KM Report, mounted: who is listed, what the boxes and the search leave on
 * screen, and that every cell and total is Payroll's figure as it came.
 */

vi.mock("../../../lib/session", () => ({ clearSession: vi.fn() }));

const getRosterKmDays = vi.fn();
const getEngineerDay = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getRosterKmDays: (...args: unknown[]) => getRosterKmDays(...args),
  getEngineerDay: (...args: unknown[]) => getEngineerDay(...args),
}));

// The board's own map, mounted for real, with Leaflet swapped for plain
// elements that say what would be drawn -- and where the map was asked to look.
const fitBounds = vi.fn();
vi.mock("react-leaflet", async () => {
  const { createElement: h } = await import("react");
  const pass = (name: string) =>
    function Passthrough({ children, positions }: { children?: ReactNode; positions?: unknown }) {
      return h(
        "div",
        { "data-leaflet": name, "data-positions": positions ? JSON.stringify(positions) : undefined },
        children,
      );
    };
  return {
    MapContainer: pass("map"),
    TileLayer: pass("tiles"),
    CircleMarker: pass("circle-marker"),
    Circle: pass("circle"),
    Polyline: pass("polyline"),
    Popup: pass("popup"),
    useMap: () => ({
      fitBounds: (...args: unknown[]) => fitBounds(...args),
      setView: () => {},
      invalidateSize: () => {},
      getContainer: () => document.createElement("div"),
    }),
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));
// next/dynamic loads the map on its own schedule; here it is simply the map.
vi.mock("next/dynamic", async () => {
  const map = await import("../../../components/LiveTrackingMap");
  return { default: () => map.default };
});
// The ROUTE KM table under this one has tests of its own. Here it only has to
// be in its place, and handed this cycle and these rows.
const routeKmSection = vi.fn();
vi.mock("./RouteKmSection", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      routeKmSection(props);
      return h("div", { "data-testid": "route-km-section" });
    },
  };
});

const DAYS = ["2026-09-25", "2026-09-26", "2026-09-27"];

function engineer(
  engineer_name: string,
  branch: string | null,
  km: [number, number, number],
  overrides: Partial<EngineerKmDays> = {},
): EngineerKmDays {
  return {
    engineer_id: 1,
    engineer_name,
    matched: true,
    branch,
    department: "FSE",
    days: Object.fromEntries(DAYS.map((day, i) => [day, km[i]!])),
    distance_km: Math.round(km.reduce((s, k) => s + k, 0) * 100) / 100,
    days_tracked: km.filter((k) => k > 0).length,
    ...overrides,
  };
}

const REPORT = {
  configured: true,
  days: DAYS,
  engineers: [
    engineer("Arun", "Chennai", [12.5, 0, 33.17], { engineer_id: 7 }),
    engineer("Bala", "Salem", [0, 40.25, 1.03], { engineer_id: 8 }),
    engineer("Vendor Ravi", null, [0, 0, 0], { engineer_id: null, matched: false }),
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // 13 Oct 2026, 11:30 IST: the cycle is 25 Sep - 24 Oct.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T06:00:00Z"));
  getRosterKmDays.mockResolvedValue(REPORT);
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
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function mount() {
  const { default: KmReportPanel } = await import("./KmReportPanel");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(KmReportPanel, { token: "t", embedded: true }));
  });
  await act(async () => {});
}

const rows = () => Array.from(container.querySelectorAll('[data-testid="km-row"]'));
const cells = (row: Element) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent?.trim());
const boxes = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="km-region"]'));
const footer = () => cells(container.querySelector('[data-testid="km-footer"]')!);
/** The figure on the summary tile with this label. */
const tileValue = (label: string) =>
  Array.from(container.querySelectorAll("div"))
    .find((div) => div.textContent === label && div.previousElementSibling)
    ?.previousElementSibling?.textContent?.trim();

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await act(async () => {});
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("KmReportPanel", () => {
  it("asks for the current bill cycle, 25th to 24th", async () => {
    await mount();
    expect(getRosterKmDays).toHaveBeenCalledWith("t", "2026-09-25", "2026-10-24");
    expect(container.querySelector('[data-testid="km-cycle"]')?.textContent).toContain("25 Sep");
  });

  it("lists the FSEs Payroll knows, each day's km as it came, and the cycle's total", async () => {
    await mount();
    expect(rows()).toHaveLength(2);
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.5", "-", "33.17", "2", "45.67"]);
    expect(cells(rows()[1]!)).toEqual(["2", "Bala", "Salem", "-", "40.25", "1.03", "2", "41.28"]);
    expect(footer()).toEqual(["Total", "12.5", "40.25", "34.2", "", "86.95"]);
    expect(container.textContent).toContain("1 engineer in the register is not in Payroll");
  });

  it("the table is headed RTPL APP KM, and the cycle arrows are dark whatever the app's button colour", async () => {
    await mount();
    const title = container.querySelector('[data-testid="km-table-title"]');
    expect(title?.textContent).toBe("RTPL APP KM");
    expect(title?.nextElementSibling?.getAttribute("data-testid")).toBe("km-grid");
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!;
    expect(prev.style.color).toBe("rgb(17, 24, 39)");
  });

  it("a region box narrows the table and the totals to that region", async () => {
    await mount();
    expect(boxes().map((b) => b.textContent)).toEqual(["All Regions2 FSEs", "Chennai1 FSE", "Salem1 FSE"]);
    await click(boxes()[2]!);
    expect(rows().map((r) => cells(r)[1])).toEqual(["Bala"]);
    expect(cells(rows()[0]!)[0]).toBe("1");
    expect(footer().at(-1)).toBe("41.28");
    expect(boxes()[2]!.getAttribute("aria-pressed")).toBe("true");
    await click(boxes()[0]!);
    expect(rows()).toHaveLength(2);
  });

  it("the search finds one FSE", async () => {
    await mount();
    await type(container.querySelector<HTMLInputElement>('input[aria-label="Search FSE"]')!, "aru");
    expect(rows().map((r) => cells(r)[1])).toEqual(["Arun"]);
  });

  it("goes back a cycle, and not forward past the current one", async () => {
    await mount();
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next cycle"]')!;
    expect(next.disabled).toBe(true);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(getRosterKmDays).toHaveBeenLastCalledWith("t", "2026-08-25", "2026-09-24");
    expect(next.disabled).toBe(false);
  });

  it("a cycle being loaded shows none of the last cycle's numbers under its label", async () => {
    await mount();
    expect(tileValue("Total km")).toBe("86.95");
    let answer: (value: unknown) => void = () => {};
    getRosterKmDays.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(container.querySelector('[data-testid="km-cycle"]')?.textContent).toContain("25 Aug");
    expect(rows()).toHaveLength(0);
    expect(boxes()).toHaveLength(0);
    expect(tileValue("Total km")).toBe("…");
    expect(tileValue("Average km per FSE")).toBe("…");
    await act(async () => {
      answer({ configured: true, days: DAYS, engineers: [engineer("Chitra", "Vellore", [1, 2, 3], { engineer_id: 9 })] });
    });
    await act(async () => {});
    expect(rows().map((r) => cells(r)[1])).toEqual(["Chitra"]);
    expect(tileValue("Total km")).toBe("6");
  });

  it("a login that expires on the next cycle leaves nothing of the last one on screen", async () => {
    await mount();
    expect(rows()).toHaveLength(2);
    const { ApiClientError } = await import("../../../lib/api/http");
    getRosterKmDays.mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(container.textContent).toContain("Your login has expired");
    expect(rows()).toHaveLength(0);
    expect(tileValue("Total km")).toBe("—");
  });

  it("an expired login says so instead of an empty report", async () => {
    const { ApiClientError } = await import("../../../lib/api/http");
    getRosterKmDays.mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await mount();
    expect(container.textContent).toContain("Your login has expired");
    expect(rows()).toHaveLength(0);
  });
});

/**
 * The map beside the table: a km clicked in the table draws that engineer's
 * route for that day, the way the live tracking board draws a day.
 */

// Two of Arun's days, as Payroll's day endpoint hands them over.
const ROUTE_25: [number, number][] = [
  [13.0827, 80.2707],
  [13.0901, 80.2785],
  [13.0998, 80.2841],
];
const ROUTE_27: [number, number][] = [
  [12.9716, 80.2209],
  [12.9801, 80.2302],
];

// What Payroll says each clicked day measures: the same as its cell in REPORT.
const KM_ON: Record<string, number> = { "2026-09-25": 12.5, "2026-09-26": 40.25, "2026-09-27": 33.17 };

function engineerDay(date: string, road: [number, number][], overrides: Partial<EngineerDay> = {}): EngineerDay {
  const middle = road[1]!;
  return {
    engineer_id: 7,
    engineer_name: "Arun",
    branch: "Chennai",
    date,
    total_km: KM_ON[date] ?? 0,
    duty_minutes: 480,
    first_seen: `${date}T03:30:00Z`,
    last_seen: `${date}T12:30:00Z`,
    stop_count: 1,
    stops: [
      {
        latitude: middle[0],
        longitude: middle[1],
        arrived_at: `${date}T05:00:00Z`,
        left_at: `${date}T06:05:00Z`,
        minutes: 65,
        fixes: 40,
        case_id: 3,
        case_number: "C-101",
      },
    ],
    events: [],
    punches: [
      {
        kind: "in",
        at: `${date}T05:02:00Z`,
        case_id: 3,
        case_number: "C-101",
        title: "Printer",
        latitude: middle[0],
        longitude: middle[1],
        accuracy: 10,
      },
    ],
    road_path: { points: road, snapped: road.length, raw: 0, source: "ola" },
    points: road.map(([latitude, longitude]) => ({
      latitude,
      longitude,
      timestamp: `${date}T04:00:00Z`,
      accuracy: 8,
      status: "moving",
    })),
    ...overrides,
  };
}

/** A day as the panel prints it: "25 Sep 2026" ("25 Sept 2026" where ICU says so). */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
/** A clickable km, by whose and which day. */
const dayCell = (name: string, iso: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="km-day"]')).find((b) =>
    b.getAttribute("aria-label")?.includes(`${name}'s route on ${longDate(iso)}`),
  );
const drawnRoute = () => {
  const lines = Array.from(container.querySelectorAll('[data-leaflet="polyline"]'));
  const last = lines.at(-1)?.getAttribute("data-positions");
  return last ? (JSON.parse(last) as [number, number][]) : null;
};
const routeLabel = () => container.querySelector('[data-testid="km-route-label"]')?.textContent;
const routeNote = () => container.querySelector('[data-testid="km-route-note"]')?.textContent ?? null;

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function settle(run: () => void) {
  await act(async () => {
    run();
  });
  await act(async () => {});
}

describe("KmReportPanel: the route map", () => {
  it("sits beside the table, empty, saying what to click", async () => {
    await mount();
    const grid = container.querySelector('[data-testid="km-grid"]')!;
    const map = container.querySelector('[data-testid="km-route"]')!;
    // The table's column, then the map's, in one row.
    expect(grid.parentElement?.nextElementSibling).toBe(map);
    expect((map.parentElement as HTMLElement).style.display).toBe("flex");
    expect(container.querySelector('[data-leaflet="map"]')).not.toBeNull();
    expect(routeLabel()).toBe("Click a km to see that day's route.");
    expect(routeNote()).toBeNull();
    expect(drawnRoute()).toBeNull();
    expect(fitBounds).not.toHaveBeenCalled();
    expect(getEngineerDay).not.toHaveBeenCalled();
  });

  it("every km can be clicked, a dash cannot, and the cells read as before", async () => {
    await mount();
    expect(container.querySelectorAll('[data-testid="km-day"]')).toHaveLength(4);
    expect(dayCell("Arun", "2026-09-25")?.textContent).toBe("12.5");
    expect(dayCell("Arun", "2026-09-26")).toBeUndefined();
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.5", "-", "33.17", "2", "45.67"]);
  });

  it("a clicked km draws that engineer's route for that day, and brings it into view", async () => {
    await mount();
    const answer = deferred<EngineerDay>();
    getEngineerDay.mockReturnValueOnce(answer.promise);
    await click(dayCell("Arun", "2026-09-25")!);

    expect(getEngineerDay).toHaveBeenCalledWith("t", 7, "2026-09-25");
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")}`);
    expect(routeNote()).toBe("Loading the route…");
    expect(dayCell("Arun", "2026-09-25")?.getAttribute("aria-pressed")).toBe("true");
    expect(dayCell("Arun", "2026-09-25")?.parentElement?.style.background).toBe("rgb(29, 78, 216)");

    await settle(() => answer.resolve(engineerDay("2026-09-25", ROUTE_25)));
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")} · 12.5 km`);
    expect(routeNote()).toBeNull();
    expect(drawnRoute()).toEqual(ROUTE_25);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_25, expect.objectContaining({ maxZoom: 16 }));
    // The stop and the check-in on the way, as on the board: the route's two
    // ends, one stop, one punch.
    expect(container.querySelectorAll('[data-leaflet="circle-marker"]')).toHaveLength(4);
    expect(container.textContent).toContain("Checked in");
  });

  it("another day of the same engineer is drawn and brought into view as well", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_25, expect.anything());

    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-27", ROUTE_27));
    await click(dayCell("Arun", "2026-09-27")!);
    expect(getEngineerDay).toHaveBeenLastCalledWith("t", 7, "2026-09-27");
    expect(routeLabel()).toBe(`Arun · Sun ${longDate("2026-09-27")} · 33.17 km`);
    expect(drawnRoute()).toEqual(ROUTE_27);
    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_27, expect.anything());
    expect(dayCell("Arun", "2026-09-25")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("while the next day loads, the last one is not left drawn under its name", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(drawnRoute()).toEqual(ROUTE_25);

    const answer = deferred<EngineerDay>();
    getEngineerDay.mockReturnValueOnce(answer.promise);
    await click(dayCell("Arun", "2026-09-27")!);
    expect(routeLabel()).toBe(`Arun · Sun ${longDate("2026-09-27")}`);
    expect(drawnRoute()).toBeNull();
    expect(routeNote()).toBe("Loading the route…");

    await settle(() => answer.resolve(engineerDay("2026-09-27", ROUTE_27)));
    expect(drawnRoute()).toEqual(ROUTE_27);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_27, expect.anything());
  });

  it("an earlier click answered late never draws over a later one", async () => {
    await mount();
    const first = deferred<EngineerDay>();
    const second = deferred<EngineerDay>();
    getEngineerDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await click(dayCell("Arun", "2026-09-25")!);
    await click(dayCell("Arun", "2026-09-27")!);

    await settle(() => second.resolve(engineerDay("2026-09-27", ROUTE_27)));
    await settle(() => first.resolve(engineerDay("2026-09-25", ROUTE_25)));
    expect(routeLabel()).toBe(`Arun · Sun ${longDate("2026-09-27")} · 33.17 km`);
    expect(drawnRoute()).toEqual(ROUTE_27);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_27, expect.anything());
  });

  it("clicking the day already shown does not ask Payroll again", async () => {
    await mount();
    getEngineerDay.mockResolvedValue(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    await click(dayCell("Arun", "2026-09-25")!);
    expect(getEngineerDay).toHaveBeenCalledTimes(1);
    expect(drawnRoute()).toEqual(ROUTE_25);
  });

  it("another engineer's day is theirs", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-26", ROUTE_27, { engineer_id: 8 }));
    await click(dayCell("Bala", "2026-09-26")!);
    expect(getEngineerDay).toHaveBeenCalledWith("t", 8, "2026-09-26");
    expect(routeLabel()).toBe(`Bala · Sat ${longDate("2026-09-26")} · 40.25 km`);
  });

  it("a day Payroll has no route for says so", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(
      engineerDay("2026-09-25", ROUTE_25, {
        road_path: { points: [], snapped: 0, raw: 0, source: "raw" },
        points: [],
        stops: [],
        punches: [],
      }),
    );
    await click(dayCell("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("No route was recorded on this day.");
    expect(drawnRoute()).toBeNull();
  });

  it("a route that fails to load says so on the map", async () => {
    await mount();
    getEngineerDay.mockRejectedValueOnce(new Error("Payroll is not answering"));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Could not load the route: Payroll is not answering");
    expect(drawnRoute()).toBeNull();
    // The table is untouched.
    expect(rows()).toHaveLength(2);
  });

  it("an expired login while opening a route asks for a sign-in", async () => {
    await mount();
    const { ApiClientError } = await import("../../../lib/api/http");
    getEngineerDay.mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(container.textContent).toContain("Your login has expired");
    expect(routeNote()).toBeNull();
  });

  it("an expired login on a route leaves nothing of the cycle for the arrows to relabel", async () => {
    await mount();
    const { ApiClientError } = await import("../../../lib/api/http");
    getEngineerDay.mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(rows()).toHaveLength(0);
    expect(tileValue("Total km")).toBe("—");

    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(container.querySelector('[data-testid="km-cycle"]')?.textContent).toContain("25 Aug");
    expect(rows()).toHaveLength(0);
    expect(tileValue("Total km")).toBe("—");
    expect(getRosterKmDays).toHaveBeenCalledTimes(1);
  });

  it("a route that failed is asked for again by clicking its km again, and not twice while loading", async () => {
    await mount();
    getEngineerDay.mockRejectedValueOnce(new Error("Payroll is not answering"));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Could not load the route: Payroll is not answering");

    const answer = deferred<EngineerDay>();
    getEngineerDay.mockReturnValueOnce(answer.promise);
    await click(dayCell("Arun", "2026-09-25")!);
    expect(getEngineerDay).toHaveBeenCalledTimes(2);
    expect(routeNote()).toBe("Loading the route…");
    await click(dayCell("Arun", "2026-09-25")!);
    expect(getEngineerDay).toHaveBeenCalledTimes(2);

    await settle(() => answer.resolve(engineerDay("2026-09-25", ROUTE_25)));
    expect(routeNote()).toBeNull();
    expect(drawnRoute()).toEqual(ROUTE_25);
    expect(fitBounds).toHaveBeenLastCalledWith(ROUTE_25, expect.anything());
  });

  it("the label's km is the route's own, and says the table's when the two differ", async () => {
    await mount();
    // Today, say: the report loaded at 12.5 and Payroll has more by the click.
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25, { total_km: 48.15 }));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")} · 48.15 km (12.5 in the table)`);
    expect(container.querySelector('[data-testid="km-route-label"]')?.getAttribute("title")).toBe(routeLabel());
  });

  it("all of a km's cell takes the click, not only the button", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!.parentElement!);
    expect(getEngineerDay).toHaveBeenCalledWith("t", 7, "2026-09-25");
    expect(getEngineerDay).toHaveBeenCalledTimes(1);
    expect(drawnRoute()).toEqual(ROUTE_25);
  });

  it("a dash's cell takes no click", async () => {
    await mount();
    const dash = Array.from(rows()[0]!.querySelectorAll("td")).find((td) => td.textContent === "-")!;
    await click(dash);
    expect(getEngineerDay).not.toHaveBeenCalled();
    expect(routeLabel()).toBe("Click a km to see that day's route.");
  });

  it("the picked fill is on the button too, and an unpicked km keeps the cell's weight", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    // The app greys a hovered row's cells with !important; the button's own
    // fill is what keeps the white figure readable then.
    expect(dayCell("Arun", "2026-09-25")!.style.background).toBe("rgb(29, 78, 216)");
    expect(dayCell("Arun", "2026-09-25")!.style.color).toBe("rgb(255, 255, 255)");
    expect(dayCell("Arun", "2026-09-27")!.style.background).toBe("transparent");
    expect(dayCell("Arun", "2026-09-27")!.style.fontWeight).toBe("inherit");
  });

  it("on a narrow screen a click brings the map up, also a click on the day already shown", async () => {
    await mount();
    // The map has wrapped under the table, below the fold.
    const box = container.querySelector<HTMLDivElement>('[data-testid="km-route-box"]')!;
    box.getBoundingClientRect = () => ({ top: 900, bottom: 1380, height: 480, left: 0, right: 400, width: 400, x: 0, y: 900, toJSON: () => ({}) });
    const scrollIntoView = vi.fn();
    box.scrollIntoView = scrollIntoView;
    getEngineerDay.mockResolvedValue(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
    // Back up at the table, the same day clicked again: no second fetch, but the map comes up.
    await click(dayCell("Arun", "2026-09-25")!);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(getEngineerDay).toHaveBeenCalledTimes(1);
  });

  it("with the map in view a click does not scroll", async () => {
    await mount();
    const box = container.querySelector<HTMLDivElement>('[data-testid="km-route-box"]')!;
    box.getBoundingClientRect = () => ({ top: 300, bottom: 780, height: 480, left: 0, right: 400, width: 400, x: 0, y: 300, toJSON: () => ({}) });
    const scrollIntoView = vi.fn();
    box.scrollIntoView = scrollIntoView;
    getEngineerDay.mockResolvedValue(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("the picked cell stays blue all over while its row is hovered, and a km can still be selected", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    // The hover rule replaces the background only; an inset shadow survives it.
    expect(dayCell("Arun", "2026-09-25")!.parentElement!.style.boxShadow).toContain("inset");
    expect(dayCell("Arun", "2026-09-27")!.parentElement!.style.boxShadow).toBe("");
    // As plain text could, a figure can be double-clicked and copied.
    expect(dayCell("Arun", "2026-09-27")!.style.userSelect).toBe("text");
  });

  it("another cycle clears the map: the day it showed is not in that table", async () => {
    await mount();
    getEngineerDay.mockResolvedValueOnce(engineerDay("2026-09-25", ROUTE_25));
    await click(dayCell("Arun", "2026-09-25")!);
    expect(drawnRoute()).toEqual(ROUTE_25);

    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(rows()).toHaveLength(2);
    expect(routeLabel()).toBe("Click a km to see that day's route.");
    expect(drawnRoute()).toBeNull();
    expect(container.querySelectorAll('[aria-pressed="true"][data-testid="km-day"]')).toHaveLength(0);
    expect(getEngineerDay).toHaveBeenCalledTimes(1);
  });
});

/**
 * The ROUTE KM table: under the RTPL table and its map, asked about the cycle's
 * FSEs, showing the ones on screen.
 */

interface RouteKmProps {
  token: string;
  fromIso: string;
  toIso: string;
  days: string[];
  engineers: EngineerKmDays[];
  shown: EngineerKmDays[];
  onSessionExpired: () => void;
}
const routeKmProps = () => routeKmSection.mock.lastCall?.[0] as RouteKmProps;
const routeKm = () => container.querySelector('[data-testid="route-km-section"]');
const names = (list: EngineerKmDays[]) => list.map((row) => row.engineer_name);

describe("KmReportPanel: the ROUTE KM table", () => {
  it("comes once, after the RTPL table and its map, for the cycle's FSEs", async () => {
    await mount();
    expect(container.querySelectorAll('[data-testid="route-km-section"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="km-route"]')?.parentElement?.nextElementSibling).toBe(routeKm());
    expect(routeKmProps()).toMatchObject({ token: "t", fromIso: "2026-09-25", toIso: "2026-10-24", days: DAYS });
    // The FSEs Payroll knows; the vendor it does not is in neither list.
    expect(names(routeKmProps().engineers)).toEqual(["Arun", "Bala"]);
    expect(names(routeKmProps().shown)).toEqual(["Arun", "Bala"]);
  });

  it("a region box narrows what it shows, not who it asks about", async () => {
    await mount();
    await click(boxes()[2]!);
    expect(names(routeKmProps().engineers)).toEqual(["Arun", "Bala"]);
    expect(names(routeKmProps().shown)).toEqual(["Bala"]);
  });

  it("is not there while a cycle loads, nor when the search leaves nobody", async () => {
    await mount();
    let answer: (value: unknown) => void = () => {};
    getRosterKmDays.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Previous cycle"]')!);
    expect(routeKm()).toBeNull();
    await act(async () => {
      answer(REPORT);
    });
    await act(async () => {});
    expect(routeKm()).not.toBeNull();
    expect(routeKmProps()).toMatchObject({ fromIso: "2026-08-25", toIso: "2026-09-24" });

    await type(container.querySelector<HTMLInputElement>('input[aria-label="Search FSE"]')!, "nobody");
    expect(routeKm()).toBeNull();
  });

  it("an expired login inside it ends as one on the report does", async () => {
    await mount();
    await act(async () => {
      routeKmProps().onSessionExpired();
    });
    expect(container.textContent).toContain("Your login has expired");
    expect(rows()).toHaveLength(0);
    expect(routeKm()).toBeNull();
    expect(tileValue("Total km")).toBe("—");
  });
});
