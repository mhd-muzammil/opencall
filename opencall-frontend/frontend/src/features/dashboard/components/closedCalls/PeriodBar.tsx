import React from "react";
import type { BillCycle } from "../../utils/billCycle";
import {
  formatDateKey,
  formatRangeLabel,
  type ClosedCallsPeriodPreset,
} from "../../utils/closedCallsPeriod";
import type { ClosedRegionEntry } from "./types";

const PRESETS: ReadonlyArray<{
  key: ClosedCallsPeriodPreset;
  label: string;
  title: string;
}> = [
  {
    key: "today",
    label: "Today",
    title: "Calls closed today — by the report-day rule, so a late back-dated closure still counts",
  },
  {
    key: "cycle",
    label: "Bill cycle",
    title: "One bill cycle (25th → 24th) — pick the month beside this button",
  },
  {
    key: "custom",
    label: "Custom",
    title: "Any date range, by Case Closed Date",
  },
  { key: "all", label: "All dates", title: "Every closed call in the ledger" },
];

/**
 * THE spine of the page: one period, one region, and everything below follows it.
 *
 * The reconciliation panel is the single deliberate exception — it keeps its own window,
 * and says so on itself.
 *
 * The active segment is DERIVED from the bounds, not stored, so a chip can never claim a
 * period the numbers are not actually answering for. `customOpen` only decides whether
 * the date inputs are on screen: picking Custom over a range that happens to match the
 * bill cycle leaves the counts on the cycle rule, which computes the identical set.
 */
export function PeriodBar({
  periodPreset,
  customOpen,
  onPreset,
  dateLo,
  dateHi,
  periodFrom,
  periodTo,
  setPeriodFrom,
  setPeriodTo,
  billCycle,
  billCycleOptions,
  currentCycleKey,
  onSelectCycle,
  regions,
  selectedRegion,
  setSelectedRegion,
}: Readonly<{
  periodPreset: ClosedCallsPeriodPreset;
  customOpen: boolean;
  onPreset: (preset: ClosedCallsPeriodPreset) => void;
  dateLo: string;
  dateHi: string;
  periodFrom: string;
  periodTo: string;
  setPeriodFrom: (value: string) => void;
  setPeriodTo: (value: string) => void;
  billCycle: BillCycle;
  billCycleOptions: readonly BillCycle[];
  currentCycleKey: string;
  onSelectCycle: (key: string) => void;
  regions: readonly ClosedRegionEntry[];
  selectedRegion: string | null;
  setSelectedRegion: (region: string | null) => void;
}>) {
  const activeSegment = customOpen ? "custom" : periodPreset;
  const showCycleSelect = activeSegment === "cycle";
  const showDates = activeSegment === "custom";

  const scope =
    periodPreset === "today"
      ? `Today (${formatDateKey(dateLo)}) — same-day closures by report day`
      : periodPreset === "cycle"
        ? `${billCycle.monthLabel} cycle (${billCycle.label})`
        : periodPreset === "all"
          ? "All dates — all-time ledger"
          : formatRangeLabel(dateLo, dateHi, formatDateKey, "all dates");

  const regionLabel =
    selectedRegion && selectedRegion !== "ALL"
      ? regions.find((entry) => entry.aspCode === selectedRegion)?.regionName ??
        selectedRegion
      : "";

  return (
    <div className="ccCard ccPeriodBar ccSec">
      <strong>Period</strong>

      <div className="ccSeg" role="group" aria-label="Closed calls period">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            title={preset.title}
            aria-pressed={activeSegment === preset.key}
            className={activeSegment === preset.key ? "ccOn" : ""}
            onClick={() => onPreset(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {showCycleSelect && (
        <select
          aria-label="Bill cycle month"
          value={billCycle.key}
          onChange={(event) => onSelectCycle(event.target.value)}
          title="Each cycle runs from the 25th to the 24th and is named after the month it ends in"
        >
          {billCycleOptions.map((cycle) => (
            <option key={cycle.key} value={cycle.key}>
              {cycle.monthLabel} cycle · {cycle.label}
              {cycle.key === currentCycleKey ? " · current" : ""}
            </option>
          ))}
        </select>
      )}

      {showDates && (
        <span className="ccDatePair">
          <input
            type="date"
            aria-label="Closed from"
            value={periodFrom}
            onChange={(event) => setPeriodFrom(event.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            aria-label="Closed to"
            value={periodTo}
            onChange={(event) => setPeriodTo(event.target.value)}
          />
        </span>
      )}

      <div className="ccRegionTabs" role="group" aria-label="Region">
        <button
          type="button"
          className={!selectedRegion || selectedRegion === "ALL" ? "ccOn" : ""}
          aria-pressed={!selectedRegion || selectedRegion === "ALL"}
          onClick={() => setSelectedRegion(null)}
        >
          All regions
        </button>
        {regions.map((entry) => (
          <button
            key={entry.aspCode}
            type="button"
            title={entry.aspCode}
            className={selectedRegion === entry.aspCode ? "ccOn" : ""}
            aria-pressed={selectedRegion === entry.aspCode}
            onClick={() => setSelectedRegion(entry.aspCode)}
          >
            {entry.regionName}
          </button>
        ))}
      </div>

      <div className="ccScope">
        Showing <b>{scope}</b>
        {regionLabel ? (
          <>
            {" · "}
            <b>{regionLabel}</b>
          </>
        ) : null}
      </div>
    </div>
  );
}
