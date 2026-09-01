/**
 * The target cycle: the 24th of one month to the 25th of the next.
 *
 * Engineer targets are not counted over a calendar month. The cycle runs 24th to 25th, and
 * the Target tab opened on "1st of this month to today" — which on the 1st is a single day,
 * reads as everybody having closed almost nothing, and is a month out of step with the
 * period the target is actually set over.
 *
 * A cycle is named by the month it ENDS in: the cycle ending 25 September starts 24 August.
 * That is the one to open on, because it is the cycle running now.
 */

/** Today in IST, as YYYY-MM-DD. The office's day, not the server's. */
export function todayIsoIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface TargetCycle {
  /** 24th of the month before `to`. */
  from: string;
  /** 25th of the month this cycle is named by. */
  to: string;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function iso(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

/**
 * The cycle that ends on the 25th of the given month.
 *
 * `monthIndex` is 0-based, and passing 0 (January) rolls the start back into December of the
 * year before — which is why the arithmetic goes through `new Date` rather than subtracting
 * one from the month and hoping.
 */
export function cycleEndingIn(year: number, monthIndex: number): TargetCycle {
  const start = new Date(year, monthIndex - 1, 24);
  return {
    from: iso(start.getFullYear(), start.getMonth(), 24),
    to: iso(year, monthIndex, 25),
  };
}

/**
 * The cycle to open on: the one ending on the 25th of the month we are in.
 *
 * Its `to` is in the future for most of the month, and that is correct — the cycle has not
 * finished. The table counts the report days that exist inside the range, so a `to` nobody
 * has reached yet adds no days and changes no number.
 */
export function currentTargetCycle(today: string = todayIsoIst()): TargetCycle {
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    // An unreadable date is not worth guessing a cycle from; fall back to the real today.
    return currentTargetCycle(todayIsoIst());
  }
  return cycleEndingIn(year, monthIndex);
}

/** "24 Aug – 25 Sep", or "24 Dec 25 – 25 Jan 26" when the cycle crosses a year. */
export function cycleLabel(cycle: TargetCycle): string {
  const [fromYear, fromMonth, fromDay] = cycle.from.split("-");
  const [toYear, toMonth, toDay] = cycle.to.split("-");
  const from = `${Number(fromDay)} ${MONTH_NAMES[Number(fromMonth) - 1] ?? fromMonth}`;
  const to = `${Number(toDay)} ${MONTH_NAMES[Number(toMonth) - 1] ?? toMonth}`;
  // The year is only worth the width when the two halves disagree about it.
  return fromYear === toYear
    ? `${from} – ${to}`
    : `${from} ${fromYear?.slice(2)} – ${to} ${toYear?.slice(2)}`;
}

/**
 * The current cycle and the ones before it, newest first.
 *
 * For the picker. Six is a half-year of history, which is as far back as anybody has asked
 * to compare and short enough to read without scrolling.
 */
export function recentTargetCycles(count = 6, today: string = todayIsoIst()): TargetCycle[] {
  const year = Number(today.slice(0, 4));
  const monthIndex = Number(today.slice(5, 7)) - 1;
  const cycles: TargetCycle[] = [];
  for (let back = 0; back < Math.max(1, count); back += 1) {
    const anchor = new Date(year, monthIndex - back, 1);
    cycles.push(cycleEndingIn(anchor.getFullYear(), anchor.getMonth()));
  }
  return cycles;
}
