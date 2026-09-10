// The freshness badge is the FieldEZ closure worker's liveness probe. Three states, and
// the difference between the last two is the point: red means nothing has synced and the
// worker is probably dead; grey means the sync is running fine and Flex simply has no new
// closures yet, which is every morning until the first one lands.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClosureImportStatus } from "../../../../lib/closureDateApiClient";
import { CLOSURE_SYNC_STALE_AFTER_MS, readClosureFreshness } from "./SyncBadge";

const NOW = Date.parse("2026-08-03T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function status(overrides: Partial<ClosureImportStatus>): ClosureImportStatus {
  return {
    count: 1200,
    lastImportedAt: ago(5 * 60_000),
    lastImportSource: "AUTO",
    lastClosedOn: "2026-08-03",
    lastSyncAt: ago(5 * 60_000),
    lastSyncSource: "AUTO",
    lastSyncImported: 12,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("readClosureFreshness", () => {
  it("renders nothing at all when nothing has ever been imported", () => {
    expect(readClosureFreshness(null).present).toBe(false);
    expect(
      readClosureFreshness(status({ lastSyncAt: null, lastImportedAt: null })).present,
    ).toBe(false);
  });

  it("is healthy on a recent sync, and names the source", () => {
    const freshness = readClosureFreshness(status({}));
    expect(freshness).toMatchObject({ present: true, stale: false, noNewData: false });
    expect(freshness.label).toBe("Auto-synced");
  });

  it("goes stale after three missed cycles", () => {
    const freshness = readClosureFreshness(
      status({ lastSyncAt: ago(CLOSURE_SYNC_STALE_AFTER_MS + 60_000) }),
    );
    expect(freshness.stale).toBe(true);
    expect(freshness.title).toContain("worker may be down");
  });

  it("distinguishes a live sync with no new data from a dead one", () => {
    // An empty new-day export imports 0 rows, so lastImportedAt legitimately sits at last
    // night's final import all morning while the worker is perfectly healthy. Reading that
    // as staleness would cry wolf every single morning.
    const freshness = readClosureFreshness(
      status({
        lastSyncAt: ago(60_000),
        lastImportedAt: ago(CLOSURE_SYNC_STALE_AFTER_MS + 60_000),
      }),
    );
    expect(freshness.stale).toBe(false);
    expect(freshness.noNewData).toBe(true);
  });

  it("falls back to lastImportedAt on a backend without the run log", () => {
    // Before the closure_sync_runs table, lastImportedAt was the only signal there was.
    const freshness = readClosureFreshness(
      status({ lastSyncAt: null, lastSyncSource: null, lastImportedAt: ago(60_000) }),
    );
    expect(freshness.present).toBe(true);
    expect(freshness.stale).toBe(false);
    // Not "no new closures yet" either — that state needs a run log to be meaningful.
    expect(freshness.noNewData).toBe(false);
  });
});
