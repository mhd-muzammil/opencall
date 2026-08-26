import { describe, expect, it } from "vitest";
import { formatCountdown, formatDeadline } from "./SlaCell";

/**
 * The countdown ticks once a second beside every open call, so what it prints has to stay
 * the same WIDTH as the digits change — a row that jitters every second is worse than one
 * that does not move at all.
 */

describe("formatCountdown", () => {
  it("ends in seconds at EVERY range, so it is always visibly moving", () => {
    // A countdown that does not move is indistinguishable from a stale number, which is the
    // one thing this whole feature exists to stop anybody thinking. Dropping the seconds past
    // an hour saved width and cost exactly that.
    for (const seconds of [30, 754, 4 * 3600 + 5 * 60 + 3, 5 * 86400 + 3 * 3600 + 12 * 60 + 7]) {
      expect(formatCountdown(seconds)).toMatch(/\d+s$/);
    }
  });

  it("shows the units that matter at each range", () => {
    expect(formatCountdown(754)).toBe("12m 34s");
    expect(formatCountdown(4 * 3600 + 5 * 60 + 3)).toBe("4h 05m 03s");
    expect(formatCountdown(5 * 86400 + 3 * 3600 + 12 * 60 + 7)).toBe("5d 3h 12m 07s");
  });

  it("pads so a ticking row keeps its width", () => {
    // "4h 5m 3s" and "4h 15m 30s" are different widths; the row would jump every time a
    // digit rolled over.
    expect(formatCountdown(4 * 3600 + 5 * 60 + 3)).toBe("4h 05m 03s");
    expect(formatCountdown(4 * 3600 + 15 * 60 + 30)).toBe("4h 15m 30s");
  });

  it("reads the same either side of zero — the sign is the caller's to add", () => {
    expect(formatCountdown(-7200)).toBe(formatCountdown(7200));
  });

  it("handles both boundaries between the three shapes", () => {
    expect(formatCountdown(3599)).toBe("59m 59s");
    expect(formatCountdown(3600)).toBe("1h 00m 00s");
    expect(formatCountdown(86399)).toBe("23h 59m 59s");
    expect(formatCountdown(86400)).toBe("1d 0h 00m 00s");
  });

  it("stays inside a width the cell can hold", () => {
    // The deadline moved to its own line to make room for this; there is no more to spare.
    for (const seconds of [0, 59, 3599, 3600, 86399, 86400, 400 * 86400]) {
      expect(formatCountdown(seconds).length).toBeLessThanOrEqual(15);
    }
  });
});

describe("formatDeadline", () => {
  it("writes the deadline in the time everybody here works in", () => {
    // 12:30 UTC is 18:00 IST — the same instant FieldEZ's own page prints as 18:00:00.
    expect(formatDeadline("2026-08-31T12:30:00.000Z")).toMatch(/31 Aug.*6:00\s*pm/i);
  });

  it("drops the comma, which costs width and buys nothing", () => {
    expect(formatDeadline("2026-08-31T12:30:00.000Z")).not.toContain(",");
  });

  it("is empty rather than an Invalid Date when the value is not one", () => {
    expect(formatDeadline("not a date")).toBe("");
  });
});
