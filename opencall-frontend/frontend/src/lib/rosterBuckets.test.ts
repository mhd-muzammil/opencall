import { describe, expect, it } from "vitest";
import {
  bucketOf,
  countBuckets,
  filterRoster,
  isInBucket,
  isRowSelected,
  rosterRowKey,
} from "./rosterBuckets";
import type { RosterEngineer } from "./payrollTrackingApiClient";

function row(overrides: Partial<RosterEngineer> & Pick<RosterEngineer, "engineer_name" | "state">) {
  return {
    engineer_id: 1,
    branch: "Chennai",
    payroll_name: null,
    matched: overrides.state !== "unmatched",
    on_duty: overrides.state === "on_duty",
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
  } satisfies RosterEngineer;
}

// The board the user actually had in front of them: one engineer on duty, a
// handful Payroll could resolve but who never started, and thirteen the register
// knows and Payroll does not.
const BOARD = [
  row({ engineer_name: "Praveen", state: "on_duty" }),
  row({ engineer_name: "Arun", state: "checked_out" }),
  row({ engineer_name: "Bala", state: "absent" }),
  row({ engineer_name: "Jeeva Salem", state: "unmatched", engineer_id: null, branch: "Chennai" }),
  row({ engineer_name: "kannan", state: "unmatched", engineer_id: null, branch: null }),
];

describe("bucketOf", () => {
  it("puts an unresolvable engineer in its own bucket, not off duty", () => {
    expect(bucketOf({ state: "unmatched" })).toBe("unmatched");
  });

  it("treats a finished shift and a shift never started as off duty", () => {
    expect(bucketOf({ state: "checked_out" })).toBe("off");
    expect(bucketOf({ state: "absent" })).toBe("off");
  });

  it("only counts a live shift as on duty", () => {
    expect(bucketOf({ state: "on_duty" })).toBe("on_duty");
  });
});

describe("filterRoster", () => {
  it("shows ONLY the engineer on duty under the On duty tab", () => {
    // The reported bug: the On duty tab listed everyone Payroll could not match.
    expect(filterRoster(BOARD, "on_duty", "").map((r) => r.engineer_name)).toEqual(["Praveen"]);
  });

  it("keeps unmatched engineers out of the Off duty tab too", () => {
    expect(filterRoster(BOARD, "off", "").map((r) => r.engineer_name)).toEqual(["Arun", "Bala"]);
  });

  it("lists exactly the engineers Payroll cannot identify", () => {
    expect(filterRoster(BOARD, "unmatched", "").map((r) => r.engineer_name)).toEqual([
      "Jeeva Salem",
      "kannan",
    ]);
  });

  it("keeps everyone under All", () => {
    expect(filterRoster(BOARD, "all", "")).toHaveLength(BOARD.length);
  });

  it("applies the search inside the chosen bucket, never across it", () => {
    // "Praveen" is on duty, so searching for him inside Off duty finds nobody.
    expect(filterRoster(BOARD, "off", "praveen")).toEqual([]);
    expect(filterRoster(BOARD, "on_duty", "prav").map((r) => r.engineer_name)).toEqual(["Praveen"]);
  });

  it("searches name, branch and active case, and tolerates the nulls", () => {
    const withCase = [row({ engineer_name: "Praveen", state: "on_duty", active_case_number: "CN-908" })];
    expect(filterRoster(withCase, "all", "cn-9")).toHaveLength(1);
    expect(filterRoster(BOARD, "all", "chennai").map((r) => r.engineer_name)).toContain("Jeeva Salem");
    expect(() => filterRoster(BOARD, "all", "zzz")).not.toThrow();
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterRoster(BOARD, "all", "  bala  ").map((r) => r.engineer_name)).toEqual(["Bala"]);
  });
});

describe("countBuckets", () => {
  it("splits the total across the three real buckets", () => {
    const counts = countBuckets(BOARD);
    expect(counts).toEqual({ all: 5, on_duty: 1, off: 2, unmatched: 2 });
    // A tab label must never promise rows the tab cannot show.
    expect(counts.on_duty + counts.off + counts.unmatched).toBe(counts.all);
  });

  it("agrees with the filter for every bucket", () => {
    const counts = countBuckets(BOARD);
    for (const bucket of ["all", "on_duty", "off", "unmatched"] as const) {
      expect(filterRoster(BOARD, bucket, "")).toHaveLength(counts[bucket]);
    }
  });

  it("handles an empty board", () => {
    expect(countBuckets([])).toEqual({ all: 0, on_duty: 0, off: 0, unmatched: 0 });
  });
});

describe("isInBucket", () => {
  it("lets All through for every state", () => {
    for (const state of ["on_duty", "checked_out", "absent", "unmatched"] as const) {
      expect(isInBucket({ state }, "all")).toBe(true);
    }
  });
});

describe("rosterRowKey", () => {
  // The real defect: every unmatched engineer has engineer_id null, so keying the
  // row on it gave thirteen rows the SAME key. React could not tell them apart,
  // left their DOM rows behind when the list was filtered, and stacked a fresh
  // copy on every 30s refresh — three sets of the same twelve names under a tab
  // whose label said 1.
  it("gives every row a distinct key even when Payroll matched none of them", () => {
    const unmatchedBoard = [
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
    ].map((engineer_name) => row({ engineer_name, state: "unmatched", engineer_id: null }));

    const keys = unmatchedBoard.map((r, i) => rosterRowKey(r, i));
    expect(new Set(keys).size).toBe(unmatchedBoard.length);
    // The old key for all twelve of these.
    expect(keys).not.toContain("null");
  });

  it("stays distinct when the register holds the same name twice", () => {
    const twins = [
      row({ engineer_name: "Vijayakumar", state: "unmatched", engineer_id: null }),
      row({ engineer_name: "Vijayakumar", state: "unmatched", engineer_id: null }),
    ];
    const keys = twins.map((r, i) => rosterRowKey(r, i));
    expect(new Set(keys).size).toBe(2);
  });

  it("keeps keys unique across a mixed board", () => {
    const keys = BOARD.map((r, i) => rosterRowKey(r, i));
    expect(new Set(keys).size).toBe(BOARD.length);
  });
});

describe("isRowSelected", () => {
  it("selects nothing while nothing is selected, even for unmatched rows", () => {
    // null === null used to be true, so every unmatched row rendered as
    // "Checking" and sat highlighted with no engineer chosen at all.
    for (const r of BOARD) expect(isRowSelected(r, null)).toBe(false);
  });

  it("never selects an engineer Payroll could not match", () => {
    expect(isRowSelected({ engineer_id: null }, 91)).toBe(false);
  });

  it("selects exactly the row whose Payroll id was chosen", () => {
    expect(isRowSelected({ engineer_id: 91 }, 91)).toBe(true);
    expect(isRowSelected({ engineer_id: 92 }, 91)).toBe(false);
  });

  it("selects at most one row on a whole board", () => {
    const board = [
      row({ engineer_name: "Praveen", state: "on_duty", engineer_id: 91 }),
      row({ engineer_name: "Arun", state: "checked_out", engineer_id: 92 }),
      row({ engineer_name: "kannan", state: "unmatched", engineer_id: null }),
      row({ engineer_name: "Mohan", state: "unmatched", engineer_id: null }),
    ];
    expect(board.filter((r) => isRowSelected(r, 91))).toHaveLength(1);
    expect(board.filter((r) => isRowSelected(r, null))).toHaveLength(0);
  });
});
