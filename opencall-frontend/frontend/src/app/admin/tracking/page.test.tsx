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
  return Array.from(container.querySelectorAll('[data-testid="engineer-row"]'));
}

/** Names in the table, in the order they are actually painted. */
function rowNames() {
  return rows()
    .map((row) => row.querySelector('[data-testid="engineer-name"]')?.textContent ?? "")
    .filter((name) => name !== "");
}

// The count sits in its own chip beside the label, so a button's textContent is
// the two run together — "All26". The label alone is what identifies the tab.
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
    expect(tab(/^All/).textContent).toBe("All26");
    expect(rowNames()).toHaveLength(26);
    expect(new Set(rowNames()).size).toBe(26);
  });

  it("counts the buckets the way the rows add up", async () => {
    await mountBoard();
    expect(tab(/^On duty/).textContent).toBe("On duty1");
    expect(tab(/^Off duty/).textContent).toBe("Off duty12");
    expect(tab(/^Not in Payroll/).textContent).toBe("Not in Payroll13");
  });

  it("shows ONLY the engineer on duty under On duty", async () => {
    await mountBoard();
    await clickTab(/^On duty/);
    expect(rowNames()).toEqual(["Praveen"]);
  });

  it("does not stack stale rows when the admin switches tabs repeatedly", async () => {
    // Exactly what the user did: All → On duty, three times over. Each pass used
    // to leave the previous tab's unmatched rows in the DOM.
    await mountBoard();
    for (let pass = 0; pass < 3; pass += 1) {
      await clickTab(/^All/);
      expect(rowNames()).toHaveLength(26);
      await clickTab(/^On duty/);
      expect(rowNames()).toEqual(["Praveen"]);
    }
  });

  it("does not stack stale rows across the 30s refresh either", async () => {
    await mountBoard();
    await clickTab(/^On duty/);
    // Three more roster responses land while the On duty tab is open.
    for (let poll = 0; poll < 3; poll += 1) {
      await act(async () => {
        getRoster.mock.results[0]; // the poll re-renders with the same 26 rows
      });
      await clickTab(/^Not in Payroll/);
      await clickTab(/^On duty/);
    }
    expect(rowNames()).toEqual(["Praveen"]);
  });

  it("lists exactly the engineers Payroll cannot match, once each", async () => {
    await mountBoard();
    await clickTab(/^Not in Payroll/);
    expect(rowNames()).toEqual(UNMATCHED_NAMES);
  });

  it("keeps unmatched engineers out of Off duty", async () => {
    await mountBoard();
    await clickTab(/^Off duty/);
    const names = rowNames();
    expect(names).toHaveLength(12);
    for (const unmatched of UNMATCHED_NAMES) expect(names).not.toContain(unmatched);
  });

  it("shows no row as selected while no engineer is chosen", async () => {
    // engineer_id null === selectedId null used to make every unmatched row sit
    // highlighted with nothing chosen at all.
    await mountBoard();
    expect(rows()).toHaveLength(26);
    expect(rows().filter((row) => row.getAttribute("data-selected") === "true")).toHaveLength(0);
  });

  it("opens that engineer's day in place of the list", async () => {
    // Their day used to render below the map AND the list, so on any real screen
    // the answer appeared off the bottom of the page.
    await mountBoard();
    await clickTab(/^On duty/);
    expect(rowNames()).toEqual(["Praveen"]);

    await act(async () => {
      rows()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});

    // The list is gone, and the panel is now about that one engineer.
    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("Praveen");
    expect(getEngineerDay).toHaveBeenCalledWith("test-token", 91, expect.any(String));
  });

  it("comes back to everyone from an engineer's day", async () => {
    await mountBoard();
    await clickTab(/^On duty/);
    await act(async () => {
      rows()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    expect(rows()).toHaveLength(0);

    const back = Array.from(container.querySelectorAll("button")).find(
      (b) => b.title === "Back to all engineers",
    );
    expect(back).toBeTruthy();
    await act(async () => {
      back?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Back to the engineers, on the tab that was open.
    expect(rowNames()).toEqual(["Praveen"]);
    await clickTab(/^All/);
    expect(rowNames()).toHaveLength(26);
  });

  it("cannot open the day of an engineer Payroll has no record of", async () => {
    await mountBoard();
    await clickTab(/^Not in Payroll/);
    // They have no Payroll id, so there is no day to ask for — clicking must do
    // nothing rather than fetch someone else's.
    await act(async () => {
      rows()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(rows().filter((row) => row.getAttribute("data-selected") === "true")).toHaveLength(0);
    expect(getEngineerDay).not.toHaveBeenCalled();
  });
  // ---- what the phone itself is doing ----------------------------------
  //
  // Going dark looks the same whether the battery died or the signal did, and
  // the office does different things about each. The charge on the last fix is
  // the only thing that tells them apart, so the row has to carry it.

  async function boardWith(one: Partial<RosterEngineer>) {
    getRoster.mockResolvedValue({
      configured: true,
      engineers: [
        engineer({ engineer_name: "Praveen S", engineer_id: 7, state: "on_duty", ...one }),
      ],
    });
    await mountBoard();
    return rows()[0]!;
  }

  it("shows what charge the phone had", async () => {
    const row = await boardWith({ battery_level: 72 });
    expect(row.textContent).toContain("72%");
  });

  it("says nothing about charge when the app did not report any", async () => {
    const row = await boardWith({ battery_level: null });
    expect(row.textContent).not.toContain("%");
  });

  it("blames the battery when a phone went quiet on almost nothing", async () => {
    const row = await boardWith({
      battery_level: 4,
      stale: true,
      last_seen_minutes: 30,
    });
    expect(row.textContent).toContain("No signal");
    expect(row.innerHTML).toContain("gone flat");
  });

  it("blames the signal when a phone went quiet on a full battery", async () => {
    const row = await boardWith({
      battery_level: 80,
      stale: true,
      last_seen_minutes: 30,
    });
    expect(row.textContent).toContain("No signal");
    expect(row.innerHTML).toContain("signal, not charge");
    expect(row.innerHTML).not.toContain("gone flat");
  });

  it("says an engineer has caught up, and for how long they were dark", async () => {
    const row = await boardWith({ queued_minutes: 25, stale: false });
    expect(row.textContent).toContain("Caught up");
    expect(row.textContent).toContain("25m dark");
  });

  it("reads as plain On duty when nothing was queued", async () => {
    const row = await boardWith({ queued_minutes: 0, stale: false });
    expect(row.textContent).toContain("On duty");
    expect(row.textContent).not.toContain("Caught up");
  });

  it("does not claim a catch-up when Payroll never said", async () => {
    // A Payroll that has not been redeployed sends none of these fields, so the
    // property is ABSENT rather than set to undefined — which is also the only
    // way to say it under exactOptionalPropertyTypes.
    const row = await boardWith({ stale: false });
    expect(row.textContent).toContain("On duty");
    expect(row.textContent).not.toContain("Caught up");
  });
});

describe("Payroll's other staff, department by department (12 Oct 2026)", () => {
  const STAFFED: RosterEngineer[] = [
    engineer({ engineer_name: "Praveen", state: "on_duty", engineer_id: 91, department: "FSE" }),
    engineer({ engineer_name: "Lava Kumar", state: "unmatched", engineer_id: null }),
    engineer({
      engineer_name: "Swetha",
      state: "on_duty",
      engineer_id: 21,
      department: "Office",
      role: "CALL COORDINATOR",
      staff: true,
    }),
    engineer({ engineer_name: "chakree R", engineer_id: 22, department: "HR", staff: true }),
  ];

  function departmentSelect() {
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Department"]');
    if (!select) throw new Error("no department filter");
    return select;
  }

  async function pickDepartment(value: string) {
    await act(async () => {
      const select = departmentSelect();
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("asks for the other staff, and only this board does", async () => {
    await mountBoard();
    expect(getRoster).toHaveBeenCalledWith("test-token", expect.any(String), { includeStaff: true });
  });

  it("shows them beside the engineers, tagged as staff with their department", async () => {
    getRoster.mockResolvedValue({ configured: true, engineers: STAFFED });
    await mountBoard();
    expect(rowNames()).toEqual(["Praveen", "Lava Kumar", "Swetha", "chakree R"]);
    const tags = Array.from(container.querySelectorAll('[data-testid="staff-tag"]')).map((t) => t.textContent);
    expect(tags).toEqual(["Staff · Office", "Staff · HR"]);
  });

  it("starts on All Departments, the board as it was", async () => {
    getRoster.mockResolvedValue({ configured: true, engineers: STAFFED });
    await mountBoard();
    expect(departmentSelect().value).toBe("");
    expect(Array.from(departmentSelect().options).map((o) => o.textContent)).toEqual([
      "All Departments",
      "FSE",
      "HR",
      "Office",
    ]);
    expect(tab(/^All/).textContent).toBe("All4");
  });

  it("a department narrows the rows and the counts together", async () => {
    getRoster.mockResolvedValue({ configured: true, engineers: STAFFED });
    await mountBoard();
    await pickDepartment("Office");
    expect(rowNames()).toEqual(["Swetha"]);
    expect(tab(/^All/).textContent).toBe("All1");
    expect(tab(/^On duty/).textContent).toBe("On duty1");
    expect(tab(/^Not in Payroll/).textContent).toBe("Not in Payroll0");

    await pickDepartment("");
    expect(rowNames()).toHaveLength(4);
  });

  it("with no departments at all -- a Payroll not yet redeployed -- there is no filter", async () => {
    await mountBoard();
    expect(container.querySelector('select[aria-label="Department"]')).toBeNull();
    expect(rowNames()).toHaveLength(26);
  });
});

describe("the department filter's edges (review, 12 Oct 2026)", () => {
  const WITH_STAFF: RosterEngineer[] = [
    engineer({ engineer_name: "Praveen", state: "on_duty", engineer_id: 91, department: "FSE" }),
    engineer({ engineer_name: "Lava Kumar", state: "unmatched", engineer_id: null }),
    engineer({
      engineer_name: "Swetha",
      state: "on_duty",
      engineer_id: 21,
      department: "Office",
      staff: true,
      stale: true,
    }),
  ];

  async function pick(value: string) {
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('select[aria-label="Department"]');
      if (!select) throw new Error("no department filter");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("does not claim every register engineer is matched when a department hides them", async () => {
    getRoster.mockResolvedValue({ configured: true, engineers: WITH_STAFF });
    await mountBoard();
    await pick("FSE");
    await clickTab(/^Not in Payroll/);
    expect(container.textContent).not.toContain("Every engineer in the register is matched");
    expect(container.textContent).toContain("Nobody is in this tab right now.");
  });

  it("falls back to All, visibly, when the chosen department leaves the board", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getRoster.mockResolvedValue({ configured: true, engineers: WITH_STAFF });
      await mountBoard();
      await pick("Office");
      expect(rowNames()).toEqual(["Swetha"]);

      // The next 30s refresh has no Office staff (say Payroll could not list them).
      getRoster.mockResolvedValue({ configured: true, engineers: WITH_STAFF.filter((r) => !r.staff) });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      await act(async () => {});

      const select = container.querySelector<HTMLSelectElement>('select[aria-label="Department"]');
      expect(select?.value).toBe("");
      expect(rowNames()).toEqual(["Praveen", "Lava Kumar"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the No signal alert about the engineers' phones", async () => {
    const alert = '[title^="On duty, but their phone has stopped reporting"]';
    getRoster.mockResolvedValue({ configured: true, engineers: WITH_STAFF });
    await mountBoard();
    // Swetha is stale, but she is staff: her own row says so, the alert does not.
    expect(container.querySelector(alert)).toBeNull();
    expect(container.textContent).toContain("Staff · Office");

    // An engineer going quiet still raises it.
    await act(async () => {
      root.unmount();
    });
    getRoster.mockResolvedValue({
      configured: true,
      engineers: WITH_STAFF.map((r) => (r.engineer_name === "Praveen" ? { ...r, stale: true } : r)),
    });
    await mountBoard();
    expect(container.querySelector(alert)?.textContent).toContain("1");
  });
});
