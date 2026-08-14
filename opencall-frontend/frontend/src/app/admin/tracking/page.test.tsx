// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterEngineer } from "../../../lib/payrollTrackingApiClient";

/**
 * The tracking board, rendered on the client the way an admin actually sees it.
 *
 * This exists because the defect it covers could not be caught any other way.
 * Every engineer Payroll cannot match has `engineer_id` null, and the table row
 * was keyed on it — so thirteen rows shared the key `null`. React could not tell
 * them apart, left their DOM rows behind when the list was filtered down, and
 * stacked another copy on every 30s refresh: the "On duty 1" tab showed twelve
 * unmatched engineers three times over. Pure-function tests pass either way;
 * only mounting and re-rendering shows it.
 */

// next/dynamic pulls in Leaflet, which wants a real map canvas. Not the subject.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

vi.mock("../../../lib/session", () => ({
  readSession: () => ({ token: "test-token", role: "admin", username: "admin" }),
  clearSession: vi.fn(),
}));

const getRoster = vi.fn();
const getEngineerDay = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getRoster: (...args: unknown[]) => getRoster(...args),
  getEngineerDay: (...args: unknown[]) => getEngineerDay(...args),
}));

function engineer(overrides: Partial<RosterEngineer> & { engineer_name: string }): RosterEngineer {
  const state = overrides.state ?? "absent";
  return {
    engineer_id: 1,
    branch: "Chennai",
    payroll_name: null,
    matched: state !== "unmatched",
    state,
    on_duty: state === "on_duty",
    duty_started_at: null,
    duty_ended_at: null,
    duty_minutes: 0,
    auto_closed: false,
    distance_km: 0,
    stale: false,
    last_seen_minutes: null,
    latitude: null,
    longitude: null,
    accuracy: null,
    status: "",
    timestamp: null,
    active_case_id: null,
    active_case_number: null,
    ...overrides,
  };
}

// The board from the user's screenshot: 26 rows, one engineer actually on duty,
// and thirteen the register knows that Payroll has no employee for.
const UNMATCHED_NAMES = [
  "Jeeva Salem",
  "kannan",
  "Lava Kumar",
  "lingeswaran",
  "Mohan",
  "Perumal",
  "Prasanth",
  "Santhosh",
  "SUNTECH",
  "Vijayakumar",
  "Vijayakumar Arakonam",
  "VijayaKumar Egmore",
  "Sivaraj",
];

const BOARD: RosterEngineer[] = [
  ...UNMATCHED_NAMES.map((engineer_name) =>
    engineer({ engineer_name, state: "unmatched", engineer_id: null }),
  ),
  ...Array.from({ length: 12 }, (_, i) =>
    engineer({ engineer_name: `Off Duty ${i + 1}`, state: "absent", engineer_id: 100 + i }),
  ),
  engineer({
    engineer_name: "Praveen",
    state: "on_duty",
    engineer_id: 91,
    stale: true,
    duty_minutes: 73,
  }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  getRoster.mockResolvedValue({ configured: true, engineers: BOARD });
  getEngineerDay.mockResolvedValue({
    engineer_id: 91,
    date: "2026-08-14",
    points: [],
    stops: [],
    events: [],
    distance_km: 0,
    duty_minutes: 73,
  });
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

async function mountBoard() {
  const { default: LiveTrackingPage } = await import("./page");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(LiveTrackingPage));
  });
  // Let the session effect and the roster fetch it triggers both settle.
  await act(async () => {});
  await act(async () => {});
}

function rows() {
  return Array.from(container.querySelectorAll("tbody tr"));
}

/** Names in the table, in the order they are actually painted. */
function rowNames() {
  return rows()
    .map((tr) => tr.querySelector("td")?.textContent ?? "")
    .filter((name) => name !== "");
}

function tab(label: RegExp) {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    label.test(b.textContent ?? ""),
  );
  if (!button) throw new Error(`no tab matching ${label}`);
  return button;
}

async function clickTab(label: RegExp) {
  await act(async () => {
    tab(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("the tracking board", () => {
  it("starts on All, showing every engineer once", async () => {
    await mountBoard();
    expect(tab(/^All /).textContent).toBe("All 26");
    expect(rowNames()).toHaveLength(26);
    expect(new Set(rowNames()).size).toBe(26);
  });

  it("counts the buckets the way the rows add up", async () => {
    await mountBoard();
    expect(tab(/^On duty /).textContent).toBe("On duty 1");
    expect(tab(/^Off duty /).textContent).toBe("Off duty 12");
    expect(tab(/^Not in Payroll /).textContent).toBe("Not in Payroll 13");
  });

  it("shows ONLY the engineer on duty under On duty", async () => {
    await mountBoard();
    await clickTab(/^On duty /);
    expect(rowNames()).toEqual(["Praveen"]);
  });

  it("does not stack stale rows when the admin switches tabs repeatedly", async () => {
    // Exactly what the user did: All → On duty, three times over. Each pass used
    // to leave the previous tab's unmatched rows in the DOM.
    await mountBoard();
    for (let pass = 0; pass < 3; pass += 1) {
      await clickTab(/^All /);
      expect(rowNames()).toHaveLength(26);
      await clickTab(/^On duty /);
      expect(rowNames()).toEqual(["Praveen"]);
    }
  });

  it("does not stack stale rows across the 30s refresh either", async () => {
    await mountBoard();
    await clickTab(/^On duty /);
    // Three more roster responses land while the On duty tab is open.
    for (let poll = 0; poll < 3; poll += 1) {
      await act(async () => {
        getRoster.mock.results[0]; // the poll re-renders with the same 26 rows
      });
      await clickTab(/^Not in Payroll /);
      await clickTab(/^On duty /);
    }
    expect(rowNames()).toEqual(["Praveen"]);
  });

  it("lists exactly the engineers Payroll cannot match, once each", async () => {
    await mountBoard();
    await clickTab(/^Not in Payroll /);
    expect(rowNames()).toEqual(UNMATCHED_NAMES);
  });

  it("keeps unmatched engineers out of Off duty", async () => {
    await mountBoard();
    await clickTab(/^Off duty /);
    const names = rowNames();
    expect(names).toHaveLength(12);
    for (const unmatched of UNMATCHED_NAMES) expect(names).not.toContain(unmatched);
  });

  it("shows no row as being checked while no engineer is selected", async () => {
    // engineer_id null === selectedId null used to make every unmatched row read
    // "Checking" and sit highlighted with nothing chosen at all.
    await mountBoard();
    const labels = rows().map((tr) => tr.querySelector("button")?.textContent);
    expect(labels.filter((l) => l === "Checking")).toHaveLength(0);
    expect(labels.filter((l) => l === "View day")).toHaveLength(26);
  });

  it("checks one engineer, and only that engineer, when their day is opened", async () => {
    await mountBoard();
    await clickTab(/^On duty /);
    await act(async () => {
      rows()[0]
        ?.querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    await clickTab(/^All /);
    const labels = rows().map((tr) => tr.querySelector("button")?.textContent);
    expect(labels.filter((l) => l === "Checking")).toHaveLength(1);
  });

  it("cannot open the day of an engineer Payroll has no record of", async () => {
    await mountBoard();
    await clickTab(/^Not in Payroll /);
    const button = rows()[0]?.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(getEngineerDay).not.toHaveBeenCalled();
  });
});
