// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineerDayEvent, RosterEngineer } from "../../../lib/payrollTrackingApiClient";

/**
 * An engineer's day rail, for what the phone itself reports (17 Oct 2026): GPS
 * and the network going off and on, and the phone stopping the app. Payroll
 * sends each as an entry of its own type, and the board gives each its letter,
 * its colour and the line saying what it meant for the kilometres -- as it now
 * also says for the older kinds of dark stretch.
 *
 * Rendered through the panel, opened on one engineer, because that is the only
 * place the rail is ever seen.
 */

// next/dynamic pulls in Leaflet, which wants a real map canvas. Not the subject.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

vi.mock("../../../lib/session", () => ({
  clearSession: vi.fn(),
}));

const getRoster = vi.fn();
const getEngineerDay = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getRoster: (...args: unknown[]) => getRoster(...args),
  getEngineerDay: (...args: unknown[]) => getEngineerDay(...args),
}));

const PRAVEEN: RosterEngineer = {
  engineer_id: 7,
  engineer_name: "Praveen S",
  branch: "Chennai",
  payroll_name: null,
  matched: true,
  state: "on_duty",
  on_duty: true,
  duty_started_at: "2026-10-17T03:30:00Z",
  duty_ended_at: null,
  duty_minutes: 240,
  auto_closed: false,
  distance_km: 12.4,
  stale: false,
  last_seen_minutes: 0,
  latitude: null,
  longitude: null,
  accuracy: null,
  status: "",
  timestamp: null,
  active_case_id: null,
  active_case_number: null,
};

let container: HTMLDivElement;
let root: Root;

// The panel is a large module, and loading it the first time took over five
// seconds on a busy machine. Paid once here, it is not charged to whichever
// test happens to run first.
beforeAll(async () => {
  await import("./LiveTrackingPanel");
}, 60_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getRoster.mockResolvedValue({ configured: true, engineers: [PRAVEEN] });
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

/** An entry as Payroll sends it, with no place and no case, so it is only itself. */
function entry(type: string, label: string, extra: Partial<EngineerDayEvent> = {}): EngineerDayEvent {
  return { at: "2026-10-17T05:00:00Z", type, label, ...extra };
}

/** The board opened on Praveen's day, holding these entries. */
async function openDay(events: EngineerDayEvent[]) {
  getEngineerDay.mockResolvedValue({
    engineer_id: 7,
    engineer_name: "Praveen S",
    branch: "Chennai",
    date: "2026-10-17",
    total_km: 12.4,
    duty_minutes: 240,
    first_seen: null,
    last_seen: null,
    stop_count: 0,
    stops: [],
    events,
    points: [],
  });
  const { default: LiveTrackingPanel } = await import("./LiveTrackingPanel");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(LiveTrackingPanel, { token: "t", initialEngineerId: 7 }));
  });
  // Let the roster and the day both land.
  await act(async () => {});
  await act(async () => {});
}

/** Each rail entry the way the office reads it: letter, title, its colour, and the line under it. */
function rail() {
  return Array.from(container.querySelectorAll("ol > li")).map((li) => {
    const [, badge, body] = Array.from(li.children) as HTMLElement[];
    const [title, meaning] = Array.from(body?.children ?? []) as HTMLElement[];
    return {
      letter: badge?.firstElementChild?.textContent ?? "",
      title: title?.textContent ?? "",
      color: title?.style.color ?? "",
      meaning: meaning?.textContent ?? null,
    };
  });
}

/** A colour the way jsdom hands it back from a style, so a hex can be compared. */
function css(hex: string) {
  const probe = document.createElement("span");
  probe.style.color = hex;
  return probe.style.color;
}

/** Each entry's badge colour and the colour of the line under its title, which both follow the title's. */
function railColors() {
  return Array.from(container.querySelectorAll("ol > li")).map((li) => {
    const [, badge, body] = Array.from(li.children) as HTMLElement[];
    const meaning = body?.children[1] as HTMLElement | undefined;
    return [(badge?.firstElementChild as HTMLElement | null)?.style.color ?? "", meaning?.style.color ?? ""];
  });
}

/** The time column of each entry. */
function railTimes() {
  return Array.from(container.querySelectorAll("ol > li")).map((li) => li.children[0]?.textContent ?? "");
}

describe("the rail: what the phone itself reported", () => {
  it("names each report, letters it, and colours it by what it cost", async () => {
    await openDay([
      entry("gps_off", "GPS off", { counted: false }),
      entry("gps_on", "GPS on", { minutes: 25 }),
      entry("net_off", "Net off"),
      entry("net_on", "Net on"),
      entry("tracker_stopped", "Phone stopped the app · 1h 5m", { minutes: 65 }),
      entry("tracker_started", "App tracking again"),
    ]);
    expect(rail()).toEqual([
      {
        letter: "G",
        title: "GPS off",
        color: css("#be123c"),
        meaning: "Location switched off on the phone — this stretch is not counted",
      },
      { letter: "G", title: "GPS on", color: css("#16a34a"), meaning: null },
      {
        letter: "N",
        title: "Net off",
        color: css("#475569"),
        meaning: "No internet — positions kept on the phone, km not lost",
      },
      { letter: "N", title: "Net on", color: css("#16a34a"), meaning: null },
      {
        letter: "A",
        title: "Phone stopped the app · 1h 5m",
        color: css("#b45309"),
        meaning: "The phone closed the app — counted as a straight line",
      },
      { letter: "A", title: "App tracking again", color: css("#16a34a"), meaning: null },
    ]);
  });

  it("does not call GPS found off at the start a stretch left out", async () => {
    await openDay([entry("gps_off", "GPS off", { found: true }), entry("gps_on", "GPS on", { found: true })]);
    expect(rail().map((e) => e.meaning)).toEqual(["Location was found off on the phone", null]);
  });

  // The km rule counts a switch-off it heard about too late, or one the phone
  // stopping the app came before, so only Payroll can say which this was.
  it("says whether a GPS-off stretch was counted only when Payroll says which", async () => {
    await openDay([
      entry("gps_off", "GPS off", { counted: false }),
      entry("gps_off", "GPS off", { counted: true }),
      // Without the field, nothing is claimed either way.
      entry("gps_off", "GPS off"),
      entry("gps_off", "GPS off", { found: true, counted: true }),
    ]);
    expect(rail().map((e) => e.meaning)).toEqual([
      "Location switched off on the phone — this stretch is not counted",
      "Location switched off on the phone — counted as a straight line",
      "Location switched off on the phone",
      "Location was found off on the phone — counted as a straight line",
    ]);
  });

  it("gives each entry's time in 12-hour form, on the office's clock", async () => {
    await openDay([
      entry("gps_off", "GPS off", { at: "2026-10-17T15:10:00Z" }),
      entry("gps_on", "GPS on", { at: "2026-10-17T05:00:00Z" }),
    ]);
    expect(railTimes()).toEqual(["8:40 PM", "10:30 AM"]);
  });
});

describe("the rail: what the kilometres do with the older kinds of dark", () => {
  // Before Payroll's km rule of 17 Oct 2026, a flagged fix the accuracy filter
  // dropped inside the stretch took it out of the kilometres, and those days
  // are still read. Only Payroll can say which it was.
  it("says whether a stretch the app sent nothing for was counted only when Payroll says which", async () => {
    await openDay([
      entry("untracked", "No positions · 2h", { minutes: 120, moved_km: 3.2, counted: true }),
      entry("untracked", "No positions · 1h 1m", { minutes: 61, moved_km: 12, counted: false }),
      // From a Payroll that has not been redeployed: no `counted`, and the old words.
      entry("untracked", "Not tracked · 40 min", { minutes: 40, moved_km: 1.5 }),
      entry("untracked", "Not tracked · 40 min", { minutes: 40 }),
    ]);
    expect(rail().map((e) => [e.letter, e.title, e.meaning])).toEqual([
      ["?", "No positions · 2h", "The app sent nothing while they moved 3.2 km — counted as a straight line"],
      ["?", "No positions · 1h 1m", "The app sent nothing while they moved 12 km — this stretch is not counted"],
      ["?", "Not tracked · 40 min", "The app sent nothing while they moved 1.5 km"],
      ["?", "Not tracked · 40 min", "The app sent nothing while they were moving"],
    ]);
  });

  // Counted, it is the app having stopped -- the phone's own word for that is
  // tracker_stopped -- and not the red G of a stretch the kilometres left out.
  it("marks a counted Tracking stopped like the phone stopping the app", async () => {
    await openDay([
      entry("location_off", "Tracking stopped · 1h", { minutes: 60, counted: true }),
      entry("location_off", "Tracking stopped · 1h", { minutes: 60, counted: false }),
      entry("location_off", "Location off · 4h 30m", { minutes: 270 }),
    ]);
    expect(rail().map((e) => [e.letter, e.color])).toEqual([
      ["A", css("#b45309")],
      ["G", css("#be123c")],
      ["G", css("#be123c")],
    ]);
    expect(railColors()).toEqual([
      [css("#b45309"), css("#b45309")],
      [css("#be123c"), css("#be123c")],
      [css("#be123c"), css("#be123c")],
    ]);
  });

  it("says a location off Payroll now counts is counted, and keeps the old words for the rest", async () => {
    await openDay([
      entry("location_off", "Tracking stopped · 1h", { minutes: 60, counted: true }),
      entry("location_back", "Tracking back", { minutes: 60, counted: true }),
      // From a Payroll that has not been redeployed: no `counted` at all.
      entry("location_off", "Location off · 4h 30m", { minutes: 270 }),
      entry("location_back", "Location back on", { minutes: 270 }),
    ]);
    expect(rail().map((e) => [e.title, e.meaning])).toEqual([
      ["Tracking stopped · 1h", "Counted as a straight line"],
      ["Tracking back", "The phone is reporting again"],
      ["Location off · 4h 30m", "The phone stopped reporting - this stretch is not counted"],
      ["Location back on", "The phone is reporting again"],
    ]);
  });

  it("leaves No network as it was", async () => {
    await openDay([entry("no_network", "No network · 45 min"), entry("network_back", "Network back")]);
    expect(rail().map((e) => [e.letter, e.title, e.meaning])).toEqual([
      ["N", "No network · 45 min", "Kept on the phone - the kilometres are not lost"],
      ["N", "Network back", "The held positions arrived"],
    ]);
  });
});
