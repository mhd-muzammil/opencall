/**
 * The date range the CAB view opens on, and the arithmetic behind it.
 *
 * Cab mail is looked at as a period — what was spent over the last couple of months — where
 * the rest of the inbox is looked at as "what came in". So this view starts on a range
 * rather than on everything, and the range is the reader's to change.
 *
 * LOCAL DATES, DELIBERATELY. What somebody means by "27 August" is the day they are living
 * in, and turning that into an instant is the server's job — it knows the range is in IST
 * and where the day boundary falls. Formatting with `toISOString()` here would hand over
 * yesterday's date for anybody looking before half past five in the morning.
 */

/**
 * How far back the CAB view reaches before anybody touches it.
 *
 * Must match how far back the backfill script has actually fetched. Showing a wider window
 * than exists reads as "there was no mail" for the months nobody has pulled in yet, which is
 * a far worse answer than a shorter window honestly stated.
 */
export const DEFAULT_CAB_MONTHS = 3;

/** `2026-08-27` from a Date, read in the reader's own timezone. */
export function toIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The same day-of-month `months` earlier, or the last day of that month when it has no such
 * day.
 *
 * `setMonth` alone rolls over: asking for one month before 31 March gives 3 March, because
 * February has no 31st and the surplus days spill forward. A range that silently starts
 * three days late is the kind of wrong nobody notices until a total is questioned.
 */
export function monthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
  return target;
}

export interface CabDateRange {
  from: string;
  to: string;
}

/** Two months back to today, which is what the view opens on. */
export function defaultCabRange(today: Date = new Date()): CabDateRange {
  return {
    from: toIsoDay(monthsBefore(today, DEFAULT_CAB_MONTHS)),
    to: toIsoDay(today),
  };
}

/**
 * A range the server can be asked for, or null.
 *
 * Null rather than a corrected range when the dates are the wrong way round: swapping them
 * quietly would show a reader a period they did not ask for and did not notice choosing.
 * Null means the caller leaves the range off and says why.
 */
export function normalizeCabRange(from: string, to: string): CabDateRange | null {
  const clean = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "");
  const start = clean(from);
  const end = clean(to);
  if (!start || !end) return null;
  if (start > end) return null;
  return { from: start, to: end };
}
