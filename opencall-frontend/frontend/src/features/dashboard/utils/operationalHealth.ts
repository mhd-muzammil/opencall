// Operational-health metrics for the dashboard overview header.
//
// Replaces the static volume totals (Today/Closed/Duplicates/Manual) with
// "what needs attention now" signals computed over the open active rows:
//   - Actionable Now    — Scheduled + To Be Scheduled calls, ready to act on
//   - Aged / At-risk     — calls whose WIP aging has crossed the SLA threshold
//   - Awaiting Customer  — calls blocked on the customer (not on us)
//   - Unassigned         — open calls with no engineer assigned yet
//
// Status/aging matching mirrors useKpiMetrics so the headline cards agree with
// the per-region KPI modal. Each bucket also returns the distinct raw column
// values it matched so the cards can filter the records table on click.
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import type { ReportRow } from "../types";
import { isActionableStatusValue, parseWipAgingValue } from "./reportUtils";

export const DEFAULT_AGING_THRESHOLD = 10;
const PLANNED_KEYWORDS = ["assigned", "scheduled", "onsite"];
const PLANNED_EXCLUDES = ["pending", "to be"];
const PART_PENDING_KEYWORDS = ["Part Pending"];
const PART_PENDING_EXCLUDES = ["Order"];
const PART_ORDER_PENDING_KEYWORDS = ["Part Order Pending"];

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
  planned: OperationalBucket;
  partPending: OperationalBucket & {
    partPendingCount: number;
    partPendingValues: string[];
    partOrderPendingCount: number;
    partOrderPendingValues: string[];
  };
  aged: OperationalBucket & {
    threshold: number;
    aged5PlusCount: number;
    aged5PlusValues: string[];
    aged7PlusCount: number;
    aged7PlusValues: string[];
    aged10PlusCount: number;
    aged10PlusValues: string[];
  };
  unassigned: OperationalBucket;
}

export function computeOperationalHealth(
  activeRows: readonly ReportRow[],
  agingThreshold: number = DEFAULT_AGING_THRESHOLD,
): OperationalHealth {
  const actionableValues = new Set<string>();
  const plannedValues = new Set<string>();
  const partPendingValues = new Set<string>();
  const partPendingOnlyValues = new Set<string>();
  const partOrderPendingValues = new Set<string>();
  const agedValues = new Set<string>();
  const aged5PlusValues = new Set<string>();
  const aged7PlusValues = new Set<string>();
  const aged10PlusValues = new Set<string>();
  const unassignedValues = new Set<string>();
  let actionableCount = 0;
  let plannedCount = 0;
  let partPendingCount = 0;
  let partOrderPendingCount = 0;
  let agedCount = 0;
  let aged5PlusCount = 0;
  let aged7PlusCount = 0;
  let aged10PlusCount = 0;
  let unassignedCount = 0;

  for (const row of activeRows) {
    const status = rtplStatusOf(row);
    // Actionable = "Scheduled" + "To Be Scheduled" (see isActionableStatusValue).
    if (isActionableStatusValue(status)) {
      actionableCount += 1;
      actionableValues.add(status);
    }
    if (statusMatches(status, PLANNED_KEYWORDS, PLANNED_EXCLUDES)) {
      plannedCount += 1;
      plannedValues.add(status);
    }
    
    // Check Part Pending (excludes Order to prevent double matching)
    if (statusMatches(status, PART_PENDING_KEYWORDS, PART_PENDING_EXCLUDES)) {
      partPendingCount += 1;
      partPendingValues.add(status);
      partPendingOnlyValues.add(status);
    }
    
    // Check Part Order Pending
    if (statusMatches(status, PART_ORDER_PENDING_KEYWORDS)) {
      partOrderPendingCount += 1;
      partPendingValues.add(status);
      partOrderPendingValues.add(status);
    }

    const aging = parseWipAgingValue(row.output["WIP aging"]);
    if (aging !== null) {
      const agingStr = String(row.output["WIP aging"] ?? "").trim();
      if (aging >= agingThreshold) {
        agedCount += 1;
        agedValues.add(agingStr);
      }
      if (aging >= 5) {
        aged5PlusCount += 1;
        aged5PlusValues.add(agingStr);
      }
      if (aging >= 7) {
        aged7PlusCount += 1;
        aged7PlusValues.add(agingStr);
      }
      if (aging >= 10) {
        aged10PlusCount += 1;
        aged10PlusValues.add(agingStr);
      }
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
    planned: { count: plannedCount, values: Array.from(plannedValues) },
    partPending: {
      count: partPendingCount + partOrderPendingCount,
      values: Array.from(partPendingValues),
      partPendingCount,
      partPendingValues: Array.from(partPendingOnlyValues),
      partOrderPendingCount,
      partOrderPendingValues: Array.from(partOrderPendingValues),
    },
    aged: {
      count: agedCount,
      values: Array.from(agedValues),
      threshold: agingThreshold,
      aged5PlusCount,
      aged5PlusValues: Array.from(aged5PlusValues),
      aged7PlusCount,
      aged7PlusValues: Array.from(aged7PlusValues),
      aged10PlusCount,
      aged10PlusValues: Array.from(aged10PlusValues),
    },
    unassigned: { count: unassignedCount, values: Array.from(unassignedValues) },
  };
}
