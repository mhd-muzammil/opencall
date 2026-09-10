import React from "react";
import { formatNumber } from "../../utils";
import type { ReconciliationRow } from "../../../../lib/closureDateApiClient";
import { DrillModal } from "./DrillModal";
import type { ReconBucketKey } from "./types";

export const RECON_BUCKET_TITLES: Record<ReconBucketKey, string> = {
  matched: "Closed both sides",
  closedHereNotInFlex: "Closed here, not in Flex",
  closedInFlexNotHere: "Closed in Flex, not here",
  closedInFlexNoRow: "Closed in Flex, never in our WIP",
};

/**
 * The tickets behind one reconciliation bucket.
 *
 * No fetch — the panel already holds the whole reconciliation, so the list is guaranteed
 * to be the rows the number counted. "Closed here" is blank for a Flex-side-only row
 * because that is the disagreement: we have no closing status to show.
 */
export function ReconBucketDrill({
  bucket,
  rows,
  windowLabel,
  aspCode,
  onClose,
}: Readonly<{
  bucket: ReconBucketKey;
  rows: readonly ReconciliationRow[];
  windowLabel: string;
  aspCode: string;
  onClose: () => void;
}>) {
  return (
    <DrillModal
      title={RECON_BUCKET_TITLES[bucket]}
      subtitle={`${formatNumber(rows.length)} record${
        rows.length === 1 ? "" : "s"
      } · ${windowLabel}${
        aspCode ? ` · ${aspCode}` : ""
      } · GET /api/v1/closure-dates/reconciliation`}
      onClose={onClose}
      footer={
        <button type="button" className="ccBtn ccSm" onClick={onClose}>
          Close
        </button>
      }
    >
      <table className="ccTable">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Case</th>
            <th>Region</th>
            <th>Our status</th>
            <th>Flex status</th>
            <th>Closure date</th>
            <th>Closed here</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="ccEmpty">
                Nothing in this bucket for the window.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.ticketId}-${row.caseId}-${index}`}>
                <td>{row.ticketId || "—"}</td>
                <td>{row.caseId || "—"}</td>
                <td>{row.aspCode || "—"}</td>
                <td>{row.rtplStatus || "—"}</td>
                <td>{row.closureStatus || "—"}</td>
                <td>{row.closureDate || "—"}</td>
                <td className="ccMuted">
                  {row.hoursSinceClosedHere === null
                    ? "—"
                    : `${row.hoursSinceClosedHere}h ago`}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DrillModal>
  );
}
