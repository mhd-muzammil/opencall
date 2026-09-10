// Shared shapes for the Closed Calls page.
//
// The page shows FOUR different closed counts from four different systems, and the whole
// point of the redesign is that a reader can always tell which one they are looking at.
// These types keep that distinction in the type system rather than in prose.
import type { ClosureOutcome } from "../closureOutcome";

/** One region as the report's own breakdown describes it. */
export interface ClosedRegionEntry {
  aspCode: string;
  regionName: string;
  /** All-time closed count for the region (the ledger never prunes). */
  closedCount: number;
  activeCount: number;
}

/** The completed / cancelled / unknown split of OUR closed rows for one scope. */
export interface OursOutcome {
  closed: number;
  cancelled: number;
  /** Flex has not reported a closure for these yet — deliberately neither of the above. */
  unknown: number;
  /**
   * Of `closed`, how many carry NO engineer in OpenCall — blank, or still the
   * "Manual Entry Required" placeholder.
   *
   * A completion nobody is named on is work the vendor was paid for that our own
   * productivity model can never credit: it only counts calls booked to an engineer.
   * It is a property of our rows alone — FieldEZ and the raw export carry no engineer —
   * which is why it hangs off this split rather than the comparison sources.
   */
  closedWithoutEngineer: number;
}

/** Which system a number came from. Drives its colour and its drill-down. */
export type ClosedSourceKind = "ours" | "fieldez" | "raw";

/** How much of the chosen period a source can actually answer for. */
export interface CoverageTag {
  label: string;
  /** `warn` is the amber "this does not answer the dates you picked" state. */
  tone: "plain" | "warn";
  /** Said next to the tag, in words. "" when the tag alone is the whole story. */
  note: string;
}

/** The reconciliation buckets, including the fourth "no report row at all" one. */
export type ReconBucketKey =
  | "matched"
  | "closedHereNotInFlex"
  | "closedInFlexNotHere"
  | "closedInFlexNoRow";

/**
 * An open drill-down.
 *
 * `ours` is answered from the rows already in memory; `fieldez` / `raw` fetch their own
 * records; `recon` reads the reconciliation result the panel already holds. In every case
 * the modal shows exactly the rows the clicked number counted.
 */
export type DrillState =
  | {
      kind: "ours";
      /** "unassigned" is the completions with no engineer, not every unassigned row. */
      outcome: "all" | "closed" | "cancelled" | "unknown" | "unassigned";
      aspCode: string;
      label: string;
    }
  | {
      kind: "fieldez" | "raw";
      outcome: "closed" | "cancelled";
      aspCode: string;
      label: string;
    }
  | { kind: "recon"; bucket: ReconBucketKey };

/** What one source block / region comparison row needs to render itself. */
export interface SourceFigures {
  /** null when the source has never been imported — the line is hidden, not zeroed. */
  outcome: ClosureOutcome | null;
  coverage: CoverageTag;
}
