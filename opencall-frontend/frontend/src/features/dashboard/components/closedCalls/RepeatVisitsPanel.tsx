import React, { useMemo } from "react";
import { formatNumber } from "../../utils";
import { formatDateKey } from "../../utils/closedCallsPeriod";
import type { RepeatVisitSummary } from "../../../../lib/closureDateApiClient";

/** How alarming a callback is, by how fast it came back. */
function gapTone(days: number | null): string {
  if (days === null) return "ccG";
  if (days <= 3) return "ccR";
  if (days <= 10) return "ccA";
  return "ccG";
}

/**
 * Repeat visits: a case closed again inside the vendor's window of its previous closure.
 *
 * HP pays for the first fix, not for going back. The work order differs but the case is
 * the same, so a callback earns nothing — and until this panel existed it sat inside the
 * closed count looking exactly like paid work.
 *
 * Sorted SHORTEST GAP FIRST, and the ordering is the point: a customer we were back with
 * the next day is a worse signal than one who called again a fortnight later, and sorting
 * by date would bury it.
 */
export function RepeatVisitsPanel({
  summary,
  regionName,
  onOpenWo,
}: Readonly<{
  summary: RepeatVisitSummary;
  regionName: (aspCode: string) => string;
  /** Opens the case behind a work order, when that row is on this report. */
  onOpenWo: ((woId: string) => void) | null;
}>) {
  const rows = useMemo(
    () =>
      [...summary.rows].sort((a, b) => {
        const ga = a.gapDays ?? Number.MAX_SAFE_INTEGER;
        const gb = b.gapDays ?? Number.MAX_SAFE_INTEGER;
        if (ga !== gb) return ga - gb;
        return b.closedOn.localeCompare(a.closedOn);
      }),
    [summary.rows],
  );

  const worstRegions = summary.byAsp
    .filter((entry) => entry.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid);

  const woButton = (woId: string, unpaid: boolean) => (
    <button
      type="button"
      className={`ccTk${unpaid ? " ccUnpaid" : ""}`}
      disabled={!onOpenWo}
      onClick={() => onOpenWo?.(woId)}
      title={onOpenWo ? "Open this case" : undefined}
    >
      {woId || "—"}
    </button>
  );

  return (
    <div className="ccCard">
      <h2>Repeat visits — not paid</h2>
      <p className="ccHint">
        A case closed again within {summary.windowDays} days of its previous closure. The
        work order differs, the case does not — so HP pays nothing for the second visit.
        Sorted shortest gap first.
      </p>

      <div className="ccKpiRow">
        <div title="Completed closures in this period">
          <b>{formatNumber(summary.closed)}</b>
          <span>closed</span>
        </div>
        <div className="ccGood" title="Closed minus the repeat visits">
          <b>{formatNumber(summary.payable)}</b>
          <span>payable</span>
        </div>
        <div className="ccBadv" title="Free work — went back inside the window">
          <b>{formatNumber(summary.unpaid)}</b>
          <span>repeat (unpaid)</span>
        </div>
      </div>

      {worstRegions.length > 0 && (
        <div className="ccPills">
          {worstRegions.map((entry) => (
            <span
              key={entry.aspCode}
              title={`${entry.payable} payable of ${entry.closed} closed`}
            >
              {regionName(entry.aspCode)} <strong>{entry.unpaid}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="ccScroll">
        <table className="ccTable">
          <thead>
            <tr>
              <th>Gap</th>
              <th>Case</th>
              <th>Region</th>
              <th>First visit — paid</th>
              <th>Repeat — unpaid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.caseId}-${row.woId}`}>
                <td>
                  <span className={`ccGap ${gapTone(row.gapDays)}`}>
                    {row.gapDays !== null ? `${row.gapDays}d` : "—"}
                  </span>
                </td>
                <td>{row.caseId}</td>
                <td className="ccMuted">{regionName(row.aspCode)}</td>
                <td>
                  {woButton(row.previousWoId, false)}{" "}
                  {row.previousClosedOn && (
                    <span className="ccMuted">
                      {formatDateKey(row.previousClosedOn)}
                    </span>
                  )}
                </td>
                <td>
                  {woButton(row.woId, true)}{" "}
                  <span className="ccMuted">{formatDateKey(row.closedOn)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
