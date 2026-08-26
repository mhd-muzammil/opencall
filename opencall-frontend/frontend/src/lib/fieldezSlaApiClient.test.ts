import { describe, expect, it } from "vitest";
import {
  formatSlaLeft,
  slaBucket,
  slaSecondsLeft,
  slaTicketKey,
  type FieldezSlaRow,
} from "./fieldezSlaApiClient";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const FUTURE = "2026-08-31T12:30:00.000Z";
const PAST = "2026-08-25T12:00:00.000Z";

function row(over: Partial<FieldezSlaRow> = {}): FieldezSlaRow {
  return {
    ticketKey: "WO035640797",
    ticketNo: "WO-035640797",
    caseId: "5163861807",
    fieldezTicketId: 1044258,
    bpId: 2,
    slaStatus: "Within SLA",
    slaPolicy: "Commercial",
    slaEndTime: FUTURE,
    priority: "WO Priority 7",
    taskName: "Partner Parts Hold",
    fetchedAt: "2026-08-26T11:45:00.000Z",
    ...over,
  };
}

describe("slaTicketKey", () => {
  it("joins the report's spelling to FieldEZ's", () => {
    // The report writes WO-035640797 and FieldEZ sometimes writes WO035640797. Joining on
    // the raw string leaves the SLA column blank for whichever half spells it the other way.
    expect(slaTicketKey("WO-035640797")).toBe(slaTicketKey("WO035640797"));
    expect(slaTicketKey(" wo-035640797 ")).toBe("WO035640797");
  });

  it("is empty for nothing", () => {
    expect(slaTicketKey("")).toBe("");
    expect(slaTicketKey(null)).toBe("");
  });
});

describe("slaBucket", () => {
  it("is within while the deadline is ahead", () => {
    expect(slaBucket(row(), NOW)).toBe("within");
  });

  it("is breached once the deadline has passed", () => {
    expect(slaBucket(row({ slaEndTime: PAST }), NOW)).toBe("breached");
  });

  it("trusts the clock over a status that was true fifteen minutes ago", () => {
    // The worker refreshes every fifteen minutes, so a call that crossed its deadline in
    // between still carries "Within SLA". The deadline is the fixed fact; the status is a
    // snapshot. Reading the status would report a breach as fine for up to a quarter hour.
    expect(slaBucket(row({ slaEndTime: PAST, slaStatus: "Within SLA" }), NOW)).toBe("breached");
  });

  it("falls back to the status when FieldEZ gave no deadline", () => {
    expect(slaBucket(row({ slaEndTime: null, slaStatus: "SLA Breached" }), NOW)).toBe("breached");
    expect(slaBucket(row({ slaEndTime: null, slaStatus: "Within SLA" }), NOW)).toBe("within");
  });

  it("is none when FieldEZ tracks no SLA at all", () => {
    // WO-035655580's page showed a dash in every SLA field. "No promise recorded" is not
    // "the promise is being kept", and counting it as adherence would flatter the numbers.
    expect(slaBucket(row({ slaEndTime: null, slaStatus: "" }), NOW)).toBe("none");
  });

  it("does not read an unparseable deadline as a breach", () => {
    // A date nobody can parse says nothing about whether the promise was kept.
    expect(slaBucket(row({ slaEndTime: "not a date", slaStatus: "" }), NOW)).toBe("none");
  });
});

describe("slaSecondsLeft", () => {
  it("counts down from the stored deadline", () => {
    expect(slaSecondsLeft(FUTURE, NOW)).toBe(5 * 86400 + 1800);
  });

  it("goes negative once missed", () => {
    expect(slaSecondsLeft(PAST, NOW)).toBe(-86400);
  });

  it("is null with no deadline or a broken one", () => {
    expect(slaSecondsLeft(null, NOW)).toBeNull();
    expect(slaSecondsLeft("not a date", NOW)).toBeNull();
  });
});

describe("formatSlaLeft", () => {
  it("writes hours and minutes while the answer is actionable", () => {
    expect(formatSlaLeft(3660)).toBe("1h 1m");
    expect(formatSlaLeft(600)).toBe("10m");
  });

  it("switches to days once nobody is counting hours", () => {
    // "overdue 652h 54m" is what a month-old breach used to read as: hard to parse, and wide
    // enough in a table cell to push the Case ID column off the screen.
    expect(formatSlaLeft(-2350440)).toBe("over 27d");
    expect(formatSlaLeft(438000)).toBe("5d");
  });

  it("says over rather than showing a minus sign to be squinted at", () => {
    expect(formatSlaLeft(-7200)).toBe("over 2h 0m");
  });

  it("is empty when there is nothing to count", () => {
    expect(formatSlaLeft(null)).toBe("");
  });
});
