// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraMonitoringPage } from "./CameraMonitoringPage";

/** The Camera Monitoring section before any camera is connected. */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CameraMonitoringPage", () => {
  it("says no camera is connected yet, and asks the server for nothing", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    act(() => root.render(createElement(CameraMonitoringPage)));

    expect(container.querySelector("h2")?.textContent).toBe("Camera Monitoring");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("No cameras connected yet");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
