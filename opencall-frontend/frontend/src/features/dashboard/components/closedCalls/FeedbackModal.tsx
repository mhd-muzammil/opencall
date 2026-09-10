import React, { useState } from "react";
import {
  CALL_STATUS_OPTIONS,
  CUSTOMER_FEEDBACK_OPTIONS,
} from "../../../../lib/customerFeedbackApiClient";
import type { ReportRow } from "../../types";
import { DrillModal } from "./DrillModal";
import { rowOutput, text } from "./rowFields";

interface ExistingFeedback {
  callStatus?: string | undefined;
  feedback?: string | undefined;
  remarks?: string | undefined;
}

/**
 * Capturing what the customer said after a closure.
 *
 * The two dropdowns are fixed lists that must stay in step with the backend
 * (`shared/constants/customerFeedback.ts`); the server re-validates every value, so a
 * drift here is rejected rather than silently stored.
 *
 * Uses the same `DrillModal` shell as the record lists — it used to carry its own copy of
 * the portal, backdrop and close handling.
 */
export function FeedbackModal({
  row,
  token,
  onSaved,
  onClose,
}: Readonly<{
  row: ReportRow;
  token: string;
  onSaved: () => void;
  onClose: () => void;
}>) {
  const output = rowOutput(row);
  const existing = (output["Customer Feedback"] ?? {}) as ExistingFeedback;

  const [callStatus, setCallStatus] = useState(String(existing.callStatus ?? ""));
  const [feedback, setFeedback] = useState(String(existing.feedback ?? ""));
  const [remarks, setRemarks] = useState(String(existing.remarks ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!callStatus && !feedback) {
      setError("Pick a call status or a feedback value.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { saveCustomerFeedback } = await import(
        "../../../../lib/customerFeedbackApiClient"
      );
      await saveCustomerFeedback(token, {
        woId: text(output, "Ticket ID") || text(output, "WO ID"),
        caseId: text(output, "Case ID"),
        callStatus,
        feedback,
        remarks: remarks.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrillModal
      narrow
      title={`Customer feedback — ${text(output, "Ticket ID") || "—"}`}
      subtitle="Both lists are validated server-side."
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          {error && <span className="ccMfNote">{error}</span>}
          <button
            type="button"
            className="ccBtn ccSm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ccBtn ccSm ccPrimary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save feedback"}
          </button>
        </>
      }
    >
      <div className="ccFbForm">
        <label htmlFor="cc-fb-call">Call status</label>
        <select
          id="cc-fb-call"
          value={callStatus}
          onChange={(event) => setCallStatus(event.target.value)}
        >
          <option value="">Select call status…</option>
          {CALL_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label htmlFor="cc-fb-feedback">Customer feedback</label>
        <select
          id="cc-fb-feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        >
          <option value="">Select feedback…</option>
          {CUSTOMER_FEEDBACK_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label htmlFor="cc-fb-remarks">Remarks</label>
        <textarea
          id="cc-fb-remarks"
          rows={3}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Any extra notes…"
        />
      </div>
    </DrillModal>
  );
}
