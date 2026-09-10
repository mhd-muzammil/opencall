import React from "react";
import type { ClosureOutcome } from "../closureOutcome";
import { RegionCard } from "./RegionCard";
import type { ClosedRegionEntry, DrillState, OursOutcome } from "./types";

/**
 * The rollup card and one card per region.
 *
 * Every number here comes from the SAME resolvers the source blocks use, so the region
 * cards always sum to the ALL card. That was not always true: the rollup once showed
 * today's closures while each region showed its all-time ledger, and the parts came to
 * 1,874 against a whole of 4.
 */
export function RegionCardGrid({
  regions,
  allTimeCount,
  selectedRegion,
  setSelectedRegion,
  closedCountFor,
  oursOutcomeFor,
  fieldezOutcomeFor,
  rawOutcomeFor,
  rawMonthLevel,
  onDrill,
}: Readonly<{
  regions: readonly ClosedRegionEntry[];
  /** The all-time ledger total the rollup card falls back to on "All dates". */
  allTimeCount: number;
  selectedRegion: string | null;
  setSelectedRegion: (region: string | null) => void;
  /** `closedCountFor(aspCode, allTimeCount)` — the single count resolver. */
  closedCountFor: (aspCode: string, allTimeCount: number) => number;
  oursOutcomeFor: (aspCode: string, total: number) => OursOutcome;
  fieldezOutcomeFor: (aspCode: string) => ClosureOutcome | null;
  rawOutcomeFor: (aspCode: string) => ClosureOutcome | null;
  rawMonthLevel: boolean;
  onDrill: (drill: DrillState) => void;
}>) {
  const allCount = closedCountFor("", allTimeCount);
  const withClosures = regions.filter((entry) => entry.closedCount > 0).length;

  return (
    <div className="ccSec">
      <div className="ccRegionGrid">
        <RegionCard
          aspCode=""
          label="All regions"
          subLabel={`${withClosures} / ${regions.length} regions`}
          count={allCount}
          split={oursOutcomeFor("", allCount)}
          fieldez={fieldezOutcomeFor("")}
          raw={rawOutcomeFor("")}
          rawMonthLevel={rawMonthLevel}
          selected={!selectedRegion || selectedRegion === "ALL"}
          isAll
          onSelect={() => setSelectedRegion(null)}
          onDrill={onDrill}
        />

        {regions.map((entry) => {
          const count = closedCountFor(entry.aspCode, entry.closedCount);
          return (
            <RegionCard
              key={entry.aspCode}
              aspCode={entry.aspCode}
              label={entry.regionName}
              subLabel={entry.aspCode}
              count={count}
              split={oursOutcomeFor(entry.aspCode, count)}
              fieldez={fieldezOutcomeFor(entry.aspCode)}
              raw={rawOutcomeFor(entry.aspCode)}
              rawMonthLevel={rawMonthLevel}
              selected={selectedRegion === entry.aspCode}
              isAll={false}
              onSelect={() => setSelectedRegion(entry.aspCode)}
              onDrill={onDrill}
            />
          );
        })}
      </div>

      <div className="ccLegend">
        <span>
          <i className="ccSwatchOurs" />
          Our closed count (report rows)
        </span>
        <span>
          <i className="ccSwatchFieldez" />
          FieldEZ closure
        </span>
        <span>
          <i className="ccSwatchRaw" />
          Raw data{rawMonthLevel ? " (month-level for this period)" : ""}
        </span>
        <span>Δ = FieldEZ − ours</span>
      </div>
    </div>
  );
}
