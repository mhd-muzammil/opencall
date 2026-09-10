import React from "react";
import { formatNumber } from "../../utils";
import type { ClosureOutcome } from "../closureOutcome";
import type { CoverageTag, DrillState, OursOutcome } from "./types";

/** The tag + sentence that says how much of the chosen period this number answers for. */
function Coverage({ coverage }: Readonly<{ coverage: CoverageTag }>) {
  return (
    <div className="ccCov">
      <span className={`ccTag${coverage.tone === "warn" ? " ccWarn" : ""}`}>
        {coverage.label}
      </span>
      {coverage.note ? <span>{coverage.note}</span> : null}
    </div>
  );
}

/** A count you can click to see the records behind it. Inert, not hidden, at zero. */
function Drill({
  count,
  label,
  onDrill,
  className,
}: Readonly<{
  count: number;
  label: string;
  onDrill: (() => void) | null;
  className?: string | undefined;
}>) {
  const clickable = Boolean(onDrill) && count > 0;
  return (
    <button
      type="button"
      className={className}
      disabled={!clickable}
      title={clickable ? "View the records behind this number" : undefined}
      onClick={() => onDrill?.()}
    >
      {label}
    </button>
  );
}

/**
 * The three closed counts, side by side, each labelled with WHERE IT CAME FROM.
 *
 * They come from three systems and will not always match — that is the normal state of
 * this page, not a bug to be reconciled away. Putting them next to each other with their
 * coverage stated is the whole design: a reader can then tell a real disagreement (the Δ
 * line) from two sources answering different questions (a month-level raw count sitting
 * next to a one-day closure count).
 */
export function SourceComparison({
  ours,
  oursSplit,
  oursCoverage,
  fieldez,
  fieldezCoverage,
  fieldezUnmatched,
  fieldezUndated,
  raw,
  rawCoverage,
  rawNoRegion,
  regionLabel,
  onDrill,
}: Readonly<{
  /** OUR closed count for the active period + region — `closedCountFor`, unchanged. */
  ours: number;
  oursSplit: OursOutcome;
  oursCoverage: CoverageTag;
  /** null until the Flex Closure ASP Report has been imported at all. */
  fieldez: ClosureOutcome | null;
  fieldezCoverage: CoverageTag;
  /** Closures traced to no Work Location — on no region card, but inside the rollup. */
  fieldezUnmatched: number;
  /** Closures with no date at all: invisible to every date range, by definition. */
  fieldezUndated: number;
  /** null until the raw export has been synced at all. */
  raw: ClosureOutcome | null;
  rawCoverage: CoverageTag;
  rawNoRegion: number;
  regionLabel: string;
  onDrill: (drill: DrillState) => void;
}>) {
  const scope = regionLabel || "All Regions";

  // Only stated when both sides actually reported. A Δ against a source that was never
  // imported is a comparison with nothing.
  const delta = fieldez ? fieldez.closed - oursSplit.closed : null;

  return (
    <div className="ccCard ccSec">
      <h2>Closed calls by source</h2>
      <p className="ccHint">
        These counts come from different systems and will not always match. Each one says
        what it covers. Click a number to see the records behind it.
      </p>

      <div className="ccSources">
        {/* ---- ours ---- */}
        <div className="ccSrc ccSrcOurs">
          <div className="ccLab">Our closed count</div>
          {/* COMPLETIONS, like the FieldEZ headline beside it. This used to headline the
              row total — completions + cancellations + unreported — against a FieldEZ
              figure that has always been completions only, so the two could never be read
              against each other and the Δ line looked wrong even when it said 0. */}
          <div className="ccVal">
            <Drill
              count={oursSplit.closed}
              label={formatNumber(oursSplit.closed)}
              onDrill={() =>
                onDrill({ kind: "ours", outcome: "closed", aspCode: "", label: scope })
              }
            />
          </div>
          <div className="ccSplit">
            <Drill
              count={oursSplit.cancelled}
              label={`+ ${formatNumber(oursSplit.cancelled)} cancelled`}
              onDrill={() =>
                onDrill({ kind: "ours", outcome: "cancelled", aspCode: "", label: scope })
              }
            />
            {oursSplit.unknown > 0 && (
              <Drill
                count={oursSplit.unknown}
                label={`${formatNumber(oursSplit.unknown)} unknown`}
                onDrill={() =>
                  onDrill({ kind: "ours", outcome: "unknown", aspCode: "", label: scope })
                }
              />
            )}
          </div>
          <Coverage coverage={oursCoverage} />
          <div className="ccExtra">
            Report rows that disappeared from the Flex WIP file and were stamped CLOSED.{" "}
            {/* The row total still has to be reachable: it is what the ledger below lists
                and what the sidebar badge counts. */}
            <Drill
              className="ccTotalLink"
              count={ours}
              label={`${formatNumber(ours)} closed rows in this period.`}
              onDrill={() =>
                onDrill({ kind: "ours", outcome: "all", aspCode: "", label: scope })
              }
            />{" "}
            {oursCoverage.label === "all time" ? (
              <b>All-time — this only ever grows.</b>
            ) : null}
          </div>
        </div>

        {/* ---- FieldEZ ---- */}
        <div className="ccSrc ccSrcFieldez">
          <div className="ccLab">FieldEZ data closure</div>
          {fieldez === null ? (
            <>
              <div className="ccVal ccMuted">—</div>
              <div className="ccExtra">
                Flex Closure ASP Report has not been imported yet.
              </div>
            </>
          ) : (
            <>
              <div className="ccVal">
                <Drill
                  count={fieldez.closed}
                  label={formatNumber(fieldez.closed)}
                  onDrill={() =>
                    onDrill({
                      kind: "fieldez",
                      outcome: "closed",
                      aspCode: "",
                      label: scope,
                    })
                  }
                />
              </div>
              <div className="ccSplit">
                {/* Suppressed entirely when the backend reported no split — "0 cancelled"
                    would assert something nobody said. */}
                {fieldez.hasSplit && (
                  <Drill
                    count={fieldez.cancelled}
                    label={`+ ${formatNumber(fieldez.cancelled)} cancelled`}
                    onDrill={() =>
                      onDrill({
                        kind: "fieldez",
                        outcome: "cancelled",
                        aspCode: "",
                        label: scope,
                      })
                    }
                  />
                )}
              </div>
              <Coverage coverage={fieldezCoverage} />
              <div className="ccExtra">
                Flex Closure ASP Report (case_closure_dates).
                {fieldezUndated > 0 ? (
                  <>
                    {" "}
                    <b>{formatNumber(fieldezUndated)} undated</b> — outside any date range.
                  </>
                ) : null}
                {fieldezUnmatched > 0 ? (
                  <>
                    {" "}
                    <b>{formatNumber(fieldezUnmatched)} unmatched</b> — no Work Location.
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* ---- raw ---- */}
        <div className="ccSrc ccSrcRaw">
          <div className="ccLab">Raw data closures</div>
          {raw === null ? (
            <>
              <div className="ccVal ccMuted">—</div>
              <div className="ccExtra">Raw data has not been synced yet.</div>
            </>
          ) : (
            <>
              <div className="ccVal">
                <Drill
                  count={raw.closed}
                  label={formatNumber(raw.closed)}
                  onDrill={() =>
                    onDrill({ kind: "raw", outcome: "closed", aspCode: "", label: scope })
                  }
                />
              </div>
              <div className="ccSplit">
                {raw.hasSplit && (
                  <Drill
                    count={raw.cancelled}
                    label={`+ ${formatNumber(raw.cancelled)} cancelled`}
                    onDrill={() =>
                      onDrill({
                        kind: "raw",
                        outcome: "cancelled",
                        aspCode: "",
                        label: scope,
                      })
                    }
                  />
                )}
              </div>
              <Coverage coverage={rawCoverage} />
              <div className="ccExtra">
                Standalone raw-data API (flex_raw_records).
                {rawNoRegion > 0 ? (
                  <>
                    {" "}
                    <b>{formatNumber(rawNoRegion)} on no region card</b> — raw file has no
                    ASP.
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        {delta !== null && (
          <div className="ccSrcNote">
            Δ FieldEZ − ours ={" "}
            <b className={delta > 0 ? "ccUp" : "ccDown"}>
              {delta > 0 ? "+" : ""}
              {formatNumber(delta)}
            </b>{" "}
            {delta === 0
              ? "— both sides agree on the completed count for this period."
              : delta > 0
                ? "closures HP counted that our evening status did not — see the reconciliation panel for the per-ticket list."
                : "completions we recorded that FieldEZ has not reported yet — see the reconciliation panel for the per-ticket list."}
          </div>
        )}
      </div>
    </div>
  );
}
