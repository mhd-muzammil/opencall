// Rules that decide when a REFRESHED report may overwrite what is on screen.
//
// The records workspace holds one `report` object and rebuilds everything from
// it. Two independent things swap that object out from under the user:
//
//   1. A special-access session polls its scoped endpoint every 60s. That
//      endpoint runs a full server-side regeneration, so the response describes
//      the database as of when the REQUEST STARTED — not when it arrived.
//   2. Any session can land on a newer report (the FieldEZ worker creates one
//      per changed file), which changes `reportId` while the user is working.
//
// Both used to be applied unconditionally, which is what made a saved row snap
// back to its old status and the full-screen ASP Code filter un-filter itself.
// These helpers are pure so the rules can be tested without a browser.

/**
 * May the 15s "a newer report was uploaded" poll move this session onto that
 * report?
 *
 * Only when the report covers at least what the user is currently looking at:
 *   - an UNSCOPED report (`regionId === null` — the FieldEZ worker's and every
 *     combined upload) is safe for everyone, and
 *   - a region-SCOPED report only for a session pinned to that same region.
 *
 * The `null` case is the one the auto-switch exists for; without it nobody ever
 * followed worker-created reports and Evening entries kept landing on stale
 * ones. But "a multi-region login matches everything" (ambient regionId "") let
 * a SUPER_ADMIN working across all ASPs get pulled onto a single-region upload
 * — the report then covers one region, so the table silently narrows and the
 * full-screen ASP Code filter, having nothing left to retain, falls back to
 * "All ASP Codes" mid-shift. A narrower report must never win that way.
 */
export function isAutoSwitchCandidate({
  reportRegionId,
  currentRegionId,
}: {
  /** `regionId` of the uploaded session being considered (null = unscoped). */
  reportRegionId: string | null;
  /** The session's ambient region ("" for a multi-region login). */
  currentRegionId: string;
}): boolean {
  if (reportRegionId === null) return true;
  return reportRegionId === currentRegionId;
}

function normalizeAspCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export interface ReportRefreshDecisionInput {
  /** Sequence number of the request whose response just arrived. */
  seq: number;
  /** Highest sequence number already applied to the report state. */
  appliedSeq: number;
  /** `Date.now()` captured immediately BEFORE the request was sent. */
  startedAt: number;
  /**
   * `Date.now()` stamped after the last locally-confirmed row save or delete
   * (0 when this session has not written anything yet).
   */
  mutatedAt: number;
}

/**
 * May this refresh response be applied to the report on screen?
 *
 * Rejected when:
 *   - a NEWER refresh already landed (out-of-order response), or
 *   - the request left before a save this session made was confirmed, so the
 *     response cannot contain that save and applying it would revert the row.
 *
 * The mutation comparison is `>=` because `Date.now()` is millisecond-grained:
 * a tie must fall on the safe side, since dropping a good response only costs
 * one poll interval while applying a stale one silently undoes an edit.
 */
export function shouldApplyReportRefresh({
  seq,
  appliedSeq,
  startedAt,
  mutatedAt,
}: ReportRefreshDecisionInput): boolean {
  if (seq < appliedSeq) return false;
  if (mutatedAt >= startedAt) return false;
  return true;
}

/**
 * The ASP Code selection to keep when the report object is replaced: the
 * previous selection when the incoming report still has rows under it,
 * otherwise null ("All ASP Codes").
 *
 * Without this the selection reset on every report swap. In full screen that
 * dropdown is the only region control there is, so a mid-shift reset is
 * indistinguishable from the filter clearing itself.
 *
 * `allValue` is the sentinel the pickers use for "all regions" (never retained).
 */
export function retainedAspSelection(
  previousAspCode: string | null,
  allValue = "ALL",
): string | null {
  if (!previousAspCode || previousAspCode === allValue) {
    return null;
  }

  // A concrete ASP selection is kept whatever the incoming report contains.
  //
  // This used to also require the ASP to appear in the new report's
  // regionBreakdown, which quietly reintroduced the bug it was written to fix:
  // the reset effect runs on every reportId change (~every worker cycle), and a
  // region-scoped or partial Flex upload produces a report that does not carry
  // this ASP — so the guard returned null and the dropdown fell back to
  // "All ASP Codes" mid-shift.
  //
  // Un-filtering silently is the worst possible outcome here: the employee goes
  // on working while looking at every region's calls, believing they are scoped
  // to their own. An empty grid under a filter that still reads their ASP tells
  // the truth. Only an explicit change of the dropdown clears the selection.
  return normalizeAspCode(previousAspCode) ? previousAspCode : null;
}
