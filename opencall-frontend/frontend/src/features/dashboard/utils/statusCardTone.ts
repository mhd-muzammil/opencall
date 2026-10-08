import type { CSSProperties } from "react";
import {
  STATUS_BUCKETS,
  getCustomBodEodRows,
  getMappedStatusBucket,
  isStatusBucket,
  statusInBodEodRow,
  type StatusBucket,
} from "@opencall/shared";

// The colour of an RTPL status card: one of three groups, decided by the BOD/EOD
// row the status counts under (chosen on the RTPL Statuses page), so a new
// status lands in the right group without a code change.
//
//   Planned (blue)   booked or about to be: Scheduled, To be schedule, Onsite,
//                    Engineer Delay (the booking stands, the engineer is late)
//   Closed  (green)  finished today
//   Pending (orange) everything still waiting on someone

export interface CardTone {
  /** Left edge and the number. */
  accent: string;
  /** Card background. */
  tint: string;
}

export const CARD_TONES = {
  planned: { accent: "#2563eb", tint: "#eff6ff" },
  closed: { accent: "#16a34a", tint: "#f0fdf4" },
  pending: { accent: "#ea580c", tint: "#fff7ed" },
} as const satisfies Record<string, CardTone>;

const PLANNED_ROWS: ReadonlySet<StatusBucket> = new Set(["SCHEDULED", "TO_BE_SCHEDULE", "ONSITE", "ENGINEER_DELAY"]);

function toneForRow(row: StatusBucket): CardTone {
  if (row === "CLOSED") return CARD_TONES.closed;
  if (PLANNED_ROWS.has(row)) return CARD_TONES.planned;
  return CARD_TONES.pending;
}

export function statusCardTone(status: string): CardTone {
  const mapped = getMappedStatusBucket(status);
  if (mapped) {
    if (isStatusBucket(mapped)) return toneForRow(mapped);
    // A row an admin added: planned only if its calls count as not yet scheduled.
    const custom = getCustomBodEodRows({ includeHidden: true }).find((row) => row.key === mapped);
    return custom?.productivityBucket === "SCHEDULED" ? CARD_TONES.planned : CARD_TONES.pending;
  }
  // Not in the admin list: the row the old keyword rules put it in, if any.
  const legacy = STATUS_BUCKETS.find((bucket) => bucket !== "OTHER" && statusInBodEodRow(status, bucket));
  return legacy ? toneForRow(legacy) : CARD_TONES.pending;
}

/** Inline style for a toned .rtplMetricCard (see .rtplMetricCard.toned). */
export function cardToneStyle(tone: CardTone): CSSProperties {
  return { ["--card-accent" as string]: tone.accent, ["--card-tint" as string]: tone.tint };
}
