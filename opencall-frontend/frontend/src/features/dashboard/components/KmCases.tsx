import type { CasesByDayCell, EngineerKmDays } from "../../../lib/payrollTrackingApiClient";

/**
 * CASES: in every FSE-day cell of the three KM Report tables, the day as the
 * office asked to read it (15 Oct 2026):
 *
 *     km 65.39
 *     assign 8
 *     visits 3
 *
 * "assign" is that day's cases and "visits" the ones closed that day -- the
 * live tracking board's day panel, its "CASES (N)" list and its "Closed" rows,
 * as Payroll counts them. The panel asks once a cycle and hands the answer to
 * every table; this is how each of them prints it, so the three read alike.
 */

/** Each FSE's cases per YYYY-MM-DD, by Payroll employee id. */
export type CasesById = ReadonlyMap<number, Record<string, CasesByDayCell>>;

const count = (value: unknown) => Number(value) || 0;

/** "assign 8, visits 3", for a day cell's title and aria-label; "" on a day with none, or none known. */
export function casesWords(cell: CasesByDayCell | undefined): string {
  const cases = count(cell?.cases);
  if (cases <= 0) return "";
  return `assign ${cases}, visits ${count(cell?.closed)}`;
}

// One line's height, the same on every line, so the days in a row stand level.
const LINE_HEIGHT = 16;

const smallLine = (picked: boolean) =>
  ({
    display: "block",
    height: LINE_HEIGHT,
    lineHeight: `${LINE_HEIGHT}px`,
    fontSize: 11,
    fontWeight: 400,
    // Grey on white; on a picked day's blue, as light as the picked region
    // box's own small line.
    color: picked ? "rgba(255,255,255,0.85)" : "#6b7280",
    fontVariantNumeric: "tabular-nums",
    userSelect: "none",
    WebkitUserSelect: "none",
  }) as const;

/**
 * The "km" before a day's figure. Grey, so the figure still reads first; left
 * out when the figure is selected and copied; not read out, as every label
 * already says "km".
 */
export function KmLabel({ picked = false }: { picked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="km-label"
      style={{
        marginRight: 4,
        fontWeight: 400,
        color: picked ? "rgba(255,255,255,0.85)" : "#6b7280",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      km
    </span>
  );
}

/**
 * The two lines under a day's km: "assign 8" and "visits 3". Nothing at all
 * when the FSE's days are not known. On a known day with no cases, empty lines
 * of the same height, with no text: the km then sits where its neighbours' do,
 * and a copied or read cell says nothing more than before. Hidden from a
 * reader where the cell's button or label already says it in words
 * (`labelled`); read as it is where nothing else does.
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
  if (count(cell.cases) <= 0) {
    return <span aria-hidden="true" data-testid="km-cases-none" style={{ display: "block", height: 2 * LINE_HEIGHT }} />;
  }
  return (
    <span {...(labelled ? { "aria-hidden": true } : {})} data-testid="km-cases" style={{ display: "block" }}>
      <span data-testid="km-assign" style={smallLine(picked)}>{`assign ${count(cell.cases)}`}</span>
      <span data-testid="km-closed" style={smallLine(picked)}>{`visits ${count(cell.closed)}`}</span>
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

/** A Cases column cell: "assign 12 · visits 3"; nothing when not known. */
export function CasesTotal({ total }: { total: CasesByDayCell | null }) {
  return total ? <>{`assign ${total.cases} · visits ${total.closed}`}</> : null;
}
