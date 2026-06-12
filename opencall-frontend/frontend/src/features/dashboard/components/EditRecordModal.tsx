// Work Order edit modal extracted from app/page.tsx (Phase 6.13).
// JSX preserved verbatim; presentational. The editor state it operates on
// (draftOutput / setDraftOutput / editingSerialNo / savingSerialNo) and the
// saveEditing / cancelEditing handlers remain lifted in page.tsx and are passed in
// as props — no duplicate editor state, no new hooks, no saveEditing logic moved.
// The `isEditModalOpen && editingSerialNo !== null` render guard stays in page.tsx,
// so editingSerialNo arrives narrowed to a number.
import type { Dispatch, SetStateAction } from "react";
import { RTPLStatusDropdown } from "../../../components/RTPLStatusDropdown";
import { MANUAL_ENTRY_REQUIRED } from "../constants";
import type { DropdownEngineer } from "../../../lib/api/types";

export function EditRecordModal({
  editingSerialNo,
  savingSerialNo,
  draftOutput,
  setDraftOutput,
  engineersList,
  cancelEditing,
  saveEditing,
}: Readonly<{
  editingSerialNo: number;
  savingSerialNo: number | null;
  draftOutput: Record<string, string | number>;
  setDraftOutput: Dispatch<SetStateAction<Record<string, string | number>>>;
  engineersList: DropdownEngineer[];
  cancelEditing: () => void;
  saveEditing: (serialNo: number) => Promise<void>;
}>) {
  return (
    <div className="modalOverlay" onClick={cancelEditing}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <span className="modalEyebrow">Work Order Details & Entry</span>
            <h2 className="modalTitle">
              Ticket ID: <span className="highlightText">{String(draftOutput["Ticket ID"] ?? "")}</span>
            </h2>
          </div>
          <button type="button" className="modalCloseBtn" onClick={cancelEditing} title="Close Form">
            &times;
          </button>
        </div>

        <div className="modalBody">
          {/* Read-Only Summary Info */}
          <div className="modalInfoGrid">
            <div className="modalInfoItem">
              <span>Case ID</span>
              <strong>{String(draftOutput["Case ID"] ?? "N/A")}</strong>
            </div>
            <div className="modalInfoItem">
              <span>Customer Name</span>
              <strong>{String(draftOutput["Customer Name"] ?? "N/A")}</strong>
            </div>
            <div className="modalInfoItem">
              <span>Work Location</span>
              <strong>{String(draftOutput["Work Location"] ?? "N/A")}</strong>
            </div>
            <div className="modalInfoItem">
              <span>WO OTC Code</span>
              <strong>{String(draftOutput["WO OTC CODE"] ?? "N/A")}</strong>
            </div>
            <div className="modalInfoItem">
              <span>Product Line</span>
              <strong>{String(draftOutput["Product Line Name"] ?? "N/A")}</strong>
            </div>
            <div className="modalInfoItem">
              <span>WIP Aging</span>
              <strong>{String(draftOutput["WIP aging"] ?? "N/A")} Days</strong>
            </div>
          </div>

          {/* Form Fields */}
          <form
            className="modalForm"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditing(editingSerialNo);
            }}
          >
            <div className="formFieldGroup">
              {/* RTPL Status */}
              <div className="formField">
                <label htmlFor="modal-rtpl-status">RTPL Status</label>
                <div className="statusFieldContainer">
                  <RTPLStatusDropdown
                    value={String(draftOutput["RTPL status"] ?? "")}
                    manualEntryRequiredLabel="Entry"
                    onChange={(selected) => {
                      setDraftOutput((current) => ({
                        ...current,
                        "RTPL status": selected,
                      }));
                    }}
                  />
                </div>
              </div>

              {/* Engineer */}
              <div className="formField">
                <label htmlFor="modal-engineer">Engineer</label>
                <select
                  id="modal-engineer"
                  className="modalSelect"
                  value={String(draftOutput["Engineer"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "Engineer": event.target.value,
                    }))
                  }
                >
                  <option value="">Entry</option>
                  {engineersList.map(e => (
                    <option key={e.id} value={e.engineerName}>{e.engineerName}</option>
                  ))}
                  {draftOutput["Engineer"] && draftOutput["Engineer"] !== MANUAL_ENTRY_REQUIRED && !engineersList.some(e => e.engineerName === String(draftOutput["Engineer"])) && (
                    <option value={String(draftOutput["Engineer"])}>{String(draftOutput["Engineer"])} (Inactive/Not in list)</option>
                  )}
                </select>
              </div>

              {/* Segment */}
              <div className="formField">
                <label htmlFor="modal-segment">Segment</label>
                <select
                  id="modal-segment"
                  className="modalSelect"
                  value={String(draftOutput["Segment"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "Segment": event.target.value,
                    }))
                  }
                >
                  <option value="">Entry</option>
                  <option value="Print">Print</option>
                  <option value="PC">PC</option>
                  <option value="Install">Install</option>
                  <option value="Trade">Trade</option>
                  {draftOutput["Segment"] &&
                   draftOutput["Segment"] !== MANUAL_ENTRY_REQUIRED &&
                   !["Print", "PC", "Install", "Trade"].includes(String(draftOutput["Segment"])) && (
                    <option value={String(draftOutput["Segment"])}>{String(draftOutput["Segment"])}</option>
                  )}
                </select>
              </div>

              {/* Location */}
              <div className="formField">
                <label htmlFor="modal-location">Location</label>
                <input
                  id="modal-location"
                  className="modalInput"
                  value={String(draftOutput["Location"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "Location": event.target.value,
                    }))
                  }
                />
              </div>

              {/* HP Owner Status */}
              <div className="formField">
                <label htmlFor="modal-hp-owner-status">HP Owner Status</label>
                <input
                  id="modal-hp-owner-status"
                  className="modalInput"
                  value={String(draftOutput["HP Owner Status"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "HP Owner Status": event.target.value,
                    }))
                  }
                />
              </div>

              {/* Case Created Time */}
              <div className="formField">
                <label htmlFor="modal-case-created-time">Case Created Time</label>
                <input
                  id="modal-case-created-time"
                  className="modalInput"
                  value={String(draftOutput["Case Created Time"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "Case Created Time": event.target.value,
                    }))
                  }
                  placeholder="DD-MM-YYYY HH:MM:SS AM/PM"
                />
              </div>

              {/* Customer Mail */}
              <div className="formField">
                <label htmlFor="modal-customer-mail">Customer Mail</label>
                <input
                  id="modal-customer-mail"
                  className="modalInput"
                  value={String(draftOutput["Customer Mail"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "Customer Mail": event.target.value,
                    }))
                  }
                />
              </div>

              {/* RCA */}
              <div className="formField fullWidth">
                <label htmlFor="modal-rca">RCA (Root Cause Analysis)</label>
                <textarea
                  id="modal-rca"
                  className="modalTextarea"
                  value={String(draftOutput["RCA"] ?? "")}
                  onChange={(event) =>
                    setDraftOutput((current) => ({
                      ...current,
                      "RCA": event.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="secondaryButton"
                disabled={savingSerialNo === editingSerialNo}
                onClick={cancelEditing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="saveBtn"
                disabled={savingSerialNo === editingSerialNo}
              >
                {savingSerialNo === editingSerialNo ? "Saving..." : "Save Entry"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
