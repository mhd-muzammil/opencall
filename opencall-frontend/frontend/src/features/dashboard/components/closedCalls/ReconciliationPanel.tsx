import React, { useEffect, useMemo, useState } from "react";
import { formatNumber } from "../../utils";
import { todayIsoDate } from "../../utils/dateUtils";
import { formatDateKey } from "../../utils/closedCallsPeriod";
import type {
  ClosureReconciliation,
  ReconciliationRow,
} from "../../../../lib/closureDateApiClient";
import { ReconBucketDrill } from "./ReconBucketDrill";
import { SyncBadge, type ClosureFreshness } from "./SyncBadge";
import type { ReconBucketKey } from "./types";

/**
 * The longest window this panel will ask about, counted INCLUSIVELY.
 *
 * The server's own ceiling is 31 days of difference between the two dates; asking for 31
 * inclusive days is comfortably inside it, so a request this panel sends can never be the
 * one the server refuses. The cap exists because reconciliation reads every report row in
 * the window and window-functions over them, holding one of the API's ten database
 * connections for as long as it runs — on 2026-08-27 that pool was emptied and login and
 * the health check started failing with "timeout exceeded when trying to connect". An
 * unbounded date picker is a second way to reach the same place.
 */
export const RECON_MAX_DAYS = 31;

const BUCKETS: ReadonlyArray<{
  key: Exclude<ReconBucketKey, "closedInFlexNoRow">;
  label: string;
  detail: string;
  hint: string;
  tone: string;
}> = [
  {
    key: "matched",
    label: "Closed both sides",
    detail: "matched",
    hint: "We closed it and Flex reported a closure in this window.",
    tone: "ccOk",
  },
  {
    key: "closedHereNotInFlex",
    label: "Closed here, not in Flex",
    detail: "closedHereNotInFlex",
    hint: "We marked it closed; Flex has no closure for this window yet.",
    tone: "ccWarnB",
  },
  {
    key: "closedInFlexNotHere",
    label: "Closed in Flex, not here",
    detail: "closedInFlexNotHere",
    hint: "Flex closed it; our evening status does not say closed.",
    tone: "ccBadB",
  },
];

/** Whole days between two YYYY-MM-DD dates, inclusive of both ends. */
function inclusiveDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * "Did Flex agree with us?" — per ticket, over its OWN window.
 *
 * Deliberately NOT bound to the page period. The page period answers "how many closed";
 * this answers "which ones disagree", and the two are read at different scales — you scan
 * a month of closures and then reconcile a day of them. The boxed control and the sentence
 * under it exist because two date pickers on one page otherwise read as one.
 *
 * Nothing here mutates anything: no call is closed, reopened or edited from this panel.
 */
export function ReconciliationPanel({
  token,
  aspCode,
  freshness,
  refreshNonce,
}: Readonly<{
  token: string;
  /** "" = every region the caller may read. */
  aspCode: string;
  freshness: ClosureFreshness;
  /** Bumped after an import/sync so the counts move without a page reload. */
  refreshNonce: number;
}>) {
  const [fromDate, setFromDate] = useState(todayIsoDate);
  const [toDate, setToDate] = useState(todayIsoDate);
  const [recon, setRecon] = useState<ClosureReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openBucket, setOpenBucket] = useState<ReconBucketKey | null>(null);

  // A backwards range is refused by the server, so it is never sent: dragging From past
  // To carries To along, which keeps it a single day instead of an error.
  const lo = fromDate && toDate && fromDate > toDate ? toDate : fromDate;
  const hi = fromDate && toDate && fromDate > toDate ? fromDate : toDate;

  const windowDays = lo && hi ? inclusiveDays(lo, hi) : 0;
  const overCap = windowDays > RECON_MAX_DAYS;

  useEffect(() => {
    if (!token || !lo || overCap) {
      if (overCap) setRecon(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { getClosureReconciliation } = await import(
          "../../../../lib/closureDateApiClient"
        );
        const result = await getClosureReconciliation(token, {
          date: lo,
          // Sent only when it widens the question: a `to` equal to `date` is the single
          // day the endpoint already answers.
          ...(hi && hi > lo ? { to: hi } : {}),
          ...(aspCode ? { asp: aspCode } : {}),
        });
        if (cancelled) return;
        setRecon(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRecon(null);
        setError(err instanceof Error ? err.message : "Could not load reconciliation");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, lo, hi, aspCode, overCap, refreshNonce]);

  // Changing the window or the region invalidates whichever bucket list was open.
  useEffect(() => {
    setOpenBucket(null);
  }, [lo, hi, aspCode]);

  // The fourth bucket is optional on the wire. `undefined` means this backend cannot
  // answer it; 0 means it answered and there were none.
  const noRowCount = recon?.counts.closedInFlexNoRow;
  const noRowAvailable = typeof noRowCount === "number";

  const openRows: readonly ReconciliationRow[] = useMemo(() => {
    if (!recon || !openBucket) return [];
    if (openBucket === "closedInFlexNoRow") return recon.closedInFlexNoRow ?? [];
    return recon[openBucket];
  }, [recon, openBucket]);

  // A cleared date input is a window with no bounds, and nothing is fetched for it — say
  // that rather than rendering an arrow between two blanks.
  const windowLabel =
    !lo || !hi
      ? "no window"
      : lo === hi
        ? formatDateKey(lo)
        : `${formatDateKey(lo)} → ${formatDateKey(hi)}`;

  return (
    <div className="ccCard">
      <div className="ccPanelHead">
        <div>
          <h2>Flex reconciliation</h2>
          <p className="ccHint">
            Our evening status vs FieldEZ closure, per ticket
            {aspCode ? ` · ${aspCode}` : " · all regions"}.
          </p>
          {recon && (
            <p className="ccHint">
              We closed{" "}
              <b>
                {formatNumber(
                  recon.counts.matched + recon.counts.closedHereNotInFlex,
                )}
              </b>{" "}
              · Flex reported{" "}
              <b>
                {formatNumber(
                  recon.counts.matched + recon.counts.closedInFlexNotHere,
                )}
              </b>
            </p>
          )}
        </div>
        <SyncBadge freshness={freshness} />
      </div>

      <div className="ccReconWin">
        <strong>Reconciliation window</strong>
        <input
          type="date"
          aria-label="Reconciliation from"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        to
        <input
          type="date"
          aria-label="Reconciliation to"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
        <span className={`ccTag${overCap ? " ccWarn" : ""}`}>
          {windowDays > 0
            ? `${windowDays} day${windowDays === 1 ? "" : "s"}`
            : "pick both dates"}
          {overCap ? ` — over the ${RECON_MAX_DAYS}-day cap` : ""}
        </span>
        <span>Separate from the page period above.</span>
      </div>

      {overCap && (
        <p className="ccError">
          Narrow the window to {RECON_MAX_DAYS} days or fewer to load it. A longer window
          reads every report row in the period and can exhaust the API&apos;s database
          connections.
        </p>
      )}
      {error && !overCap && <p className="ccError">{error}</p>}

      <div className="ccBuckets">
        {BUCKETS.map((bucket) => {
          const count = recon?.counts[bucket.key] ?? 0;
          const clickable = !overCap && count > 0;
          return (
            <button
              key={bucket.key}
              type="button"
              className={`ccBucket ${bucket.tone}`}
              title={bucket.hint}
              disabled={!clickable}
              onClick={() => setOpenBucket(bucket.key)}
            >
              <div className="ccN">
                {overCap ? "—" : loading && !recon ? "…" : formatNumber(count)}
              </div>
              <div className="ccL">{bucket.label}</div>
              <div className="ccD">{bucket.detail}</div>
            </button>
          );
        })}
      </div>

      <div className="ccNewline">
        <span>
          Closed in Flex but <b>never in our WIP at all</b> (no report row to reconcile)
          {!noRowAvailable && <span className="ccTag">not available on this API</span>}
        </span>
        <button
          type="button"
          className="ccTk"
          disabled={overCap || !noRowAvailable || (noRowCount ?? 0) === 0}
          onClick={() => setOpenBucket("closedInFlexNoRow")}
        >
          {overCap || !noRowAvailable ? "—" : `${formatNumber(noRowCount ?? 0)} tickets`}
        </button>
      </div>

      {openBucket && recon && (
        <ReconBucketDrill
          bucket={openBucket}
          rows={openRows}
          windowLabel={windowLabel}
          aspCode={aspCode}
          onClose={() => setOpenBucket(null)}
        />
      )}
    </div>
  );
}
