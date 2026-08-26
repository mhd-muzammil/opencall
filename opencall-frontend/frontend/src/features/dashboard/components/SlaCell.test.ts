import { describe, expect, it } from "vitest";
import { formatCountdown, formatDeadline } from "./SlaCell";

/**
 * The countdown ticks once a second beside every open call, so what it prints has to stay
 * the same WIDTH as the digits change — a row that jitters every second is worse than one
 * that does not move at all.
 */

describe("formatCountdown", () => {
  it("ticks in seconds inside the last hour, where somebody is watching the clock", () => {
    expect(formatCountdown(754)).toBe("12m 34s");
    expect(formatCountdown(59)).toBe("0m 59s");
  });

  it("drops the seconds past an hour, because the width is needed for the deadline", () => {
    // "over 1h 15m 32s · 26 Aug, 5:39 pm" ran off the end of the Ticket ID column and drew
    // itself over the Case ID beside it.
    expect(formatCountdown(4 * 3600 + 5 * 60 + 3)).toBe("4h 05m");
    expect(formatCountdown(4 * 3600 + 15 * 60 + 30)).toBe("4h 15m");
  });

  it("pads so a ticking row keeps its width", () => {
    // "4h 5m" and "4h 15m" are different widths; the row would jump as digits rolled over.
    expect(formatCountdown(4 * 3600 + 5 * 60)).toBe("4h 05m");
    expect(formatCountdown(9 * 60 + 3)).toBe("9m 03s");
  });

  it("uses days past a day", () => {
    expect(formatCountdown(5 * 86400 + 3 * 3600 + 12 * 60)).toBe("5d 3h 12m");
  });

  it("reads the same either side of zero — the sign is the caller's to add", () => {
    // Formatting the magnitude only keeps "over 2h 00m" and "2h 00m" symmetrical.
    expect(formatCountdown(-7200)).toBe(formatCountdown(7200));
  });

  it("handles both boundaries between the three formats", () => {
    expect(formatCountdown(3599)).toBe("59m 59s");
    expect(formatCountdown(3600)).toBe("1h 00m");
    expect(formatCountdown(86399)).toBe("23h 59m");
    expect(formatCountdown(86400)).toBe("1d 0h 0m");
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
