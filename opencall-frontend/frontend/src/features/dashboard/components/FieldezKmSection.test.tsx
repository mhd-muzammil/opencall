// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CasesByDayCell,
  EngineerKmDays,
  FieldezKmCell,
  FieldezKmDay,
  FieldezKmMissing,
  FieldezKmRange,
  RouteKmPoint,
} from "../../../lib/payrollTrackingApiClient";
import type { CasesById } from "./KmCases";
import type { FieldezKmSectionProps } from "./FieldezKmSection";

/**
 * The FIELDEZ table, mounted: who it asks Payroll about and how often, what
 * every day reads -- a day waiting for FieldEZ, a day with check-ins left out
 * -- and the map beside it that draws a clicked day and names what it left out.
 */

const getFieldezKm = vi.fn();
const getFieldezKmDay = vi.fn();
// ROUTE KM's own questions: here only to show this table never asks them.
const getRouteKm = vi.fn();
const getRouteKmDay = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getFieldezKm: (...args: unknown[]) => getFieldezKm(...args),
  getFieldezKmDay: (...args: unknown[]) => getFieldezKmDay(...args),
  getRouteKm: (...args: unknown[]) => getRouteKm(...args),
  getRouteKmDay: (...args: unknown[]) => getRouteKmDay(...args),
}));

const DAYS = ["2026-09-25", "2026-09-26", "2026-09-27"];

function fse(engineer_name: string, branch: string, engineer_id: number | null): EngineerKmDays {
  return {
    engineer_id,
    engineer_name,
    matched: true,
    branch,
    department: "FSE",
    days: {},
    distance_km: 0,
    days_tracked: 0,
  };
}

const ARUN = fse("Arun", "Chennai", 7);
const BALA = fse("Bala", "Salem", 8);
const CHITRA = fse("Chitra", "Hosur", 9);
const DEV = fse("Dev", "Vellore", 10);

const ready = (km: number, points = 3, missing = 0): FieldezKmCell => ({ km, points, status: "ready", missing });
const NO_POINTS: FieldezKmCell = { km: null, points: 1, status: "no_points", missing: 0 };
const FAILED: FieldezKmCell = { km: null, points: 4, status: "failed", missing: 0 };
const PENDING: FieldezKmCell = { km: null, points: 0, status: "pending", missing: 0 };
const WAITING: FieldezKmCell = { km: null, points: 2, status: "waiting", missing: 0 };

/** Payroll's answer part-way through a cycle: two days still to measure. */
function range(overrides: Partial<FieldezKmRange> = {}): FieldezKmRange {
  return {
    configured: true,
    days: DAYS,
    engineers: [
      { engineer_id: 7, days: { "2026-09-25": ready(12.74, 5), "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) } },
      { engineer_id: 8, days: { "2026-09-25": FAILED, "2026-09-26": ready(0, 2), "2026-09-27": PENDING } },
      { engineer_id: 9, days: { "2026-09-25": ready(3.5), "2026-09-26": ready(40.25), "2026-09-27": PENDING } },
      { engineer_id: 10, days: { "2026-09-25": ready(1), "2026-09-26": ready(2), "2026-09-27": ready(3) } },
    ],
    pending: 2,
    measured_now: 3,
    waiting: 0,
    ...overrides,
  };
}

/** The same cycle once Ola has got through all of it. */
const DONE = range({
  engineers: [
    { engineer_id: 7, days: { "2026-09-25": ready(12.74, 5), "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) } },
    { engineer_id: 8, days: { "2026-09-25": FAILED, "2026-09-26": ready(0, 2), "2026-09-27": ready(5.2) } },
    { engineer_id: 9, days: { "2026-09-25": ready(3.5), "2026-09-26": ready(40.25), "2026-09-27": ready(1.03) } },
    { engineer_id: 10, days: { "2026-09-25": ready(1), "2026-09-26": ready(2), "2026-09-27": ready(3) } },
  ],
  pending: 0,
});

/** The same cycle with Ola done, and the 27th's two days waiting for the FieldEZ tool instead. */
const WAITED = range({
  engineers: [
    { engineer_id: 7, days: { "2026-09-25": ready(12.74, 5), "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) } },
    { engineer_id: 8, days: { "2026-09-25": FAILED, "2026-09-26": ready(0, 2), "2026-09-27": WAITING } },
    { engineer_id: 9, days: { "2026-09-25": ready(3.5), "2026-09-26": ready(40.25), "2026-09-27": WAITING } },
    { engineer_id: 10, days: { "2026-09-25": ready(1), "2026-09-26": ready(2), "2026-09-27": ready(3) } },
  ],
  pending: 0,
  measured_now: 0,
  waiting: 2,
});

// Arun's 25th, as Payroll's day answer hands it over: Login, three check-ins
// at their work orders' Problem Resolution places, and Logout, at local times.
const at = (hour: number, minute: number) => new Date(2026, 8, 25, hour, minute).toISOString();
const DAY_POINTS: RouteKmPoint[] = [
  { kind: "login", at: at(9, 5), latitude: 12.7409, longitude: 77.8253, case_number: null },
  { kind: "checkin", at: at(10, 12), latitude: 12.7512, longitude: 77.8101, case_number: "OC-004546" },
  { kind: "checkin", at: at(11, 40), latitude: 12.7633, longitude: 77.7952, case_number: "OC-004551" },
  { kind: "checkin", at: at(14, 20), latitude: 12.7298, longitude: 77.8317, case_number: null },
  { kind: "logout", at: at(18, 2), latitude: 12.7411, longitude: 77.8249, case_number: null },
];
const ROAD: [number, number][] = [
  [12.7409, 77.8253],
  [12.7466, 77.8188],
  [12.7512, 77.8101],
  [12.7633, 77.7952],
  [12.7298, 77.8317],
  [12.7411, 77.8249],
];

function fieldezDay(overrides: Partial<FieldezKmDay> = {}): FieldezKmDay {
  return {
    configured: true,
    engineer_id: 7,
    date: "2026-09-25",
    status: "ready",
    km: 12.74,
    points: DAY_POINTS,
    path: ROAD,
    error: "",
    missing: [],
    waiting: 0,
    ...overrides,
  };
}

const onSessionExpired = vi.fn();

const PROPS: FieldezKmSectionProps = {
  token: "t",
  fromIso: "2026-09-25",
  toIso: "2026-10-24",
  days: DAYS,
  // Everyone the cycle matched; the search has left Dev off the screen.
  engineers: [ARUN, BALA, CHITRA, DEV],
  shown: [ARUN, BALA, CHITRA],
  onSessionExpired,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getFieldezKm.mockResolvedValue(range());
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function mount(props: Partial<FieldezKmSectionProps> = {}) {
  const { default: FieldezKmSection } = await import("./FieldezKmSection");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(FieldezKmSection, { ...PROPS, ...props }));
  });
  await act(async () => {});
}

async function rerender(props: Partial<FieldezKmSectionProps>) {
  const { default: FieldezKmSection } = await import("./FieldezKmSection");
  await act(async () => {
    root.render(createElement(FieldezKmSection, { ...PROPS, ...props }));
  });
  await act(async () => {});
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await act(async () => {});
}

async function settle(run: () => void) {
  await act(async () => {
    run();
  });
  await act(async () => {});
}

/** Moves the faked clock on, and lets whatever it set off land. */
async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const rows = () => Array.from(container.querySelectorAll('[data-testid="fieldez-km-row"]'));
/**
 * A cell's text as these tests read it: the figure and its marks, without the
 * grey "km" before it or the assign/closed lines under it (read with
 * caseLine); a Cases column cell as "assign N · closed M".
 */
/** A day cell's or button's figure and marks, without the grey "km" before it or the lines under it. */
const figure = (el: Element | null | undefined) => {
  if (!el) return null;
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[data-testid="km-label"], [data-testid="km-cases"]').forEach((node) => node.remove());
  return clone.textContent;
};
const cellText = (td: Element) => {
  const clone = td.cloneNode(true) as Element;
  clone.querySelectorAll('[data-testid="km-label"], [data-testid="km-cases"]').forEach((node) => node.remove());
  const assign = clone.querySelector('[data-testid="km-assign"]');
  if (assign) return `${assign.textContent} · ${clone.querySelector('[data-testid="km-closed"]')?.textContent}`;
  return clone.textContent?.trim();
};
const cells = (row: Element) => Array.from(row.querySelectorAll("td")).map(cellText);
const footer = () => cells(container.querySelector('[data-testid="fieldez-km-footer"]')!);
const status = () => container.querySelector('[data-testid="fieldez-km-status"]')?.textContent ?? null;
const routeLabel = () => container.querySelector('[data-testid="fieldez-km-label"]')?.textContent;
const routeNote = () => container.querySelector('[data-testid="fieldez-km-note"]')?.textContent ?? null;
const googleLink = () => container.querySelector<HTMLAnchorElement>('[data-testid="fieldez-km-google"]');
/** Where Google's map beside the table is pointed. */
const mapSrc = () =>
  container.querySelector<HTMLIFrameElement>('[data-testid="fieldez-km-google-map"]')?.getAttribute("src") ?? null;
const mapNote = () => container.querySelector('[data-testid="fieldez-km-map-note"]')?.textContent ?? null;
/** The check-ins the picked day left out, as listed under the map. */
const missingBox = () => container.querySelector('[data-testid="fieldez-km-missing"]');
const missingItems = () => Array.from(missingBox()?.querySelectorAll("li") ?? []).map((li) => li.textContent);
const missingNote = () => container.querySelector('[data-testid="fieldez-km-missing-note"]')?.textContent ?? null;
/** Google's map of the region: nothing picked, or the pick's places not here yet. */
const AREA = "https://maps.google.com/maps?ll=12.6,79.0&z=7&output=embed";
/** Google's map of Arun's 25th: Login, three check-ins and Logout, in order. */
const DAY_ON_GOOGLE =
  "https://maps.google.com/maps?saddr=12.7409,77.8253" +
  "&daddr=12.7512,77.8101+to:12.7633,77.7952+to:12.7298,77.8317+to:12.7411,77.8249&dirflg=d&output=embed";

/** A day as the section prints it: "25 Sep 2026" ("25 Sept 2026" where ICU says so). */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
/** A clickable km, by whose and which day. */
const dayButton = (name: string, iso: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="fieldez-km-day"]')).find((b) =>
    b.getAttribute("aria-label")?.includes(`${name}'s route on ${longDate(iso)}`),
  );
/** Any day's cell, clickable or not. */
const dayCell = (name: string, iso: string) => {
  const row = rows().find((r) => cells(r)[1] === name)!;
  return Array.from(row.querySelectorAll("td"))[3 + DAYS.indexOf(iso)]!;
};

describe("FieldezKmSection: the table", () => {
  it("asks Payroll about every matched FSE of the cycle, once each, whatever is on screen", async () => {
    await mount({
      // A second spelling of Arun resolves to the same Payroll record, and an
      // FSE Payroll could not resolve has no id to ask about.
      engineers: [ARUN, BALA, CHITRA, DEV, fse("Arun K", "Chennai", 7), fse("Vendor Ravi", "Chennai", null)],
    });
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    expect(getFieldezKm).toHaveBeenCalledWith("t", "2026-09-25", "2026-10-24", [7, 8, 9, 10]);
    // Its own question, not ROUTE KM's.
    expect(getRouteKm).not.toHaveBeenCalled();
  });

  it("lists the FSEs on screen with each day's road km, the days with any, and the totals", async () => {
    await mount();
    expect(rows()).toHaveLength(3);
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
    expect(cells(rows()[1]!)).toEqual(["2", "Bala", "Salem", "—", "-", "…", "0", "0"]);
    expect(cells(rows()[2]!)).toEqual(["3", "Chitra", "Hosur", "3.5", "40.25", "…", "2", "43.75"]);
    // Measured days only: one still waiting adds nothing yet.
    expect(footer()).toEqual(["Total", "16.24", "40.25", "8.1", "", "64.59"]);
  });

  it("is headed FIELDEZ, says how it is measured, and how many days are left", async () => {
    await mount();
    expect(container.querySelector('[data-testid="fieldez-km-title"]')?.textContent).toBe("FIELDEZ");
    expect(container.textContent).toContain(
      "Login → Problem Resolution places (FieldEZ) → Logout · road km by Ola Maps",
    );
    expect(status()).toBe("Measuring… 2 FSE-days left. Ola allows a few a minute, so this fills in by itself.");
  });

  it("while the first answer is on its way every day reads … and the heading says so", async () => {
    getFieldezKm.mockReturnValueOnce(new Promise(() => {}));
    await mount();
    expect(status()).toBe("Loading the FieldEZ km…");
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "…", "…", "…", "0", "0"]);
  });

  it("a day Ola could not route says so, and a day still waiting is grey", async () => {
    await mount();
    expect(dayCell("Bala", "2026-09-25").title).toBe("Ola could not measure this day; it is tried again later");
    expect(dayCell("Bala", "2026-09-27").style.color).toBe("rgb(156, 163, 175)");
    expect(dayCell("Arun", "2026-09-26").style.color).toBe("rgb(156, 163, 175)");
    expect(dayCell("Arun", "2026-09-25").title).toBe(`Arun · ${longDate("2026-09-25")}`);
  });

  it("the region box and the search narrow the table and its totals, and ask nothing again", async () => {
    await mount();
    await rerender({ shown: [CHITRA] });
    expect(rows().map((r) => cells(r)[1])).toEqual(["Chitra"]);
    expect(cells(rows()[0]!)[0]).toBe("1");
    expect(footer()).toEqual(["Total", "3.5", "40.25", "-", "", "43.75"]);
    // The same FSEs handed over again as a new list is the same question.
    await rerender({ shown: [ARUN], engineers: [...PROPS.engineers] });
    expect(rows().map((r) => cells(r)[1])).toEqual(["Arun"]);
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
  });

  it("with no Ola key in Payroll it says so, not a table of dots", async () => {
    getFieldezKm.mockResolvedValueOnce({
      configured: false,
      days: [],
      engineers: [],
      pending: 0,
      measured_now: 0,
      waiting: 0,
    });
    await mount();
    expect(container.querySelector('[data-testid="fieldez-km-title"]')?.textContent).toBe("FIELDEZ");
    expect(container.textContent).toContain("Payroll has no Ola Maps key");
    expect(rows()).toHaveLength(0);
    expect(container.querySelector('[data-testid="fieldez-km-google-map"]')).toBeNull();
    expect(status()).toBeNull();
  });
});

describe("FieldezKmSection: asking again", () => {
  beforeEach(() => {
    // Only the timers: the answers themselves still arrive as promises do.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("asks again every 15 s while days are left, and stops when none are", async () => {
    getFieldezKm
      .mockResolvedValueOnce(range())
      .mockResolvedValueOnce(range({ pending: 1 }))
      .mockResolvedValueOnce(DONE);
    await mount();
    expect(getFieldezKm).toHaveBeenCalledTimes(1);

    await wait(14_999);
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
    expect(getFieldezKm).toHaveBeenLastCalledWith("t", "2026-09-25", "2026-10-24", [7, 8, 9, 10]);
    expect(status()).toBe("Measuring… 1 FSE-day left. Ola allows a few a minute, so this fills in by itself.");

    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);
    expect(status()).toBeNull();
    expect(cells(rows()[1]!)).toEqual(["2", "Bala", "Salem", "—", "-", "5.2", "1", "5.2"]);
    expect(footer()).toEqual(["Total", "16.24", "40.25", "14.33", "", "70.82"]);

    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);
  });

  it("stops asking once it is taken down", async () => {
    await mount();
    await act(async () => {
      root.unmount();
    });
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
  });

  it("an answer for the last cycle is never shown under the new one", async () => {
    await mount();
    expect(cells(rows()[0]!)[3]).toBe("12.74");
    // The same three columns, so only the question it answered can tell an
    // answer apart.
    const late = deferred<FieldezKmRange>();
    const current = deferred<FieldezKmRange>();
    getFieldezKm.mockReturnValueOnce(late.promise).mockReturnValueOnce(current.promise);
    await rerender({ fromIso: "2026-09-20", toIso: "2026-10-24" });
    expect(getFieldezKm).toHaveBeenLastCalledWith("t", "2026-09-20", "2026-10-24", [7, 8, 9, 10]);
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "…", "…", "…", "0", "0"]);
    expect(status()).toBe("Loading the FieldEZ km…");

    // On again before that answer is in: when it comes, its cycle has gone.
    await rerender({ fromIso: "2026-09-21", toIso: "2026-10-24" });
    await settle(() => late.resolve(range()));
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "…", "…", "…", "0", "0"]);
    // Nor does it keep asking about its own cycle.
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);

    await settle(() => current.resolve(DONE));
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
  });

  it("an expired login hands over to the panel and stops asking", async () => {
    const { ApiClientError } = await import("../../../lib/api/http");
    getFieldezKm.mockResolvedValueOnce(range()).mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await mount();
    await wait(15_000);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(status()).not.toContain("Could not load");
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
  });

  it("a question that fails says so, keeps what was measured, and asks again", async () => {
    getFieldezKm
      .mockResolvedValueOnce(range())
      .mockRejectedValueOnce(new Error("Payroll is not answering"))
      .mockResolvedValueOnce(range({ pending: 0 }));
    await mount();
    await wait(15_000);
    expect(status()).toBe("Could not reach Payroll just now; asking again… (Payroll is not answering)");
    expect(container.querySelector('[data-testid="fieldez-km-status"]')?.getAttribute("role")).toBe("status");
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
    // A blip -- a redeploy, a slow Ola -- does not end the fill.
    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);
    expect(status()).toBeNull();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("four failed questions in a row stop the asking, and say so", async () => {
    getFieldezKm.mockResolvedValueOnce(range()).mockRejectedValue(new Error("Payroll is not answering"));
    await mount();
    for (let ask = 0; ask < 4; ask += 1) await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(5);
    expect(status()).toBe("Could not load the FieldEZ km: Payroll is not answering");
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(5);
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
  });
});

describe("FieldezKmSection: the map", () => {
  it("sits beside the table, empty, saying what to click", async () => {
    await mount();
    const grid = container.querySelector('[data-testid="fieldez-km-grid"]')!;
    const map = container.querySelector('[data-testid="fieldez-km-route"]')!;
    // The table's column, then the map's, in one row.
    expect(grid.parentElement?.nextElementSibling).toBe(map);
    expect((map.parentElement as HTMLElement).style.display).toBe("flex");
    expect(routeLabel()).toBe("Click a km to see that day's route.");
    expect(routeNote()).toBeNull();
    expect(googleLink()).toBeNull();
    expect(mapSrc()).toBe(AREA);
    expect(mapNote()).toBeNull();
    expect(missingBox()).toBeNull();
    expect(getFieldezKmDay).not.toHaveBeenCalled();
  });

  it("a clicked km opens that day: its places go to Google's map beside the table, and to Google Maps", async () => {
    await mount();
    const answer = deferred<FieldezKmDay>();
    getFieldezKmDay.mockReturnValueOnce(answer.promise);
    await click(dayButton("Arun", "2026-09-25")!);

    expect(getFieldezKmDay).toHaveBeenCalledWith("t", 7, "2026-09-25");
    // Its own question, not ROUTE KM's.
    expect(getRouteKmDay).not.toHaveBeenCalled();
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")}`);
    expect(routeNote()).toBe("Loading the route…");
    // Not the last pick's places under this pick's name.
    expect(mapSrc()).toBe(AREA);
    expect(googleLink()).toBeNull();
    expect(dayButton("Arun", "2026-09-25")?.getAttribute("aria-pressed")).toBe("true");

    await settle(() => answer.resolve(fieldezDay()));
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);
    expect(mapNote()).toBe(
      "Google's own route, by car, with its own km: Google's embedded map has no bike route, so the Google Maps button opens it by bike. The km in the table is Ola's.",
    );
    expect(container.querySelector('[data-testid="fieldez-km-map-office"]')).toBeNull();
    expect(routeNote()).toBeNull();
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")} · 12.74 km · 5 stops`);
    expect(container.querySelector('[data-testid="fieldez-km-label"]')?.getAttribute("title")).toBe(routeLabel());

    const link = googleLink()!;
    expect(link.getAttribute("href")).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=12.7409,77.8253&destination=12.7411,77.8249" +
        "&waypoints=12.7512,77.8101%7C12.7633,77.7952%7C12.7298,77.8317&travelmode=two-wheeler",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe("Open this route by bike in Google Maps");
    expect(link.textContent).toBe("Google Maps · bike");
    // Its own colours: the app gives a link none.
    expect(link.style.color).toBe("rgb(29, 78, 216)");
    expect(link.style.textDecoration).toBe("none");
  });

  it("clicking the day already shown asks nothing again, nor twice while it loads", async () => {
    await mount();
    const answer = deferred<FieldezKmDay>();
    getFieldezKmDay.mockReturnValueOnce(answer.promise);
    await click(dayButton("Arun", "2026-09-25")!);
    await click(dayButton("Arun", "2026-09-25")!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);

    await settle(() => answer.resolve(fieldezDay()));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);
  });

  it("a day that failed to load is asked for again by clicking its km again", async () => {
    await mount();
    getFieldezKmDay.mockRejectedValueOnce(new Error("Payroll is not answering"));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Could not load the route: Payroll is not answering");
    expect(container.querySelector<HTMLElement>('[data-testid="fieldez-km-note"]')!.style.color).toBe(
      "rgb(185, 28, 28)",
    );
    expect(mapSrc()).toBe(AREA);

    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(routeNote()).toBeNull();
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);
  });

  it("a day Ola could not route, opened, says so and is asked for again on a click", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ status: "failed", km: null, path: [], error: "NOT_FOUND" }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Ola could not measure this day (NOT_FOUND); it is tried again later.");
    // The places are still worth seeing, and Google may route them.
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);
    expect(googleLink()).not.toBeNull();

    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(routeNote()).toBeNull();
  });

  it("a day with fewer than two places says so, and has nothing for Google", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(
      fieldezDay({ status: "no_points", km: null, points: [DAY_POINTS[0]!], path: [] }),
    );
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("No route: fewer than two places this day.");
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")} · 1 stop`);
    expect(mapSrc()).toBe("https://maps.google.com/maps?q=12.7409,77.8253&z=15&output=embed");
    expect(mapNote()).toBeNull();
    expect(googleLink()).toBeNull();
  });

  it("an earlier click answered late never draws over a later one", async () => {
    await mount();
    const first = deferred<FieldezKmDay>();
    const second = deferred<FieldezKmDay>();
    getFieldezKmDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await click(dayButton("Arun", "2026-09-25")!);
    await click(dayButton("Arun", "2026-09-27")!);

    const later = fieldezDay({ date: "2026-09-27", km: 8.1, points: DAY_POINTS.slice(0, 3), path: ROAD.slice(0, 3) });
    await settle(() => second.resolve(later));
    await settle(() => first.resolve(fieldezDay()));
    expect(routeLabel()).toBe(`Arun · Sun ${longDate("2026-09-27")} · 8.1 km · 3 stops`);
    expect(mapSrc()).toBe(
      "https://maps.google.com/maps?saddr=12.7409,77.8253&daddr=12.7512,77.8101+to:12.7633,77.7952&dirflg=d&output=embed",
    );
  });

  it("only a measured km can be clicked: a dash, a failed day and one still waiting cannot", async () => {
    await mount();
    // 12.74 and 8.1 for Arun, 3.5 and 40.25 for Chitra.
    expect(container.querySelectorAll('[data-testid="fieldez-km-day"]')).toHaveLength(4);
    for (const [name, day] of [
      ["Arun", "2026-09-26"], // fewer than two places
      ["Bala", "2026-09-25"], // Ola could not route it
      ["Bala", "2026-09-26"], // measured, at 0 km
      ["Bala", "2026-09-27"], // not measured yet
    ] as const) {
      await click(dayCell(name, day));
    }
    expect(getFieldezKmDay).not.toHaveBeenCalled();
    expect(routeLabel()).toBe("Click a km to see that day's route.");
  });

  it("all of a km's cell takes the click, and the picked one is filled, its button too", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayCell("Arun", "2026-09-25"));
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
    expect(getFieldezKmDay).toHaveBeenCalledWith("t", 7, "2026-09-25");

    const picked = dayButton("Arun", "2026-09-25")!;
    expect(picked.parentElement!.style.background).toBe("rgb(29, 78, 216)");
    // The app greys a hovered row's cells with !important; the inset shadow
    // and the button's own fill are what keep the pick blue then.
    expect(picked.parentElement!.style.boxShadow).toContain("inset");
    expect(picked.style.background).toBe("rgb(29, 78, 216)");
    expect(picked.style.color).toBe("rgb(255, 255, 255)");

    const other = dayButton("Arun", "2026-09-27")!;
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(other.style.background).toBe("transparent");
    expect(other.style.fontWeight).toBe("inherit");
    expect(other.style.userSelect).toBe("text");
    expect(other.parentElement!.style.boxShadow).toBe("");
  });

  it("on a narrow screen a click brings the map up, also a click on the day already shown", async () => {
    await mount();
    // The map has wrapped under the table, below the fold.
    const box = container.querySelector<HTMLDivElement>('[data-testid="fieldez-km-box"]')!;
    box.getBoundingClientRect = () => ({ top: 900, bottom: 1380, height: 480, left: 0, right: 400, width: 400, x: 0, y: 900, toJSON: () => ({}) });
    const scrollIntoView = vi.fn();
    box.scrollIntoView = scrollIntoView;
    getFieldezKmDay.mockResolvedValue(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "center" });
    await click(dayButton("Arun", "2026-09-25")!);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
  });

  it("with the map in view a click does not scroll", async () => {
    await mount();
    const box = container.querySelector<HTMLDivElement>('[data-testid="fieldez-km-box"]')!;
    box.getBoundingClientRect = () => ({ top: 300, bottom: 780, height: 480, left: 0, right: 400, width: 400, x: 0, y: 300, toJSON: () => ({}) });
    const scrollIntoView = vi.fn();
    box.scrollIntoView = scrollIntoView;
    getFieldezKmDay.mockResolvedValue(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("another cycle clears the map: the day it showed is not in that table", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(
      fieldezDay({ missing: [{ case_number: "OC-004560", wo: null, reason: "no_wo" }] }),
    );
    await click(dayButton("Arun", "2026-09-25")!);
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);
    expect(missingBox()).not.toBeNull();

    await rerender({ fromIso: "2026-08-25", toIso: "2026-09-24" });
    expect(routeLabel()).toBe("Click a km to see that day's route.");
    expect(mapSrc()).toBe(AREA);
    expect(routeNote()).toBeNull();
    expect(googleLink()).toBeNull();
    expect(missingBox()).toBeNull();
    expect(container.querySelectorAll('[aria-pressed="true"][data-testid="fieldez-km-day"]')).toHaveLength(0);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
  });

  it("an expired login while opening a day hands over to the panel", async () => {
    await mount();
    const { ApiClientError } = await import("../../../lib/api/http");
    getFieldezKmDay.mockRejectedValueOnce(new ApiClientError("Unauthorized", 401, null));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(routeNote()).not.toContain("Could not load");
  });
});

describe("FieldezKmSection: what the table says about itself", () => {
  it("a clicked day measured again puts its own km in the table, so the cell, the totals and the map agree", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ km: 15.2 }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "15.2", "-", "8.1", "2", "23.3"]);
    expect(routeLabel()).toContain("15.2 km");
  });

  it("a clicked day that failed this time keeps its figure in the table, to be clicked again", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ status: "failed", km: null, path: [], error: "HTTP 503" }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(cells(rows()[0]!)[3]).toBe("12.74");
    expect(dayButton("Arun", "2026-09-25")).toBeDefined();
  });

  it("says how many days Ola could not measure are left out of the totals, and what each glyph means", async () => {
    await mount();
    expect(container.querySelector('[data-testid="fieldez-km-failed-note"]')?.textContent).toBe(
      "1 day Ola could not measure (—) is not in the totals; it is tried again later.",
    );
    expect(dayCell("Bala", "2026-09-25").getAttribute("aria-label")).toBe("could not be measured");
    expect(dayCell("Bala", "2026-09-27").getAttribute("aria-label")).toBe("not measured yet");
    // Not announced: it changes on every poll of a fill.
    expect(container.querySelector('[data-testid="fieldez-km-status"]')?.getAttribute("role")).toBeNull();
  });

  it("marks a km that starts or ends at the office, and says what the mark means", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [
          {
            engineer_id: 7,
            days: { "2026-09-25": { ...ready(12.74, 5), office: true }, "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) },
          },
        ],
      }),
    );
    await mount();
    const button = dayButton("Arun", "2026-09-25")!;
    expect(figure(button)).toBe("12.74•");
    expect(button.getAttribute("aria-label")).toContain("(from or to the office)");
    expect(dayCell("Arun", "2026-09-25").title).toContain("placed at the FSE's office");
    expect(container.querySelector('[data-testid="fieldez-km-office-note"]')?.textContent).toContain(
      "placed at the FSE's office",
    );
    // The totals add the figure itself.
    expect(cells(rows()[0]!).at(-1)).toBe("20.84");
  });

  it("no office mark and no office note when no km rests on an office", async () => {
    await mount();
    expect(container.querySelector('[data-testid="fieldez-km-office-note"]')).toBeNull();
    expect(figure(dayButton("Arun", "2026-09-25"))).toBe("12.74");
  });

  it("a day of more than ten places says the Google link opens only ten of them", async () => {
    await mount();
    const many = Array.from({ length: 12 }, (_, n) => ({ ...DAY_POINTS[1]!, at: at(9, n), latitude: 12.7 + n / 100 }));
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ points: many }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(googleLink()?.textContent).toBe("Google Maps · bike (first 9 + last of 12)");
    expect(googleLink()?.getAttribute("aria-label")).toBe(
      "Open 10 of the 12 places by bike in Google Maps: the first 9 and the last",
    );
  });

  it("says it is waiting for Ola when a poll measured nothing", async () => {
    getFieldezKm.mockResolvedValue(range({ measured_now: 0 }));
    await mount();
    expect(status()).toBe("Waiting for Ola… 2 FSE-days left. It allows a few a minute; this goes on by itself.");
  });
});

describe("FieldezKmSection: the second review", () => {
  it("keeps asking while today's measured days are still to be read again, and says so", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm
      .mockResolvedValueOnce(range({ engineers: DONE.engineers, pending: 0, rechecking: 2, measured_now: 0 }))
      .mockResolvedValueOnce(range({ engineers: DONE.engineers, pending: 0, rechecking: 0, measured_now: 0 }));
    await mount();
    expect(status()).toBe("Checking today's places for new check-ins…");
    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
    expect(status()).toBeNull();
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
  });

  it("the new cycle's dates with the last cycle's days ask nothing until the days come", async () => {
    await mount();
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    await rerender({ fromIso: "2026-08-25", toIso: "2026-09-24" });
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    await rerender({ fromIso: "2026-08-25", toIso: "2026-09-24", days: ["2026-08-25", "2026-08-26"] });
    expect(getFieldezKm).toHaveBeenLastCalledWith("t", "2026-08-25", "2026-09-24", [7, 8, 9, 10]);
  });

  it("a later answer that measured the picked day again brings the map the new day", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm
      .mockResolvedValueOnce(range({ engineers: DONE.engineers, pending: 0, rechecking: 1, measured_now: 0 }))
      .mockResolvedValueOnce(
        range({
          engineers: DONE.engineers.map((row) =>
            row.engineer_id === 7 ? { ...row, days: { ...row.days, "2026-09-25": ready(16.4, 6) } } : row,
          ),
          pending: 0,
          rechecking: 0,
        }),
      );
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay()).mockResolvedValueOnce(fieldezDay({ km: 16.4 }));
    await mount();
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeLabel()).toContain("12.74 km");

    await wait(15_000);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(routeLabel()).toContain("16.4 km");
    expect(cells(rows()[0]!)[3]).toBe("16.4");
  });

  it("a day at the office and back with no call is a dash with the office mark", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [
          { engineer_id: 7, days: { "2026-09-25": { km: 0, points: 2, status: "ready", office: true, missing: 0 } } },
        ],
      }),
    );
    await mount();
    const cell = dayCell("Arun", "2026-09-25");
    expect(figure(cell)).toBe("-•");
    expect(cell.title).toContain("placed at the FSE's office");
    expect(container.querySelector('[data-testid="fieldez-km-office-note"]')).not.toBeNull();
  });

  it("the office mark is not copied with the figure", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [{ engineer_id: 7, days: { "2026-09-25": { ...ready(12.74, 5), office: true } } }],
      }),
    );
    await mount();
    const mark = dayButton("Arun", "2026-09-25")!.querySelector("span")!;
    expect(mark.style.userSelect).toBe("none");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
  });

  it("a failed day settled for good promises no retry: on the cell, under the table, on the map", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [
          {
            engineer_id: 7,
            days: {
              "2026-09-25": ready(12.74, 5),
              "2026-09-26": { km: null, points: 4, status: "failed", final: true, missing: 0 },
            },
          },
        ],
      }),
    );
    await mount();
    expect(dayCell("Arun", "2026-09-26").title).toBe("Ola could not measure this day");
    expect(container.querySelector('[data-testid="fieldez-km-failed-note"]')?.textContent).toBe(
      "1 day Ola could not measure (—) is not in the totals.",
    );
    getFieldezKmDay.mockResolvedValueOnce(
      fieldezDay({ status: "failed", km: null, path: [], error: "NOT_FOUND", final: true }),
    );
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Ola could not measure this day (NOT_FOUND).");
  });
});

describe("FieldezKmSection: Google's map", () => {
  it("is Google's own map, embedded with no key, and named for the day it shows", async () => {
    await mount();
    const frame = container.querySelector<HTMLIFrameElement>('[data-testid="fieldez-km-google-map"]')!;
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.title).toBe("Google map");
    expect(mapSrc()).not.toContain("key=");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer-when-downgrade");

    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="fieldez-km-google-map"]')!.title).toBe(
      `Google map: Arun · Fri ${longDate("2026-09-25")} · 12.74 km · 5 stops`,
    );
  });

  it("a day of more than ten places: Google takes the first nine and the last, and the note says so", async () => {
    const many: RouteKmPoint[] = Array.from({ length: 12 }, (_, i) => ({
      kind: i === 0 ? "login" : i === 11 ? "logout" : "checkin",
      at: at(9 + Math.floor(i / 2), (i % 2) * 30),
      latitude: 12 + i / 100,
      longitude: 77 + i / 100,
      case_number: null,
    }));
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ points: many }));
    await mount();
    await click(dayButton("Arun", "2026-09-25")!);
    const src = mapSrc()!;
    const daddr = new URL(src).searchParams.get("daddr")!.split(" to:");
    expect(new URL(src).searchParams.get("saddr")).toBe("12,77");
    expect(daddr).toHaveLength(9);
    expect(daddr[daddr.length - 1]).toBe("12.11,77.11");
    expect(mapNote()).toBe(
      "Google's own route, by car, through the first 9 places and the last, with its own km: Google's embedded map has" +
        " no bike route, so the Google Maps button opens it by bike. The km in the table is Ola's.",
    );
  });

  it("nothing is drawn over Google's map: the notes sit under it", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ status: "failed", km: null, path: [], error: "NOT_FOUND" }));
    await click(dayButton("Arun", "2026-09-25")!);
    const box = container.querySelector('[data-testid="fieldez-km-box"]')!;
    expect(box.children).toHaveLength(1);
    expect(box.firstElementChild?.getAttribute("data-testid")).toBe("fieldez-km-google-map");
    const note = container.querySelector('[data-testid="fieldez-km-note"]')!;
    expect(box.contains(note)).toBe(false);
    expect(note.getAttribute("role")).toBe("status");
  });
});

describe("FieldezKmSection: Google's map, from the review", () => {
  const frame = () => container.querySelector<HTMLIFrameElement>('[data-testid="fieldez-km-google-map"]')!;

  it("each map is a fresh frame, so the browser's Back leaves the page instead of moving the map", async () => {
    await mount();
    const region = frame();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    const day = frame();
    expect(day).not.toBe(region);
    expect(day.getAttribute("src")).toBe(DAY_ON_GOOGLE);
    // The day already shown keeps its frame; there is only ever one.
    await click(dayButton("Arun", "2026-09-25")!);
    expect(frame()).toBe(day);
    expect(container.querySelectorAll('[data-testid="fieldez-km-google-map"]')).toHaveLength(1);
  });

  it("a day whose Login or Logout stands at the office says so under the map", async () => {
    const atOffice = DAY_POINTS.map((point) => (point.kind === "checkin" ? point : { ...point, office: true }));
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ points: atOffice }));
    await mount();
    await click(dayButton("Arun", "2026-09-25")!);
    expect(container.querySelector('[data-testid="fieldez-km-map-office"]')?.textContent).toBe(
      "• A Login or Logout with no GPS was placed at the FSE's office: this route starts or ends there, not at a GPS fix.",
    );
  });
});

describe("FieldezKmSection: waiting for FieldEZ", () => {
  it("days waiting only for the FieldEZ tool are asked about every 5 minutes, not every 15 s, until none wait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm
      .mockResolvedValueOnce(WAITED)
      .mockResolvedValueOnce(WAITED)
      .mockResolvedValueOnce(range({ engineers: DONE.engineers, pending: 0, measured_now: 0, waiting: 0 }));
    await mount();
    expect(status()).toBe("Waiting for FieldEZ… 2 FSE-days: the FieldEZ tool has not read their work orders yet.");

    // Not at Ola's 15 s: the tool reads work orders every half hour.
    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    await wait(5 * 60_000 - 15_001);
    expect(getFieldezKm).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
    await wait(5 * 60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);
    expect(status()).toBeNull();
    expect(cells(rows()[1]!)).toEqual(["2", "Bala", "Salem", "—", "-", "5.2", "1", "5.2"]);

    await wait(60 * 60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(3);
  });

  it("days left for Ola keep the 15 s pace even while others wait for FieldEZ", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm.mockResolvedValueOnce(range({ waiting: 1 })).mockResolvedValueOnce(range({ waiting: 1 }));
    await mount();
    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
  });

  it("the map follows a picked day that turns waiting for FieldEZ, and back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const turned = range({
      engineers: [{ engineer_id: 7, days: { "2026-09-25": WAITING } }],
      pending: 0,
      rechecking: 1,
      waiting: 1,
    });
    const back = range({
      engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(12.74, 5) } }],
      pending: 0,
      rechecking: 1,
      waiting: 0,
    });
    getFieldezKm
      .mockResolvedValueOnce(range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(12.74, 5) } }], pending: 0, rechecking: 1 }))
      .mockResolvedValueOnce(turned)
      .mockResolvedValueOnce(back);
    getFieldezKmDay
      .mockResolvedValueOnce(fieldezDay())
      .mockResolvedValueOnce(fieldezDay({ status: "waiting", km: null, path: [], waiting: 1 }))
      .mockResolvedValueOnce(fieldezDay());
    await mount();
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBeNull();

    // A new check-in today whose WO is not read yet: the cell waits, and so does the map.
    await wait(15_000);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(routeNote()).toBe("Waiting for FieldEZ: the FieldEZ tool has not read 1 of this day's work orders yet.");

    // Read: the cell is measured again, and the map shows its route.
    await wait(15_000);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(3);
    expect(routeNote()).toBeNull();
  });

  it("says how many FSE-days wait for FieldEZ beside what Ola has left, one day in the singular", async () => {
    getFieldezKm.mockResolvedValue(range({ waiting: 1 }));
    await mount();
    expect(status()).toBe(
      "Measuring… 2 FSE-days left. Ola allows a few a minute, so this fills in by itself." +
        " Waiting for FieldEZ… 1 FSE-day: the FieldEZ tool has not read their work orders yet.",
    );
    // Not announced: it changes on every poll of a fill.
    expect(container.querySelector('[data-testid="fieldez-km-status"]')?.getAttribute("role")).toBeNull();
  });

  it("a day waiting for FieldEZ reads …, says so to a reader that cannot see it, takes no click and adds nothing", async () => {
    getFieldezKm.mockResolvedValue(WAITED);
    await mount();
    const cell = dayCell("Bala", "2026-09-27");
    expect(figure(cell)).toBe("…");
    expect(cell.getAttribute("aria-label")).toBe("waiting for FieldEZ");
    expect(cell.style.color).toBe("rgb(156, 163, 175)");
    expect(cell.querySelector("button")).toBeNull();
    await click(cell);
    expect(getFieldezKmDay).not.toHaveBeenCalled();
    // Measured days only, as while Ola has days left.
    expect(cells(rows()[1]!)).toEqual(["2", "Bala", "Salem", "—", "-", "…", "0", "0"]);
    expect(cells(rows()[2]!)).toEqual(["3", "Chitra", "Hosur", "3.5", "40.25", "…", "2", "43.75"]);
    expect(footer()).toEqual(["Total", "16.24", "40.25", "8.1", "", "64.59"]);
  });

  it("a day Ola has not got to is still said as one", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [{ engineer_id: 8, days: { "2026-09-26": WAITING, "2026-09-27": PENDING } }],
        waiting: 1,
      }),
    );
    await mount();
    expect(dayCell("Bala", "2026-09-26").getAttribute("aria-label")).toBe("waiting for FieldEZ");
    expect(dayCell("Bala", "2026-09-27").getAttribute("aria-label")).toBe("not measured yet");
  });

  it("a picked day now waiting for FieldEZ says so, keeps its figure in the table, and is asked for again on a click", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ status: "waiting", km: null, path: [], waiting: 2 }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(routeNote()).toBe("Waiting for FieldEZ: the FieldEZ tool has not read 2 of this day's work orders yet.");
    // Not a failure.
    expect(container.querySelector<HTMLElement>('[data-testid="fieldez-km-note"]')!.style.color).toBe(
      "rgb(55, 65, 81)",
    );
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
    // The places read so far are still worth seeing.
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);

    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(routeNote()).toBeNull();
  });
});

describe("FieldezKmSection: check-ins with no FieldEZ place", () => {
  /** Arun's 25th measured with two of its check-ins left out, his 27th with none. */
  const LEFT_OUT = range({
    engineers: [
      { engineer_id: 7, days: { "2026-09-25": ready(12.74, 4, 2), "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) } },
    ],
  });

  const FOUR_LEFT_OUT: FieldezKmMissing[] = [
    { case_number: "OC-004551", wo: "WO-036165368", reason: "no_problem_resolution" },
    { case_number: "OC-004560", wo: null, reason: "no_wo" },
    { case_number: "OC-004561", wo: "WO-035260625-1", reason: "not_in_fieldez" },
    { case_number: "OC-004562", wo: "WO-036000001", reason: "fieldez_failed" },
  ];

  it("a measured day with check-ins left out carries a small grey * that is not copied with the figure", async () => {
    getFieldezKm.mockResolvedValue(LEFT_OUT);
    await mount();
    const button = dayButton("Arun", "2026-09-25")!;
    expect(figure(button)).toBe("12.74*");
    const mark = button.querySelector<HTMLElement>('span:not([data-testid="km-label"])')!;
    expect(mark.textContent).toBe("*");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.style.userSelect).toBe("none");
    expect(mark.style.color).toBe("rgb(156, 163, 175)");
    expect(mark.title).toBe("2 check-ins had no FieldEZ Problem Resolution location");
    // Said to a reader that cannot see the mark, and on the cell's own title.
    expect(button.getAttribute("aria-label")).toBe(
      `12.74 road km (2 check-ins had no FieldEZ Problem Resolution location): show Arun's route on ${longDate("2026-09-25")}`,
    );
    expect(dayCell("Arun", "2026-09-25").title).toBe(
      `Arun · ${longDate("2026-09-25")} · 2 check-ins had no FieldEZ Problem Resolution location`,
    );
    // The totals add the figure itself.
    expect(cells(rows()[0]!).at(-1)).toBe("20.84");
    // The 27th left nothing out.
    expect(figure(dayButton("Arun", "2026-09-27"))).toBe("8.1");
  });

  it("one check-in left out is said in the singular", async () => {
    getFieldezKm.mockResolvedValue(
      range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(12.74, 4, 1) } }] }),
    );
    await mount();
    expect(dayButton("Arun", "2026-09-25")!.querySelector<HTMLElement>("span[title]")!.title).toBe(
      "1 check-in had no FieldEZ Problem Resolution location",
    );
  });

  it("the note under the table says what the * means", async () => {
    getFieldezKm.mockResolvedValue(LEFT_OUT);
    await mount();
    expect(missingNote()).toBe(
      "* A check-in with no FieldEZ Problem Resolution location is left out of that day's km, never put at the" +
        " app's check-in place instead. Click a km to see which.",
    );
  });

  it("no * and no note when nothing was left out", async () => {
    await mount();
    expect(missingNote()).toBeNull();
    expect(container.textContent).not.toContain("*");
  });

  it("a dash or a day Ola could not route that left check-ins out says so too, and opens its list", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [
          {
            engineer_id: 7,
            days: {
              "2026-09-25": ready(12.74, 5),
              "2026-09-26": { ...NO_POINTS, missing: 2 },
              "2026-09-27": { ...FAILED, missing: 1 },
            },
          },
        ],
      }),
    );
    await mount();
    expect(cells(rows()[0]!).slice(3, 6)).toEqual(["12.74", "-*", "—*"]);
    expect(missingNote()).not.toBeNull();
    expect(dayCell("Arun", "2026-09-26").title).toContain("2 check-ins had no FieldEZ Problem Resolution location");

    // The dash opens the day: why it has no route, and which check-ins were left out.
    getFieldezKmDay.mockResolvedValueOnce(
      fieldezDay({
        date: "2026-09-26",
        status: "no_points",
        km: null,
        path: [],
        points: DAY_POINTS.slice(0, 1),
        missing: [
          { case_number: "OC-004551", wo: "WO-036165368", reason: "no_problem_resolution" },
          { case_number: "OC-004552", wo: "WO-036165369", reason: "not_read" },
        ],
      }),
    );
    await click(dayCell("Arun", "2026-09-26"));
    expect(getFieldezKmDay).toHaveBeenCalledWith("t", 7, "2026-09-26");
    expect(routeNote()).toBe("No route: fewer than two places this day.");
    expect(missingBox()?.textContent).toContain("WO-036165369");
    expect(missingBox()?.textContent).toContain("not read from FieldEZ in time (over 31 days old)");
  });

  it("a 0 km day that left check-ins out is a dash with the mark", async () => {
    getFieldezKm.mockResolvedValue(
      range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(0, 2, 1) } }] }),
    );
    await mount();
    expect(figure(dayCell("Arun", "2026-09-25"))).toBe("-*");
    expect(missingNote()).not.toBeNull();
  });

  it("with an office stand-in too, both marks follow the figure", async () => {
    getFieldezKm.mockResolvedValue(
      range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": { ...ready(12.74, 4, 2), office: true } } }] }),
    );
    await mount();
    expect(figure(dayButton("Arun", "2026-09-25"))).toBe("12.74•*");
  });

  it("a picked day lists under the map the check-ins it left out: case number, WO and why, in words", async () => {
    getFieldezKm.mockResolvedValue(range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(12.74, 5, 4) } }] }));
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ missing: FOUR_LEFT_OUT }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(missingBox()?.textContent).toMatch(/^4 check-ins left out of this route:/);
    expect(missingItems()).toEqual([
      "OC-004551 · WO-036165368 · no Problem Resolution location in FieldEZ",
      "OC-004560 · — · the case has no WO",
      "OC-004561 · WO-035260625-1 · WO not found in FieldEZ",
      "OC-004562 · WO-036000001 · FieldEZ could not be read for this WO",
    ]);
    // Under the map, not over it.
    expect(container.querySelector('[data-testid="fieldez-km-box"]')!.contains(missingBox())).toBe(false);
    // The day's own answer agreed with its cell: asked once.
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
  });

  it("one check-in left out is listed in the singular", async () => {
    getFieldezKm.mockResolvedValue(range({ engineers: [{ engineer_id: 7, days: { "2026-09-25": ready(12.74, 5, 1) } }] }));
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ missing: FOUR_LEFT_OUT.slice(0, 1) }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(missingBox()?.textContent).toMatch(/^1 check-in left out of this route:/);
    expect(missingItems()).toHaveLength(1);
  });

  it("a day with nothing left out lists nothing under the map", async () => {
    await mount();
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!);
    expect(missingBox()).toBeNull();
  });

  it("a picked day's own answer puts its count of check-ins left out in the table", async () => {
    await mount();
    expect(figure(dayButton("Arun", "2026-09-25"))).toBe("12.74");
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay({ missing: FOUR_LEFT_OUT.slice(0, 2) }));
    await click(dayButton("Arun", "2026-09-25")!);
    expect(figure(dayButton("Arun", "2026-09-25"))).toBe("12.74*");
    expect(dayButton("Arun", "2026-09-25")!.querySelector<HTMLElement>("span[title]")!.title).toBe(
      "2 check-ins had no FieldEZ Problem Resolution location",
    );
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
  });

  it("a later answer that left out another check-in on the picked day brings the map the new list", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm
      .mockResolvedValueOnce(range({ engineers: DONE.engineers, pending: 0, rechecking: 1, measured_now: 0 }))
      .mockResolvedValueOnce(
        range({
          engineers: DONE.engineers.map((row) =>
            row.engineer_id === 7 ? { ...row, days: { ...row.days, "2026-09-25": ready(12.74, 5, 1) } } : row,
          ),
          pending: 0,
          rechecking: 0,
        }),
      );
    getFieldezKmDay
      .mockResolvedValueOnce(fieldezDay())
      .mockResolvedValueOnce(fieldezDay({ missing: [{ case_number: "OC-004570", wo: "WO-036165999", reason: "not_in_fieldez" }] }));
    await mount();
    await click(dayButton("Arun", "2026-09-25")!);
    expect(missingBox()).toBeNull();

    await wait(15_000);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(2);
    expect(missingItems()).toEqual(["OC-004570 · WO-036165999 · WO not found in FieldEZ"]);
    expect(figure(dayButton("Arun", "2026-09-25"))).toBe("12.74*");
  });

  it("a reason this page does not know yet is shown as Payroll sent it", async () => {
    await mount();
    // A reason Payroll might add later, so not one the type allows.
    const later = "something_new" as unknown as FieldezKmMissing["reason"];
    getFieldezKmDay.mockResolvedValueOnce(
      fieldezDay({ missing: [{ case_number: "OC-004580", wo: "WO-036100000", reason: later }] }),
    );
    await click(dayButton("Arun", "2026-09-25")!);
    expect(missingItems()).toEqual(["OC-004580 · WO-036100000 · something_new"]);
  });
});

/**
 * The cases under each day's km, as the panel hands them over: the same line
 * and Cases column as the RTPL table's -- and, without them, the table as it was.
 */

const NONE: CasesByDayCell = { cases: 0, closed: 0 };

/**
 * Arun: 4 cases on the 25th, 1 closed; 2 on his dash of a 26th; none on the
 * 27th. Bala: 1 on the day Ola could not route, 3 on the one not measured yet,
 * 2 closed. Chitra: none from Payroll. Dev, off the screen: 5.
 */
const CASES: CasesById = new Map([
  [7, { "2026-09-25": { cases: 4, closed: 1 }, "2026-09-26": { cases: 2, closed: 0 }, "2026-09-27": NONE }],
  [8, { "2026-09-25": { cases: 1, closed: 0 }, "2026-09-26": NONE, "2026-09-27": { cases: 3, closed: 2 } }],
  [10, { "2026-09-25": { cases: 5, closed: 5 }, "2026-09-26": NONE, "2026-09-27": NONE }],
]);

/** The line under a day's km, as it reads; null when there is none. */
/** A day's assign/closed lines as "assign N · closed M", or null when it has none. */
const caseLine = (cell: Element) => {
  const lines = cell.querySelector('[data-testid="km-cases"]');
  if (!lines) return null;
  const read = (id: string) => lines.querySelector(`[data-testid="${id}"]`)?.textContent;
  return `${read("km-assign")} · ${read("km-closed")}`;
};
const headings = () =>
  Array.from(container.querySelectorAll('[data-testid="fieldez-km-grid"] thead th')).map((th) => th.textContent?.trim());

describe("FieldezKmSection: the cases under each km", () => {
  it("without them the table is as it was: no Cases column and no case lines", async () => {
    await mount();
    expect(headings().at(-1)).toBe("Total km");
    expect(container.querySelector('[data-testid="km-cases"]')).toBeNull();
    expect(container.querySelector('[data-testid="fieldez-km-cases-total"]')).toBeNull();
    expect(cells(rows()[0]!)).toEqual(["1", "Arun", "Chennai", "12.74", "-", "8.1", "2", "20.84"]);
    expect(footer()).toEqual(["Total", "16.24", "40.25", "8.1", "", "64.59"]);
  });

  it("puts each day's cases under its km, says them on the cell, and adds them up after Total km", async () => {
    await mount({ cases: CASES });
    expect(headings().slice(-3)).toEqual(["Days", "Total km", "Cases"]);

    // Arun's 25th: the km as it was, its cases under it and in its words.
    const km = dayButton("Arun", "2026-09-25")!;
    expect(figure(km)).toBe("12.74");
    expect(caseLine(km)).toBe("assign 4 · closed 1");
    expect(km.getAttribute("aria-label")).toBe(
      `12.74 road km, assign 4, closed 1: show Arun's route on ${longDate("2026-09-25")}`,
    );
    expect(dayCell("Arun", "2026-09-25").title).toBe(`Arun · ${longDate("2026-09-25")} · assign 4, closed 1`);

    // A dash, a day Ola could not route and one not measured yet have theirs too.
    expect(caseLine(dayCell("Arun", "2026-09-26"))).toBe("assign 2 · closed 0");
    expect(dayCell("Arun", "2026-09-26").title).toBe(`Arun · ${longDate("2026-09-26")} · assign 2, closed 0`);
    const failed = dayCell("Bala", "2026-09-25");
    expect(figure(failed)).toBe("—");
    expect(caseLine(failed)).toBe("assign 1 · closed 0");
    expect(failed.getAttribute("aria-label")).toBe("could not be measured, assign 1, closed 0");
    expect(failed.title).toBe("Ola could not measure this day; it is tried again later · assign 1, closed 0");
    expect(failed.style.color).toBe("rgb(185, 28, 28)");
    const waiting = dayCell("Bala", "2026-09-27");
    expect(caseLine(waiting)).toBe("assign 3 · closed 2");
    expect(waiting.getAttribute("aria-label")).toBe("not measured yet, assign 3, closed 2");

    // A day with none has no line, and its words are as they were.
    expect(caseLine(dayCell("Arun", "2026-09-27"))).toBeNull();
    expect(dayButton("Arun", "2026-09-27")!.getAttribute("aria-label")).toBe(
      `8.1 road km: show Arun's route on ${longDate("2026-09-27")}`,
    );
    expect(caseLine(dayCell("Bala", "2026-09-26"))).toBeNull();

    // The km and their totals as they were; each FSE's cases over the days on
    // screen. Chitra has none from Payroll: blank, not 0. Dev is off the screen.
    expect(cells(rows()[0]!).slice(-3)).toEqual(["2", "20.84", "assign 6 · closed 1"]);
    expect(cells(rows()[1]!).slice(-3)).toEqual(["0", "0", "assign 4 · closed 2"]);
    expect(cells(rows()[2]!).slice(-3)).toEqual(["2", "43.75", ""]);
    expect(footer().slice(-2)).toEqual(["64.59", "assign 10 · closed 3"]);
  });

  it("a day waiting for FieldEZ, or with check-ins left out, says its cases beside what it said before", async () => {
    getFieldezKm.mockResolvedValue(
      range({
        engineers: [
          { engineer_id: 7, days: { "2026-09-25": ready(12.74, 4, 2), "2026-09-26": NO_POINTS, "2026-09-27": ready(8.1) } },
          { engineer_id: 8, days: { "2026-09-25": FAILED, "2026-09-26": ready(0, 2), "2026-09-27": WAITING } },
        ],
        waiting: 1,
      }),
    );
    await mount({ cases: CASES });
    const km = dayButton("Arun", "2026-09-25")!;
    expect(figure(km)).toBe("12.74*");
    expect(caseLine(km)).toBe("assign 4 · closed 1");
    expect(km.querySelector<HTMLElement>('span:not([data-testid="km-label"])')!.textContent).toBe("*");
    expect(km.getAttribute("aria-label")).toBe(
      `12.74 road km (2 check-ins had no FieldEZ Problem Resolution location), assign 4, closed 1: show Arun's route on ${longDate("2026-09-25")}`,
    );
    expect(dayCell("Arun", "2026-09-25").title).toBe(
      `Arun · ${longDate("2026-09-25")} · 2 check-ins had no FieldEZ Problem Resolution location · assign 4, closed 1`,
    );
    const forFieldez = dayCell("Bala", "2026-09-27");
    expect(figure(forFieldez)).toBe("…");
    expect(caseLine(forFieldez)).toBe("assign 3 · closed 2");
    expect(forFieldez.getAttribute("aria-label")).toBe("waiting for FieldEZ, assign 3, closed 2");
    expect(forFieldez.querySelector("button")).toBeNull();
  });

  it("an FSE with no cases on any day reads 0 in the Cases column, and has no lines", async () => {
    await mount({ cases: new Map([[9, { "2026-09-25": NONE, "2026-09-26": NONE, "2026-09-27": NONE }]]) });
    expect(container.querySelector('[data-testid="km-cases"]')).toBeNull();
    expect(cells(rows()[2]!).at(-1)).toBe("assign 0 · closed 0");
    expect(cells(rows()[0]!).at(-1)).toBe("");
    expect(footer().at(-1)).toBe("assign 0 · closed 0");
  });

  it("one engineer under two register names is counted once in the footer", async () => {
    await mount({ cases: CASES, shown: [ARUN, fse("Arun K", "Chennai", 7)] });
    expect(cells(rows()[0]!).at(-1)).toBe("assign 6 · closed 1");
    expect(cells(rows()[1]!).at(-1)).toBe("assign 6 · closed 1");
    expect(footer().at(-1)).toBe("assign 6 · closed 1");
  });

  it("a km with its cases under it opens its day as before, also clicked on the line, and reads picked", async () => {
    await mount({ cases: CASES });
    getFieldezKmDay.mockResolvedValueOnce(fieldezDay());
    await click(dayButton("Arun", "2026-09-25")!.querySelector<HTMLElement>('[data-testid="km-cases"]')!);
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
    expect(getFieldezKmDay).toHaveBeenCalledWith("t", 7, "2026-09-25");
    expect(routeLabel()).toBe(`Arun · Fri ${longDate("2026-09-25")} · 12.74 km · 5 stops`);
    expect(mapSrc()).toBe(DAY_ON_GOOGLE);

    const picked = dayButton("Arun", "2026-09-25")!;
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.style.background).toBe("rgb(29, 78, 216)");
    expect(picked.style.color).toBe("rgb(255, 255, 255)");
    expect(picked.querySelector<HTMLElement>('[data-testid="km-assign"]')!.style.color).toBe(
      "rgba(255, 255, 255, 0.85)",
    );
    // A dash with cases still takes no click.
    await click(dayCell("Arun", "2026-09-26"));
    expect(getFieldezKmDay).toHaveBeenCalledTimes(1);
  });

  it("the counts stay through the table's own asking again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getFieldezKm.mockResolvedValueOnce(range()).mockResolvedValueOnce(DONE);
    await mount({ cases: CASES });
    await wait(15_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
    expect(figure(dayButton("Bala", "2026-09-27"))).toBe("5.2");
    expect(caseLine(dayCell("Bala", "2026-09-27"))).toBe("assign 3 · closed 2");
    expect(cells(rows()[1]!).slice(-3)).toEqual(["1", "5.2", "assign 4 · closed 2"]);
    await wait(60_000);
    expect(getFieldezKm).toHaveBeenCalledTimes(2);
  });
});
