import { describe, expect, it, vi } from "vitest";
import { createOpenCallApiClient } from "./openCallApiClient";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** A fetch that does not settle until the test says so. */
function deferredFetch() {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    await gate;
    return jsonResponse({ reportId: "report-1", rows: [] });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, release };
}

const REQUEST = {
  token: "t",
  regionId: "",
  reportDate: "2026-09-01",
  flexUploadBatchId: "batch-1",
};

describe("generateReport request collapsing", () => {
  it("sends ONE request when three callers ask for the same report at once", async () => {
    // The real shape of a page load: the history restore, the Engineer Productivity
    // day report and the RTPL day report all generate the same report. On the server
    // they take the same advisory lock, so they run one after another and the page
    // waits for all three.
    const { fetchImpl, calls, release } = deferredFetch();
    const client = createOpenCallApiClient({ baseUrl: "https://api.test", fetchImpl });

    const all = Promise.all([
      client.generateReport(REQUEST),
      client.generateReport(REQUEST),
      client.generateReport(REQUEST),
    ]);

    release();
    const [a, b, c] = await all;

    expect(calls).toHaveLength(1);
    // Every caller gets the same answer, not a partial one.
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does NOT collapse different reports", async () => {
    const { fetchImpl, calls, release } = deferredFetch();
    const client = createOpenCallApiClient({ baseUrl: "https://api.test", fetchImpl });

    const all = Promise.all([
      client.generateReport(REQUEST),
      client.generateReport({ ...REQUEST, reportDate: "2026-08-31" }),
      client.generateReport({ ...REQUEST, flexUploadBatchId: "batch-2" }),
      client.generateReport({ ...REQUEST, regionId: "region-9" }),
    ]);

    release();
    await all;

    // A different date, batch or region is a different report and must be asked for.
    expect(calls).toHaveLength(4);
  });

  it("re-asks the server on the next load rather than caching", async () => {
    const { fetchImpl, calls, release } = deferredFetch();
    const client = createOpenCallApiClient({ baseUrl: "https://api.test", fetchImpl });

    release();
    await client.generateReport(REQUEST);
    await client.generateReport(REQUEST);

    // This collapses concurrent requests; it is not a cache. Once one settles the
    // next caller gets fresh data — a report regenerates as the day's data changes.
    expect(calls).toHaveLength(2);
  });

  it("releases the slot when a request fails, so a retry is not stuck on it", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const client = createOpenCallApiClient({
      baseUrl: "https://api.test",
      fetchImpl: failing,
    });

    await expect(client.generateReport(REQUEST)).rejects.toThrow("network down");
    // A failed generation must not poison the key forever.
    await expect(client.generateReport(REQUEST)).rejects.toThrow("network down");
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
