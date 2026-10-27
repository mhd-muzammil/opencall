// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayReportCell, RosterEngineer } from "../../../lib/payrollTrackingApiClient";
import { ApiClientError } from "../../../lib/api/http";
import { DAY_REPORT_ROWS, DAY_SUMMARY_ROWS } from "../../../lib/dayReport";

/**
 * The Day Report tab, mounted: who it lists, what the boxes, the search and the
 * dates ask Payroll for when Show is pressed -- and only then -- what it puts on
 * screen, and that Download hands over exactly that.
 */

vi.mock("../../../lib/session", () => ({ clearSession: vi.fn() }));

const getRoster = vi.fn();
const getDayReport = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getRoster: (...args: unknown[]) => getRoster(...args),
  getDayReport: (...args: unknown[]) => getDayReport(...args),
}));

const downloadDayReportExcel = vi.fn();
vi.mock("../../../lib/dayReportExcel", () => ({
  downloadDayReportExcel: (...args: unknown[]) => downloadDayReportExcel(...args),
}));

const TODAY = "2026-10-26";

function rosterRow(engineer_id: number | null, engineer_name: string, branch: string | null, matched = true) {
  return { engineer_id, engineer_name, branch, matched } as RosterEngineer;
}

const ROSTER = {
  configured: true,
  engineers: [
    rosterRow(7, "Arun", "Chennai"),
    rosterRow(8, "Bala", "Salem"),
    rosterRow(null, "Vendor Ravi", null, false),
  ],
};

function cell(km: number): DayReportCell {
  return {
    logins: [{ at: `${TODAY}T10:00:00+05:30`, address: null, latitude: 12.7, longitude: 77.7 }],
    logouts: [],
    on_duty: true,
    check_ins: [],
    check_outs: [],
    assigned: 4,
    attended: 2,
    closed: 1,
    waiting_minutes: 0,
    waits: [],
    gps_off_minutes: 0,
    gps_offs: [],
    gps_ons: [],
    net_off_minutes: 0,
    net_offs: [],
    net_ons: [],
    km,
  };
}

/** Payroll's answer for whoever and whichever days were asked. */
function answerFor(_token: string, from: string, to: string, ids: number[]) {
  const days: string[] = [];
  for (let day = from; day <= to; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    days.push(day);
  }
  return Promise.resolve({
    configured: true,
    days,
    engineers: ids.map((id) => ({ engineer_id: id, days: Object.fromEntries(days.map((day) => [day, cell(id)])) })),
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // 26 Oct 2026, 11:30 IST.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
  getRoster.mockResolvedValue(ROSTER);
  getDayReport.mockImplementation(answerFor);
  downloadDayReportExcel.mockResolvedValue(undefined);
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
  const { default: DayReportPanel } = await import("./DayReportPanel");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(DayReportPanel, { token: "t" }));
  });
}

const button = (name: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === name)!;
const region = (name: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="day-report-region"]')).find((b) =>
    b.textContent?.includes(name),
  )!;
const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const title = () => container.querySelector('[data-testid="day-report-title"]')?.textContent;
const headers = () =>
  Array.from(container.querySelectorAll('[data-testid="day-report-grid"] thead tr')).map((tr) =>
    Array.from(tr.querySelectorAll("th")).map((th) => th.textContent),
  );

/** Types into a controlled input the way a person does. */
async function type(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

describe("DayReportPanel", () => {
  it("lists the matched FSEs in region boxes, and asks Payroll nothing until Show", async () => {
    await mount();
    expect(getRoster).toHaveBeenCalledWith("t", TODAY);
    expect(
      Array.from(container.querySelectorAll('[data-testid="day-report-region"]')).map((b) => b.textContent),
    ).toEqual(["All Regions2 FSEs", "Chennai1 FSE", "Salem1 FSE"]);
    expect(input("From").value).toBe(TODAY);
    expect(input("To").value).toBe(TODAY);
    expect(getDayReport).not.toHaveBeenCalled();
    expect(button("Download Excel").disabled).toBe(true);
  });

  it("Show asks for everybody on today, and shows a card for each FSE-day, by name", async () => {
    await mount();
    await click(button("Show"));
    expect(getDayReport).toHaveBeenCalledWith("t", TODAY, TODAY, [7, 8]);
    expect(title()).toBe("All Regions · 26-10-2026");
    const cards = Array.from(container.querySelectorAll('[data-testid="day-card"]'));
    expect(cards.map((card) => card.querySelector('[data-testid="day-card-name"]')?.textContent)).toEqual([
      "Arun",
      "Bala",
    ]);
    expect(cards.map((card) => card.querySelector('[data-testid="day-card-km"]')?.textContent)).toEqual(["7", "8"]);
    expect(cards[0]!.querySelector('[data-testid="day-card-duty"]')?.textContent).toContain("10:00 AM");
    expect(cards[0]!.querySelector('[data-testid="day-card-duty"]')?.textContent).toContain("On duty now");
    expect(cards[0]!.textContent).toContain("Chennai · Mon, 26 Oct 2026");
    expect(
      Array.from(cards[0]!.querySelectorAll('[data-testid="day-card-moment"]')).map((m) => m.textContent),
    ).toEqual(["Login10:00 AM12.70000, 77.70000"]);
    expect(container.querySelector('[data-testid="day-report-date"]')?.textContent).toBe("Mon, 26 Oct 2026· 2 FSEs");
    expect(
      Array.from(container.querySelectorAll('[data-testid="day-report-tile"]')).map((t) => t.textContent),
    ).toEqual(["15Total km", "2FSEs", "0Check ins", "2Closed"]);
    expect(container.querySelector('[data-testid="day-report-grid"]')).toBeNull();
  });

  it("the Table view lays the same FSE-days out as the sheet, a column each", async () => {
    await mount();
    await click(button("Show"));
    await click(button("Table"));
    expect(container.querySelector('[data-testid="day-report-cards"]')).toBeNull();
    expect(headers()).toEqual([
      ["Date", "26-10-2026", "26-10-2026"],
      ["Name", "Arun", "Bala"],
    ]);
    const rows = Array.from(container.querySelectorAll('[data-testid="day-report-grid"] tbody tr'));
    const row = (label: string) =>
      Array.from(rows.find((tr) => tr.querySelector("th")?.textContent === label)!.querySelectorAll("td")).map(
        (td) => td.textContent,
      );
    expect(row("Login")).toEqual(["10:00 AM", "10:00 AM"]);
    expect(row("Logout")).toEqual(["On duty", "On duty"]);
    expect(row("Assigned")).toEqual(["4", "4"]);
    expect(row("Total km")).toEqual(["7", "8"]);
    // A place with no address is a link to it on Google Maps.
    const link = rows
      .find((tr) => tr.querySelector("th")?.textContent === "Login location")!
      .querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://maps.google.com/?q=12.700000,77.700000");
    expect(link.getAttribute("target")).toBe("_blank");
    // And back.
    await click(button("Cards"));
    expect(container.querySelectorAll('[data-testid="day-card"]')).toHaveLength(2);
  });

  it("a card flags what needs a look, and a long day folds to its first moments", async () => {
    const busy = {
      ...cell(12),
      on_duty: false,
      logouts: [{ at: `${TODAY}T23:30:00+05:30`, auto: true, address: null, latitude: null, longitude: null }],
      gps_off_minutes: 45,
      net_off_minutes: 20,
      waiting_minutes: 90,
      waits: Array.from({ length: 9 }, (_, n) => ({
        at: `${TODAY}T1${n}:00:00+05:30`,
        minutes: 10,
        case_number: null,
        address: `Stop ${n + 1}`,
        latitude: 12.7,
        longitude: 77.7,
      })),
    };
    getDayReport.mockResolvedValue({ configured: true, days: [TODAY], engineers: [{ engineer_id: 7, days: { [TODAY]: busy } }] });
    await mount();
    await click(region("Chennai"));
    await click(button("Show"));
    const card = container.querySelector('[data-testid="day-card"]')!;
    expect(Array.from(card.querySelectorAll('[data-testid="day-card-badge"]')).map((b) => b.textContent)).toEqual([
      "GPS off 45 min",
      "Net off 20 min",
      "Waiting 1h 30m",
      "Auto logout",
    ]);
    // A Login, nine stops and a Logout: eleven moments, eight on show.
    expect(card.querySelectorAll('[data-testid="day-card-moment"]')).toHaveLength(8);
    await click(button("Show all 11"));
    expect(card.querySelectorAll('[data-testid="day-card-moment"]')).toHaveLength(11);
    expect(Array.from(card.querySelectorAll('[data-testid="day-card-moment"]')).at(-1)?.textContent).toContain(
      "Auto logout",
    );
    await click(button("Show less"));
    expect(card.querySelectorAll('[data-testid="day-card-moment"]')).toHaveLength(8);
  });

  it("a region box, then Show, asks for that region; one FSE left is named", async () => {
    await mount();
    await click(region("Salem"));
    await click(button("Show"));
    expect(getDayReport).toHaveBeenLastCalledWith("t", TODAY, TODAY, [8]);
    expect(title()).toBe("Bala · 26-10-2026");
  });

  it("the search narrows it to a person, and a period asks for every day of it", async () => {
    await mount();
    await type(container.querySelector<HTMLInputElement>('input[aria-label="Search FSE"]')!, "aru");
    await type(input("From"), "2026-10-24");
    await click(button("Show"));
    expect(getDayReport).toHaveBeenLastCalledWith("t", "2026-10-24", TODAY, [7]);
    expect(title()).toBe("Arun · 24-10-2026 to 26-10-2026");
    expect(
      Array.from(container.querySelectorAll('[data-testid="day-report-date"]')).map((h) => h.textContent),
    ).toEqual(["Sat, 24 Oct 2026· 1 FSE", "Sun, 25 Oct 2026· 1 FSE", "Mon, 26 Oct 2026· 1 FSE"]);
    await click(button("Table"));
    expect(headers()[0]).toEqual(["Date", "24-10-2026", "25-10-2026", "26-10-2026"]);
  });

  it("says the filters changed since Show, and keeps what Show loaded until Show is pressed again", async () => {
    await mount();
    await click(button("Show"));
    await click(region("Chennai"));
    expect(container.textContent).toContain("Press Show to load them.");
    expect(title()).toBe("All Regions · 26-10-2026");
    expect(getDayReport).toHaveBeenCalledTimes(1);
  });

  it("Download hands over exactly what is on screen, named for who and when", async () => {
    await mount();
    await click(region("Chennai"));
    await click(button("Show"));
    await click(button("Download Excel"));
    expect(downloadDayReportExcel).toHaveBeenCalledTimes(1);
    const [columns, filename] = downloadDayReportExcel.mock.calls[0]!;
    expect((columns as { name: string; day: string }[]).map((c) => [c.name, c.day])).toEqual([["Arun", TODAY]]);
    expect(filename).toBe(`Day_Report_Arun_${TODAY}.xlsx`);
    expect(downloadDayReportExcel.mock.calls[0]![2]).toBe(DAY_REPORT_ROWS);
  });

  it("the Summary view is the short sheet, plain as the office's, and Download in it hands over the short sheet", async () => {
    await mount();
    await click(button("Show"));
    await click(button("Summary"));
    expect(container.querySelector('[data-testid="day-report-cards"]')).toBeNull();
    expect(container.querySelector('[data-testid="day-report-grid"]')).toBeNull();
    const sheet = container.querySelector('[data-testid="day-summary-sheet"]')!;
    expect(
      Array.from(sheet.querySelectorAll("thead tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th")).map((th) => th.textContent),
      ),
    ).toEqual([
      ["DATE", "26-10-2026", "26-10-2026"],
      ["NAME", "Arun", "Bala"],
    ]);
    const rows = Array.from(sheet.querySelectorAll("tbody tr"));
    expect(rows.map((tr) => tr.querySelector("th")?.textContent)).toEqual([
      "Login Time",
      "Login Location",
      "Logout Time",
      "Logout Location",
      "Assigned",
      "Attended",
      "Closed",
      "GPS Off Hrs",
      "Total Km",
    ]);
    const row = (label: string) =>
      Array.from(rows.find((tr) => tr.querySelector("th")?.textContent === label)!.querySelectorAll("td")).map(
        (td) => td.textContent,
      );
    expect(row("Login Time")).toEqual(["10:00 AM", "10:00 AM"]);
    expect(row("Logout Time")).toEqual(["On duty", "On duty"]);
    expect(row("Closed")).toEqual(["1", "1"]);
    expect(row("Total Km")).toEqual(["7", "8"]);
    // Black on white, the names left and the values centred; no colour for "On duty".
    const onDuty = rows.find((tr) => tr.querySelector("th")?.textContent === "Logout Time")!.querySelector("td")!;
    expect([onDuty.style.color, onDuty.style.textAlign, onDuty.innerHTML.includes("color")]).toEqual([
      "rgb(0, 0, 0)",
      "center",
      false,
    ]);
    expect(rows[0]!.querySelector("th")!.style.textAlign).toBe("left");
    // The heading white -- the Date row on indigo, the Name row on sky blue --
    // and the field names down the side on a light indigo.
    const looks = (selector: string) =>
      [...new Set(Array.from(sheet.querySelectorAll<HTMLElement>(selector)).map((el) => `${el.style.background} / ${el.style.color}`))];
    expect(looks("thead tr:first-child th")).toEqual(["rgb(79, 70, 229) / rgb(255, 255, 255)"]);
    expect(looks("thead tr:last-child th")).toEqual(["rgb(2, 132, 199) / rgb(255, 255, 255)"]);
    expect(looks("tbody th")).toEqual(["rgb(224, 231, 255) / rgb(0, 0, 0)"]);
    expect(looks("tbody td")).toEqual(["rgb(255, 255, 255) / rgb(0, 0, 0)"]);
    await click(button("Download Excel"));
    const [columns, filename, sheetRows] = downloadDayReportExcel.mock.calls[0]!;
    expect((columns as unknown[]).length).toBe(2);
    expect(filename).toBe(`Day_Summary_All_Regions_${TODAY}.xlsx`);
    expect(sheetRows).toBe(DAY_SUMMARY_ROWS);
  });

  it("refuses a period longer than 31 days, or one that runs backwards", async () => {
    await mount();
    await type(input("From"), "2026-09-01");
    expect(button("Show").disabled).toBe(true);
    expect(container.textContent).toContain("Pick a period of 1 to 31 days");
    await type(input("From"), "2026-10-26");
    await type(input("To"), "2026-10-25");
    expect(button("Show").disabled).toBe(true);
  });

  it("an expired login ends in the sign-in banner", async () => {
    getDayReport.mockRejectedValue(new ApiClientError("expired", 401, null));
    await mount();
    await click(button("Show"));
    expect(container.textContent).toContain("Your login has expired.");
    expect(container.querySelector('[data-testid="day-report-grid"]')).toBeNull();
  });

  it("a failure says what went wrong", async () => {
    getDayReport.mockRejectedValue(new Error("Payroll is down"));
    await mount();
    await click(button("Show"));
    expect(container.textContent).toContain("Payroll is down");
  });
});
