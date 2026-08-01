/**
 * Engineer Target maths — target vs actual, pace, and what each engineer must do from
 * tomorrow to still land the month.
 *
 * Pure functions with no React and no API, so the arithmetic that decides "can they still
 * make it?" is unit-testable on its own. Self-contained: nothing here is imported from, or
 * changes, any existing module.
 */

export const DAILY_CLOSE_TARGET = 7;
export const WORKING_DAYS_PER_MONTH = 25;
export const MONTHLY_CLOSE_TARGET = DAILY_CLOSE_TARGET * WORKING_DAYS_PER_MONTH; // 175

/**
 * How hard the run-in is. `PUSH` is the band where the month is still reachable but only
 * above the normal daily target; `AT_RISK` needs a rate we have no evidence anyone sustains.
 */
export type TargetStatus =
  | "ACHIEVED"
  | "ON_TRACK"
  | "PUSH"
  | "AT_RISK"
  | "NOT_POSSIBLE";

/** The most a day is assumed to physically hold, used only to call a month impossible. */
export const MAX_FEASIBLE_PER_DAY = 15;
/** Above the daily target but still considered reachable with effort. */
export const PUSH_CEILING = DAILY_CLOSE_TARGET * 1.5; // 10.5

export interface EngineerTargetInput {
  engineer: string;
  regionCode: string;
  todayClosed: number;
  periodClosed: number;
  /** Report days this engineer appeared on the plan (days elapsed for them). */
  daysWorked: number;
}

export interface EngineerTargetAnalysis extends EngineerTargetInput {
  /** Closes expected by now at the daily target. */
  expectedByNow: number;
  /** periodClosed - expectedByNow. Positive = ahead. */
  gap: number;
  /** Average closes per day worked so far. */
  avgPerDay: number;
  /** Working days left in the month for this engineer. */
  remainingDays: number;
  /** Still owed to reach the monthly target. Never negative. */
  remainingToTarget: number;
  /**
   * What they must average per remaining day to land the month. 0 once the target is met;
   * null when there are no days left to do it in.
   */
  neededPerDay: number | null;
  /** Where they land if they keep the current average. */
  projected: number;
  /** Today's shortfall against the daily target. Never negative. */
  todayShortfall: number;
  status: TargetStatus;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Analyse one engineer against the standing target.
 *
 * `daysWorked` drives everything: an engineer who joined mid-month is judged on the days
 * they were actually on the plan, not on the calendar.
 */
export function analyseEngineerTarget(
  input: EngineerTargetInput,
  options: {
    dailyTarget?: number;
    monthlyTarget?: number;
    workingDaysPerMonth?: number;
  } = {},
): EngineerTargetAnalysis {
  const dailyTarget = options.dailyTarget ?? DAILY_CLOSE_TARGET;
  const monthlyTarget = options.monthlyTarget ?? MONTHLY_CLOSE_TARGET;
  const workingDays = options.workingDaysPerMonth ?? WORKING_DAYS_PER_MONTH;

  const daysWorked = Math.max(0, input.daysWorked);
  const periodClosed = Math.max(0, input.periodClosed);

  const expectedByNow = daysWorked * dailyTarget;
  const gap = periodClosed - expectedByNow;
  const avgPerDay = daysWorked > 0 ? round1(periodClosed / daysWorked) : 0;

  const remainingDays = Math.max(0, workingDays - daysWorked);
  const remainingToTarget = Math.max(0, monthlyTarget - periodClosed);

  const neededPerDay =
    remainingToTarget === 0
      ? 0
      : remainingDays > 0
        ? round1(remainingToTarget / remainingDays)
        : null;

  const projected = Math.round(periodClosed + avgPerDay * remainingDays);
  const todayShortfall = Math.max(0, dailyTarget - Math.max(0, input.todayClosed));

  let status: TargetStatus;
  if (periodClosed >= monthlyTarget) {
    status = "ACHIEVED";
  } else if (neededPerDay === null || neededPerDay > MAX_FEASIBLE_PER_DAY) {
    // Nothing left to do it in, or a rate nobody sustains.
    status = "NOT_POSSIBLE";
  } else if (neededPerDay <= dailyTarget) {
    status = "ON_TRACK";
  } else if (neededPerDay <= PUSH_CEILING) {
    status = "PUSH";
  } else {
    status = "AT_RISK";
  }

  return {
    ...input,
    expectedByNow,
    gap,
    avgPerDay,
    remainingDays,
    remainingToTarget,
    neededPerDay,
    projected,
    todayShortfall,
    status,
  };
}

export const STATUS_LABEL: Record<TargetStatus, string> = {
  ACHIEVED: "Target achieved",
  ON_TRACK: "On track",
  PUSH: "Push needed",
  AT_RISK: "At risk",
  NOT_POSSIBLE: "Cannot reach",
};

export const STATUS_COLOR: Record<TargetStatus, { bg: string; fg: string }> = {
  ACHIEVED: { bg: "#dcfce7", fg: "#166534" },
  ON_TRACK: { bg: "#e0f2fe", fg: "#075985" },
  PUSH: { bg: "#fef3c7", fg: "#92400e" },
  AT_RISK: { bg: "#ffedd5", fg: "#9a3412" },
  NOT_POSSIBLE: { bg: "#fee2e2", fg: "#991b1b" },
};

/** One line of plain advice for the engineer's next working day. */
export function nextDayAdvice(a: EngineerTargetAnalysis): string {
  if (a.status === "ACHIEVED") {
    return `Monthly target met (${a.periodClosed}). Anything more is a bonus.`;
  }
  if (a.neededPerDay === null) {
    return `No working days left — finished ${a.remainingToTarget} short.`;
  }
  if (a.status === "NOT_POSSIBLE") {
    return `Would need ${a.neededPerDay}/day for ${a.remainingDays} days — not reachable.`;
  }
  const pace =
    a.gap >= 0
      ? `${a.gap} ahead of pace`
      : `${Math.abs(a.gap)} behind pace`;
  return `${pace}. Close ${a.neededPerDay}/day for the remaining ${a.remainingDays} days.`;
}
