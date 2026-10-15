import type { CasesByDayCell, EngineerKmDays } from "../../../lib/payrollTrackingApiClient";

/**
 * CASES: under each FSE-day's km, in all three KM Report tables, that day's
 * cases and how many of them were closed that day -- the live tracking board's
 * day panel, its "CASES (N)" list and its "Closed" rows, as Payroll counts
 * them. The panel asks once a cycle and hands the answer to every table; this
 * is how each of them prints it, so the three read alike.
 */

/** Each FSE's cases per YYYY-MM-DD, by Payroll employee id. */
export type CasesById = ReadonlyMap<number, Record<string, CasesByDayCell>>;

const count = (value: unknown) => Number(value) || 0;

/** "4 cases, 1 closed", for a day cell's title and aria-label; "" on a day with none, or none known. */
export function casesWords(cell: CasesByDayCell | undefined): string {
  const cases = count(cell?.cases);
  if (cases <= 0) return "";
  return `${cases} ${cases === 1 ? "case" : "cases"}, ${count(cell?.closed)} closed`;
}

// One line's height, set on the line and on the empty line alike, so a day
// with cases and one without stand level in a row.
const LINE_HEIGHT = 16;

/**
 * The second line under a day's km: "4 · 1 closed". Nothing at all when the
 * FSE's days are not known. On a known day with no cases, an empty line of the
 * same height, with no text: the km then sits where its neighbours' do, and a
 * copied or read cell says nothing more than before. Hidden from a reader
 * where the cell's button or label already says it in words (`labelled`);
 * read as it is where nothing else does. Like the marks beside a km, left out
 * when the km is selected and copied.
 */
export function CasesLine({
  cell,
  picked = false,
  labelled = true,
}: {
  cell: CasesByDayCell | undefined;
  picked?: boolean;
  labelled?: boolean;
}) {
  if (!cell) return null;
  const cases = count(cell.cases);
  if (cases <= 0) {
    return <span aria-hidden="true" data-testid="km-cases-none" style={{ display: "block", height: LINE_HEIGHT }} />;
  }
  return (
    <span
      {...(labelled ? { "aria-hidden": true } : {})}
      data-testid="km-cases"
      style={{
        display: "block",
        height: LINE_HEIGHT,
        lineHeight: `${LINE_HEIGHT}px`,
        fontSize: 11,
        fontWeight: 400,
        // Grey on white; on a picked day's blue, as light as the picked
        // region box's own small line.
        color: picked ? "rgba(255,255,255,0.85)" : "#6b7280",
        fontVariantNumeric: "tabular-nums",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {`${cases} · ${count(cell.closed)} closed`}
    </span>
  );
}

/**
 * One FSE's cases and closed over the days on screen. Null when Payroll said
 * nothing for them: the Cases column leaves that blank rather than print a 0.
 */
export function casesRowTotal(
  days: Record<string, CasesByDayCell> | undefined,
  shownDays: string[],
): CasesByDayCell | null {
  if (!days) return null;
  let cases = 0;
  let closed = 0;
  for (const day of shownDays) {
    cases += count(days[day]?.cases);
    closed += count(days[day]?.closed);
  }
  return { cases, closed };
}

/**
 * The Cases column's footer: every FSE on screen, each engineer once -- two
 * register names Payroll resolves to one engineer are one engineer's cases,
 * not twice as many. Null when none of them is known.
 */
export function casesTotals(
  rows: Pick<EngineerKmDays, "engineer_id">[],
  shownDays: string[],
  casesById: CasesById,
): CasesByDayCell | null {
  let known = false;
  let cases = 0;
  let closed = 0;
  const counted = new Set<number>();
  for (const row of rows) {
    if (row.engineer_id == null || counted.has(row.engineer_id)) continue;
    counted.add(row.engineer_id);
    const one = casesRowTotal(casesById.get(row.engineer_id), shownDays);
    if (!one) continue;
    known = true;
    cases += one.cases;
    closed += one.closed;
  }
  return known ? { cases, closed } : null;
}

/** A Cases column cell: "12 · 3 closed"; "" when not known. */
export const casesTotalText = (total: CasesByDayCell | null): string =>
  total ? `${total.cases} · ${total.closed} closed` : "";
