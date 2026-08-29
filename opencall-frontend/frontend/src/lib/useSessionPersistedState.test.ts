// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persist, readPersisted } from "./useSessionPersistedState";

/**
 * The workspace mounts one view at a time, so leaving Closed Calls and coming back
 * unmounts the view and re-runs its state initialisers. Remounting is therefore exactly
 * one more `readPersisted` call — which is the whole of what "the filter survived
 * navigation" means, and why these can be tested without rendering anything.
 */
beforeEach(() => {
  window.sessionStorage.clear();
});

describe("readPersisted", () => {
  it("uses the default when nothing is stored", () => {
    expect(readPersisted("closedCalls.periodFrom", "2026-08-29")).toBe("2026-08-29");
  });

  it("prefers a stored value over the default", () => {
    persist("closedCalls.periodFrom", "2026-07-25");
    expect(readPersisted("closedCalls.periodFrom", "2026-08-29")).toBe("2026-07-25");
  });

  it("calls a factory default only when there is nothing stored", () => {
    const factory = vi.fn(() => "2026-08-29");
    expect(readPersisted("k", factory)).toBe("2026-08-29");
    expect(factory).toHaveBeenCalledTimes(1);

    persist("k", "2026-07-25");
    const second = vi.fn(() => "2026-08-29");
    expect(readPersisted("k", second)).toBe("2026-07-25");
    expect(second).not.toHaveBeenCalled();
  });

  it("restores an empty string instead of falling back to the default", () => {
    // "" is a real value here — an unbounded end of the range. Falling back would
    // silently re-bound a filter someone had deliberately opened up, which is what a
    // `||` in place of `??` would do.
    persist("k", "");
    expect(readPersisted("k", "2026-08-29")).toBe("");
  });

  it("keeps From and To apart", () => {
    persist("closedCalls.periodFrom", "2026-07-25");
    persist("closedCalls.periodTo", "2026-08-24");
    expect(readPersisted("closedCalls.periodFrom", "x")).toBe("2026-07-25");
    expect(readPersisted("closedCalls.periodTo", "x")).toBe("2026-08-24");
  });

  it("returns to the default once the tab is gone", () => {
    persist("closedCalls.periodFrom", "2026-07-25");
    // sessionStorage is per-tab and dies with it; clearing stands in for closing and
    // reopening the browser. Tomorrow must open on today, not on last week's range.
    window.sessionStorage.clear();
    expect(readPersisted("closedCalls.periodFrom", "2026-08-29")).toBe("2026-08-29");
  });

  it("falls back to the default when storage throws on read", () => {
    // Private windows and blocked site data throw rather than returning null.
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPersisted("k", "2026-08-29")).toBe("2026-08-29");
    getItem.mockRestore();
  });
});

describe("persist", () => {
  it("writes the value", () => {
    persist("k", "2026-07-25");
    expect(window.sessionStorage.getItem("k")).toBe("2026-07-25");
  });

  it("never throws when storage refuses the write", () => {
    // A lost filter must not take the page down with it.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => persist("k", "2026-07-25")).not.toThrow();
    setItem.mockRestore();
  });
});
