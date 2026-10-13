// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineerKmDays } from "../../../lib/payrollTrackingApiClient";

/**
 * The KM Report, mounted: who is listed, what the boxes and the search leave on
 * screen, and that every cell and total is Payroll's figure as it came.
 */

vi.mock("../../../lib/session", () => ({ clearSession: vi.fn() }));

const getRosterKmDays = vi.fn();
vi.mock("../../../lib/payrollTrackingApiClient", () => ({
  getRosterKmDays: (...args: unknown[]) => getRosterKmDays(...args),
}));

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
