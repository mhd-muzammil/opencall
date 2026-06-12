// RTPL operational-checkpoint modal extracted from app/page.tsx (Phase 6.4).
// JSX preserved verbatim; props passed explicitly (no logic/filtering/state/handler
// changes). The `isRtplTimeModalOpen && selectedRtplTimeCard` render guard stays in
// page.tsx, so `selectedRtplTimeCard` is always non-null here.
import type { Dispatch, SetStateAction } from "react";
import type {
  RtplTimeCard,
  RtplTimeCardDetail,
} from "../../../lib/reportDashboardAnalytics";
import {
  formatNumber,
  formatRtplStatusValue,
  formatRtplChangeTime,
} from "../utils";

export function RTPLTimeModal({
  selectedRtplTimeCard,
  selectedRtplModalStatus,
  selectedRtplModalDetails,
  visibleRtplTimeDetails,
  hiddenRtplTimeDetailCount,
  setIsRtplTimeModalOpen,
}: Readonly<{
  selectedRtplTimeCard: RtplTimeCard;
  selectedRtplModalStatus: string | null;
  selectedRtplModalDetails: RtplTimeCardDetail[];
  visibleRtplTimeDetails: RtplTimeCardDetail[];
  hiddenRtplTimeDetailCount: number;
  setIsRtplTimeModalOpen: Dispatch<SetStateAction<boolean>>;
}>) {
  return (
    <div className="modalOverlay" onClick={() => setIsRtplTimeModalOpen(false)}>
      <div className="modalCard rtplCheckpointModal" onClick={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <span className="modalEyebrow">RTPL Operational Checkpoint</span>
            <h2 className="modalTitle">
              {selectedRtplTimeCard.label}:{" "}
              <span className="highlightText">
                {selectedRtplModalStatus ?? selectedRtplTimeCard.status}
              </span>
            </h2>
          </div>
          <button
            type="button"
            className="modalCloseBtn"
            onClick={() => setIsRtplTimeModalOpen(false)}
            title="Close RTPL details"
          >
            &times;
          </button>
        </div>

        <div className="rtplCheckpointBody">
          <div className="rtplCheckpointSummary">
            <div>
              <span>Checkpoint</span>
              <strong>{selectedRtplTimeCard.label}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{selectedRtplModalStatus ?? selectedRtplTimeCard.status}</strong>
            </div>
            <div>
              <span>Work Orders</span>
              <strong>{formatNumber(selectedRtplModalDetails.length)}</strong>
            </div>
          </div>

          {visibleRtplTimeDetails.length > 0 ? (
            <div className="rtplCheckpointTable">
              <div className="rtplCheckpointTableHead">
                <span>Ticket ID</span>
                <span>RTPL Status</span>
                <span>Time</span>
              </div>
              <div className="rtplCheckpointRows">
                {visibleRtplTimeDetails.map((detail) =>
                  detail.type === "carry-forward" ? (
                    <div
                      key={`rtpl-carry-${detail.rowId ?? detail.serialNo}`}
                      className="rtplCheckpointRow"
                    >
                      <strong>WO {detail.ticketId}</strong>
                      <span>Baseline status: {detail.status}</span>
                      <small>Upload time</small>
                    </div>
                  ) : (
                    <div
                      key={detail.id ?? `rtpl-change-${detail.rowId}-${detail.changedAt}`}
                      className="rtplCheckpointRow"
                    >
                      <strong>WO {detail.ticketId}</strong>
                      <span>
                        {formatRtplStatusValue(detail.fromStatus)} -&gt; {formatRtplStatusValue(detail.toStatus)}
                      </span>
                      <small>{formatRtplChangeTime(detail.changedAt)}</small>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="rtplEmptyState">
              No RTPL status movement recorded for this checkpoint
              {selectedRtplModalStatus ? ` and status ${selectedRtplModalStatus}` : ""}.
            </div>
          )}

          {hiddenRtplTimeDetailCount > 0 ? (
            <p className="rtplCheckpointFootnote">
              Showing {formatNumber(visibleRtplTimeDetails.length)} of {formatNumber(selectedRtplModalDetails.length)} work orders.
            </p>
          ) : null}

          <div className="modalActions rtplCheckpointActions">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setIsRtplTimeModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
