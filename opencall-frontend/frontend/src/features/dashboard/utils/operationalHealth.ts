// Operational-health metrics for the dashboard overview header.
//
// Replaces the static volume totals (Today/Closed/Duplicates/Manual) with
// "what needs attention now" signals computed over the open active rows:
//   - Actionable Now    — calls in an actionable status, ready to dispatch
//   - Aged / At-risk     — calls whose WIP aging has crossed the SLA threshold
//   - Awaiting Customer  — calls blocked on the customer (not on us)
//   - Unassigned         — open calls with no engineer assigned yet
//
// Status/aging matching mirrors useKpiMetrics so the headline cards agree with
// the per-region KPI modal. Each bucket also returns the distinct raw column
// values it matched so the cards can filter the records table on click.
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import type { ReportRow } from "../types";
import { parseWipAgingValue } from "./reportUtils";

export const DEFAULT_AGING_THRESHOLD = 10;

const ACTIONABLE_KEYWORDS = ["actionable"];
const ACTIONABLE_EXCLUDES = ["customer", "cust", "cx", "delay", "pending"];
const AWAITING_CUSTOMER_KEYWORDS = [
  "cx pending",
  "reschedule",
  "cx",
  "cust delay",
  "customer delay",
  "customer pending",
];

const MANUAL_ENTRY_LOWER = MANUAL_ENTRY_REQUIRED.toLowerCase();

function rtplStatusOf(row: ReportRow): string {
  return String(row.output["RTPL status"] ?? "").trim();
}

function engineerOf(row: ReportRow): string {
  return String(row.output.Engineer ?? "").trim();
}

function statusMatches(
  status: string,
  keywords: readonly string[],
  excludes: readonly string[] = [],
): boolean {
  const s = status.toLowerCase();
  if (!s || s === MANUAL_ENTRY_LOWER) return false;
  const hit = keywords.some((kw) => s.includes(kw.toLowerCase()));
  const blocked = excludes.some((ex) => s.includes(ex.toLowerCase()));
  return hit && !blocked;
}

export interface OperationalBucket {
  count: number;
  /** Distinct raw column values matched — used to filter the records table. */
  values: string[];
}

export interface OperationalHealth {
  openCount: number;
  actionable: OperationalBucket;
  awaitingCustomer: OperationalBucket;
  aged: OperationalBucket & { threshold: number };
  unassigned: OperationalBucket;
}

export function computeOperationalHealth(
  activeRows: readonly ReportRow[],
  agingThreshold: number = DEFAULT_AGING_THRESHOLD,
): OperationalHealth {
  const actionableValues = new Set<string>();
  const awaitingValues = new Set<string>();
  const agedValues = new Set<string>();
  const unassignedValues = new Set<string>();
  let actionableCount = 0;
  let awaitingCount = 0;
  let agedCount = 0;
  let unassignedCount = 0;

  for (const row of activeRows) {
    const status = rtplStatusOf(row);
    if (statusMatches(status, ACTIONABLE_KEYWORDS, ACTIONABLE_EXCLUDES)) {
      actionableCount += 1;
      actionableValues.add(status);
    }
    if (statusMatches(status, AWAITING_CUSTOMER_KEYWORDS)) {
      awaitingCount += 1;
      awaitingValues.add(status);
    }

    const aging = parseWipAgingValue(row.output["WIP aging"]);
    if (aging !== null && aging >= agingThreshold) {
      agedCount += 1;
      agedValues.add(String(row.output["WIP aging"] ?? "").trim());
    }

    // "Unassigned" = no real engineer yet. The backend writes the placeholder
    // "Manual Entry Required" (or leaves it blank) until a human assigns one.
    const engineer = engineerOf(row);
    if (!engineer || engineer === MANUAL_ENTRY_REQUIRED) {
      unassignedCount += 1;
      unassignedValues.add(engineer);
    }
  }

  const openCount = activeRows.length;

  return {
    openCount,
    actionable: { count: actionableCount, values: Array.from(actionableValues) },
    awaitingCustomer: { count: awaitingCount, values: Array.from(awaitingValues) },
    aged: { count: agedCount, values: Array.from(agedValues), threshold: agingThreshold },
    unassigned: { count: unassignedCount, values: Array.from(unassignedValues) },
  };
}
