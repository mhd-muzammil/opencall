import { describe, expect, it } from "vitest";
import {
  analyseEngineerTarget,
  nextDayAdvice,
  DAILY_CLOSE_TARGET,
  MONTHLY_CLOSE_TARGET,
  WORKING_DAYS_PER_MONTH,
} from "./engineerTargetMath";

// The target is 7 closes a day across 25 working days = 175 a month. These tests pin the
// arithmetic that decides whether an engineer can still land the month.

function input(overrides: Partial<Parameters<typeof analyseEngineerTarget>[0]> = {}) {
  return {
    engineer: "Ravi",
    regionCode: "ASPS01461",
    todayClosed: 7,
    periodClosed: 70,
    daysWorked: 10,
    ...overrides,
  };
}

describe("the standing target", () => {
  it("is 7 a day and 175 a month", () => {
    expect(DAILY_CLOSE_TARGET).toBe(7);
    expect(WORKING_DAYS_PER_MONTH).toBe(25);
    expect(MONTHLY_CLOSE_TARGET).toBe(175);
  });
});

describe("analyseEngineerTarget", () => {
  it("reads exactly on pace as on track", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 70, daysWorked: 10 }));

    expect(a.expectedByNow).toBe(70);
    expect(a.gap).toBe(0);
    expect(a.avgPerDay).toBe(7);
    expect(a.remainingDays).toBe(15);
    expect(a.remainingToTarget).toBe(105);
    expect(a.neededPerDay).toBe(7);
    expect(a.projected).toBe(175);
    expect(a.status).toBe("ON_TRACK");
  });

  it("reports being ahead of pace", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 90, daysWorked: 10 }));

    expect(a.gap).toBe(20);
    expect(a.avgPerDay).toBe(9);
    expect(a.neededPerDay).toBeCloseTo(5.7, 1); // 85 over 15 days
    expect(a.status).toBe("ON_TRACK");
  });

  it("calls a recoverable shortfall a push", () => {
    // 50 in 10 days: 125 left over 15 days = 8.3/day, above 7 but under the 10.5 ceiling.
    const a = analyseEngineerTarget(input({ periodClosed: 50, daysWorked: 10 }));

    expect(a.gap).toBe(-20);
    expect(a.neededPerDay).toBeCloseTo(8.3, 1);
    expect(a.status).toBe("PUSH");
  });

  it("flags a rate above the push ceiling as at risk", () => {
    // 20 in 10 days: 155 left over 15 days = 10.3/day -> just inside PUSH.
    expect(analyseEngineerTarget(input({ periodClosed: 20, daysWorked: 10 })).status).toBe(
      "PUSH",
    );
    // 10 in 10 days: 165 over 15 = 11/day -> beyond the ceiling, still under 15.
    const risky = analyseEngineerTarget(input({ periodClosed: 10, daysWorked: 10 }));
    expect(risky.neededPerDay).toBe(11);
    expect(risky.status).toBe("AT_RISK");
  });

  it("calls an impossible run-in not possible", () => {
    // 0 in 20 days: 175 left over 5 days = 35/day.
    const a = analyseEngineerTarget(input({ periodClosed: 0, daysWorked: 20 }));

    expect(a.neededPerDay).toBe(35);
    expect(a.status).toBe("NOT_POSSIBLE");
  });

  it("marks the month achieved once the target is met", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 180, daysWorked: 24 }));

    expect(a.remainingToTarget).toBe(0);
    expect(a.neededPerDay).toBe(0);
    expect(a.status).toBe("ACHIEVED");
  });

  it("has no days left to recover on the last day", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 150, daysWorked: 25 }));

    expect(a.remainingDays).toBe(0);
    expect(a.neededPerDay).toBeNull();
    expect(a.status).toBe("NOT_POSSIBLE");
    expect(nextDayAdvice(a)).toMatch(/No working days left/);
  });

  it("computes today's shortfall against the daily target", () => {
    expect(analyseEngineerTarget(input({ todayClosed: 3 })).todayShortfall).toBe(4);
    expect(analyseEngineerTarget(input({ todayClosed: 7 })).todayShortfall).toBe(0);
    expect(analyseEngineerTarget(input({ todayClosed: 9 })).todayShortfall).toBe(0);
  });

  it("survives a brand-new engineer with no days worked", () => {
    const a = analyseEngineerTarget(
      input({ periodClosed: 0, daysWorked: 0, todayClosed: 0 }),
    );

    expect(a.avgPerDay).toBe(0);
    expect(a.expectedByNow).toBe(0);
    expect(a.remainingDays).toBe(25);
    expect(a.neededPerDay).toBe(7); // 175 over 25 days
    expect(a.status).toBe("ON_TRACK");
  });

  it("never reports a negative shortfall or remainder", () => {
    const a = analyseEngineerTarget(
      input({ periodClosed: 200, daysWorked: 30, todayClosed: 20 }),
    );

    expect(a.remainingToTarget).toBe(0);
    expect(a.remainingDays).toBe(0);
    expect(a.todayShortfall).toBe(0);
  });
});

describe("nextDayAdvice", () => {
  it("tells a behind engineer the rate they now need", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 50, daysWorked: 10 }));
    expect(nextDayAdvice(a)).toBe(
      "20 behind pace. Close 8.3/day for the remaining 15 days.",
    );
  });

  it("tells an ahead engineer they are ahead", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 90, daysWorked: 10 }));
    expect(nextDayAdvice(a)).toMatch(/^20 ahead of pace\./);
  });

  it("congratulates once the month is landed", () => {
    const a = analyseEngineerTarget(input({ periodClosed: 180, daysWorked: 24 }));
    expect(nextDayAdvice(a)).toMatch(/Monthly target met/);
  });
});
