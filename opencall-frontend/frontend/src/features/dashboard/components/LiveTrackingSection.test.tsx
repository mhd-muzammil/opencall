// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Live Tracking section: the board first, the KM Report as its second tab,
 * and only the open one mounted -- the board's 30-second polling must not run
 * behind the report.
 */

const boardMounted = vi.fn();
const boardUnmounted = vi.fn();
vi.mock("./LiveTrackingPanel", async () => {
  const { useEffect, createElement: h } = await import("react");
  return {
    default: (props: { token: string | null; embedded?: boolean }) => {
      useEffect(() => {
        boardMounted(props);
        return () => boardUnmounted();
      }, []);
      return h("div", { "data-testid": "board" }, "board");
    },
  };
});

vi.mock("./KmReportPanel", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { token: string | null; embedded?: boolean }) =>
      h("div", { "data-testid": "km", "data-token": props.token, "data-embedded": String(props.embedded) }, "km"),
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

async function mount() {
  const { default: LiveTrackingSection } = await import("./LiveTrackingSection");
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(LiveTrackingSection, { token: "t" }));
  });
}

const tab = (name: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((b) =>
    b.textContent?.includes(name),
  )!;

describe("LiveTrackingSection", () => {
  it("opens on the live board, embedded, with the KM Report as a second tab", async () => {
    await mount();
    expect(Array.from(container.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim())).toEqual([
      "Live Tracking",
      "KM Report",
    ]);
    expect(tab("Live Tracking").getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-testid="board"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="km"]')).toBeNull();
    expect(boardMounted).toHaveBeenCalledWith({ token: "t", embedded: true });
  });

  it("the KM Report tab shows the report and takes the board down", async () => {
    await mount();
    await act(async () => {
      tab("KM Report").click();
    });
    const km = container.querySelector('[data-testid="km"]');
    expect(km?.getAttribute("data-token")).toBe("t");
    expect(km?.getAttribute("data-embedded")).toBe("true");
    expect(container.querySelector('[data-testid="board"]')).toBeNull();
    expect(boardUnmounted).toHaveBeenCalledTimes(1);
    expect(tab("KM Report").getAttribute("aria-selected")).toBe("true");
  });

  it("back to the board", async () => {
    await mount();
    await act(async () => {
      tab("KM Report").click();
    });
    await act(async () => {
      tab("Live Tracking").click();
    });
    expect(container.querySelector('[data-testid="board"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="km"]')).toBeNull();
  });
});
