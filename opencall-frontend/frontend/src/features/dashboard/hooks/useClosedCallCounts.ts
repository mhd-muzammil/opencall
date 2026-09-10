// OUR closed count, and the only place it is derived.
//
// Everything the Closed Calls page says about its own closures — the source block, every
// region card, the ledger's "in period" line, the drill-downs — comes out of this hook. It
// is one hook rather than a resolver per surface because the rollup once showed today's
// closures while each region card showed its all-time ledger, and the parts came to 1,874
// against a whole of 4. One period predicate, one pass, one resolver.
//
// The three IMPORTED sources are a separate question and live in useClosedCallSources.
import { useMemo } from "react";
import { classifyFlexClosureOutcome, hasFlexClosureOutcome } from "@opencall/shared";
import type { ReportRow } from "../types";
import type { ClosedCallsPeriodPreset } from "../utils/closedCallsPeriod";
import { isEngineerAssigned } from "../utils/reportUtils";
import { getRowAspCode, rowOutput } from "../components/closedCalls/rowFields";
import type { DrillState, OursOutcome } from "../components/closedCalls/types";

export interface ClosedCallCounts {
  /** The number ONE card shows: the rollup (aspCode "") or a single region. */
  closedCountFor: (aspCode: string, allTimeCount: number) => number;
  /** Completed / cancelled / unknown under that number. */
  oursOutcomeFor: (aspCode: string, total: number) => OursOutcome;
  /** Every closed row in the period and the selected region. Search is applied later. */
  periodRegionRows: ReportRow[];
  /** The rows behind a drill-down, narrowed by exactly the predicates the number used. */
  oursDrillRows: (drill: DrillState | null) => ReportRow[];
}

export function useClosedCallCounts(params: {
  closedRows: readonly ReportRow[];
  rowInPeriod: (row: ReportRow) => boolean;
  periodPreset: ClosedCallsPeriodPreset;
  /** "" for the All Regions rollup. */
  selectedAsp: string;
}): ClosedCallCounts {
  const { closedRows, rowInPeriod, periodPreset, selectedAsp } = params;

  /**
   * Every closed row the period admits, grouped by ASP, in ONE pass.
   *
   * `rowInPeriod` already encodes all three counting rules — the report-day rule for
   * today, Case Closed Date for a cycle or a custom range — so one map answers for every
   * preset instead of three that could disagree at the edges.
   */
  const periodCounts = useMemo(() => {
    const byAsp = new Map<string, number>();
    let total = 0;
    for (const row of closedRows) {
      if (!rowInPeriod(row)) continue;
      const asp = getRowAspCode(rowOutput(row));
      byAsp.set(asp, (byAsp.get(asp) ?? 0) + 1);
      total += 1;
    }
    return { byAsp, total };
  }, [closedRows, rowInPeriod]);

  const closedCountFor = useMemo(() => {
    return (aspCode: string, allTimeCount: number): number => {
      // "All dates" answers with the backend's own ledger total, which is what this page
      // has always shown there; every other period counts the rows the predicate admits.
      if (periodPreset === "all") return allTimeCount;
      return aspCode ? periodCounts.byAsp.get(aspCode) ?? 0 : periodCounts.total;
    };
  }, [periodPreset, periodCounts]);

  /**
   * Completed vs cancelled, per region.
   *
   * Only "WO Closed" is a finished job — the one that gets paid for; "Closed - Canceled"
   * is an abandoned call and is never counted with it. A closed row whose Flex Status was
   * never overlaid has no closure record yet, so the vendor has not told us how it ended:
   * it is UNKNOWN, not assumed billable.
   */
  const oursOutcomeByAsp = useMemo(() => {
    const counts = new Map<
      string,
      { closed: number; cancelled: number; closedWithoutEngineer: number }
    >();
    for (const row of closedRows) {
      if (!rowInPeriod(row)) continue;
      const output = rowOutput(row);
      if (!hasFlexClosureOutcome(output)) continue;
      const outcome = classifyFlexClosureOutcome(output["Flex Status"]);
      if (outcome === "other") continue;
      const asp = getRowAspCode(output);
      const entry = counts.get(asp) ?? {
        closed: 0,
        cancelled: 0,
        closedWithoutEngineer: 0,
      };
      entry[outcome] += 1;
      // Only completions are asked the engineer question: a cancelled call was never
      // worked, so nobody being named on it says nothing.
      if (outcome === "closed" && !isEngineerAssigned(row)) {
        entry.closedWithoutEngineer += 1;
      }
      counts.set(asp, entry);
    }
    return counts;
  }, [closedRows, rowInPeriod]);

  const oursOutcomeFor = useMemo(() => {
    return (aspCode: string, total: number): OursOutcome => {
      let closed = 0;
      let cancelled = 0;
      let closedWithoutEngineer = 0;
      if (aspCode) {
        const entry = oursOutcomeByAsp.get(aspCode);
        closed = entry?.closed ?? 0;
        cancelled = entry?.cancelled ?? 0;
        closedWithoutEngineer = entry?.closedWithoutEngineer ?? 0;
      } else {
        for (const entry of oursOutcomeByAsp.values()) {
          closed += entry.closed;
          cancelled += entry.cancelled;
          closedWithoutEngineer += entry.closedWithoutEngineer;
        }
      }
      // Unknown is the remainder of the card's OWN total, so the three parts always add up
      // to the headline even if the ledger and the region breakdown ever drift apart.
      return {
        closed,
        cancelled,
        unknown: Math.max(0, total - closed - cancelled),
        closedWithoutEngineer,
      };
    };
  }, [oursOutcomeByAsp]);

  const periodRegionRows = useMemo(() => {
    return closedRows.filter((row) => {
      if (!rowInPeriod(row)) return false;
      if (!selectedAsp) return true;
      return getRowAspCode(rowOutput(row)) === selectedAsp;
    });
  }, [closedRows, rowInPeriod, selectedAsp]);

  const oursDrillRows = useMemo(() => {
    return (drill: DrillState | null): ReportRow[] => {
      if (!drill || drill.kind !== "ours") return [];
      return closedRows.filter((row) => {
        if (!rowInPeriod(row)) return false;
        const output = rowOutput(row);
        const asp = drill.aspCode || selectedAsp;
        if (asp && getRowAspCode(output) !== asp) return false;
        if (drill.outcome === "all") return true;
        const reported = hasFlexClosureOutcome(output);
        const outcome = reported
          ? classifyFlexClosureOutcome(output["Flex Status"])
          : "other";
        if (drill.outcome === "closed") return reported && outcome === "closed";
        if (drill.outcome === "cancelled") return reported && outcome === "cancelled";
        // The completions nobody is named on — the same rows the coverage line counts.
        if (drill.outcome === "unassigned") {
          return reported && outcome === "closed" && !isEngineerAssigned(row);
        }
        // Unknown is everything the vendor has not reported on, which is exactly the
        // remainder the card counts.
        return !reported || outcome === "other";
      });
    };
  }, [closedRows, rowInPeriod, selectedAsp]);

  return { closedCountFor, oursOutcomeFor, periodRegionRows, oursDrillRows };
}
