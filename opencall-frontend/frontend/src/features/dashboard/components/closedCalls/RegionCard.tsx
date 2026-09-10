import React from "react";
import { formatNumber } from "../../utils";
import type { ClosureOutcome } from "../closureOutcome";
import type { DrillState, OursOutcome } from "./types";

/**
 * One region's closed count, with the same two comparison sources as the header blocks.
 *
 * The card itself selects the region; the numbers inside it open their own records. Both
 * are real controls, so the card is a `role="button"` div rather than a `<button>` — a
 * button inside a button is invalid HTML and browsers disagree about which one fires.
 */
export function RegionCard({
  aspCode,
  label,
  subLabel,
  count,
  split,
  fieldez,
  raw,
  rawMonthLevel,
  selected,
  isAll,
  onSelect,
  onDrill,
}: Readonly<{
  /** The ASP this card scopes its drill-downs to. "" is the All Regions rollup. */
  aspCode: string;
  label: string;
  /** The ASP code for a region, or "N / M regions" on the rollup card. */
  subLabel: string;
  /** OUR closed count for this scope — `closedCountFor`, so the cards always sum to ALL. */
  count: number;
  split: OursOutcome;
  /** null when the source has never been imported: the row is hidden, never zeroed. */
  fieldez: ClosureOutcome | null;
  raw: ClosureOutcome | null;
  /** The raw number covers whole months rather than the dates picked. */
  rawMonthLevel: boolean;
  selected: boolean;
  isAll: boolean;
  onSelect: () => void;
  onDrill: (drill: DrillState) => void;
}>) {
  const delta = fieldez ? fieldez.closed - split.closed : null;
  const deltaTone = delta === null ? "" : delta > 0 ? "ccNeg" : delta < 0 ? "ccPos" : "ccZero";

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`ccCard ccRegionCard${selected ? " ccOn" : ""}${isAll ? " ccAll" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="ccNm">
        {label}
        <span>{subLabel}</span>
      </div>

      <div className="ccN">
        {formatNumber(count)} <small>closed</small>
      </div>

      <div className="ccOs">
        {formatNumber(split.closed)} closed · {formatNumber(split.cancelled)} cancelled
        {split.unknown > 0 ? ` · ${formatNumber(split.unknown)} unknown` : ""}
      </div>

      {fieldez && (
        <div className="ccCmp">
          <span className="ccK">
            <i className="ccSwatchFieldez" />
            FieldEZ
          </span>
          <span>
            <button
              type="button"
              disabled={fieldez.closed === 0}
              onClick={(event) => {
                stop(event);
                onDrill({
                  kind: "fieldez",
                  outcome: "closed",
                  aspCode,
                  label,
                });
              }}
            >
              <b>{formatNumber(fieldez.closed)}</b>
            </button>
            {fieldez.hasSplit && (
              <button
                type="button"
                className="ccSub"
                disabled={fieldez.cancelled === 0}
                title="Closed - Canceled in Flex — abandoned, not billable"
                onClick={(event) => {
                  stop(event);
                  onDrill({
                    kind: "fieldez",
                    outcome: "cancelled",
                    aspCode,
                    label,
                  });
                }}
              >
                +{formatNumber(fieldez.cancelled)}
              </button>
            )}
            {delta !== null && (
              <span
                className={`ccDiff ${deltaTone}`}
                title="FieldEZ completions minus ours, for this period"
              >
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </span>
        </div>
      )}

      {raw && (
        <div className="ccCmp">
          <span className="ccK">
            <i className="ccSwatchRaw" />
            Raw
          </span>
          <span>
            <button
              type="button"
              disabled={raw.closed === 0}
              onClick={(event) => {
                stop(event);
                onDrill({ kind: "raw", outcome: "closed", aspCode, label });
              }}
            >
              <b>{formatNumber(raw.closed)}</b>
            </button>
            {raw.hasSplit && (
              <button
                type="button"
                className="ccSub"
                disabled={raw.cancelled === 0}
                onClick={(event) => {
                  stop(event);
                  onDrill({ kind: "raw", outcome: "cancelled", aspCode, label });
                }}
              >
                +{formatNumber(raw.cancelled)}
              </button>
            )}
            {rawMonthLevel && (
              <span
                className="ccTag ccWarn ccDiff"
                title="Raw data is stored per month, so this covers whole months rather than the dates picked"
              >
                month
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
