import { describe, expect, it } from "vitest";
import { formatCountdown, formatDeadline } from "./SlaCell";

/**
 * The countdown ticks once a second beside every open call, so what it prints has to stay
 * the same WIDTH as the digits change — a row that jitters every second is worse than one
 * that does not move at all.
 */

describe("formatCountdown", () => {
  it("shows seconds inside an hour, where somebody is watching the clock", () => {
    expect(formatCountdown(754)).toBe("12m 34s");
    expect(formatCountdown(59)).toBe("0m 59s");
  });

  it("pads minutes and seconds so a ticking row keeps its width", () => {
    // "4h 5m 3s" and "4h 15m 30s" are different widths; the row would jump every time a
    // digit rolled over.
    expect(formatCountdown(4 * 3600 + 5 * 60 + 3)).toBe("4h 05m 03s");
    expect(formatCountdown(4 * 3600 + 15 * 60 + 30)).toBe("4h 15m 30s");
  });

  it("drops to minutes past a day, where a seconds counter is only noise", () => {
    expect(formatCountdown(5 * 86400 + 3 * 3600 + 12 * 60)).toBe("5d 3h 12m");
  });

  it("reads the same either side of zero — the sign is the caller's to add", () => {
    // Formatting the magnitude only keeps "over 2h 00m 00s" and "2h 00m 00s" symmetrical.
    expect(formatCountdown(-7200)).toBe(formatCountdown(7200));
  });

  it("handles the boundary between the two formats", () => {
    expect(formatCountdown(86399)).toBe("23h 59m 59s");
    expect(formatCountdown(86400)).toBe("1d 0h 0m");
  });
});

describe("formatDeadline", () => {
  it("writes the deadline in the time everybody here works in", () => {
    // 12:30 UTC is 18:00 IST — the same instant FieldEZ's own page prints as 18:00:00.
    expect(formatDeadline("2026-08-31T12:30:00.000Z")).toMatch(/31 Aug.*6:00\s*pm/i);
  });

  it("is empty rather than an Invalid Date when the value is not one", () => {
    expect(formatDeadline("not a date")).toBe("");
  });
});
