"use client";

import { useState } from "react";
import {
  CALL_STATUS_OPTIONS,
  CUSTOMER_FEEDBACK_OPTIONS,
  saveCustomerFeedback,
} from "../../lib/customerFeedbackApiClient";
import type { GeneratedReportResponse } from "../../lib/api/types";
import type { ClientSession } from "../../lib/session";

type Row = GeneratedReportResponse["rows"][number];

/**
 * Customer feedback capture for a closed call — the same fixed dropdown values and the
 * same endpoint the web Closed Calls table uses, so the resulting Customer Status stays
 * uniform and chartable.
 */
export function FeedbackSheet({
  row,
  session,
  onClose,
  onSaved,
}: Readonly<{
  row: Row;
  session: ClientSession;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const out = row.output as Record<string, unknown>;
  const existing = out["Customer Feedback"] as
    | { callStatus?: string; feedback?: string; remarks?: string }
    | undefined;

  const [callStatus, setCallStatus] = useState(String(existing?.callStatus ?? ""));
  const [feedback, setFeedback] = useState(String(existing?.feedback ?? ""));
  const [remarks, setRemarks] = useState(String(existing?.remarks ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!callStatus && !feedback) {
      setError("Pick a call status or a feedback value.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveCustomerFeedback(session.token, {
        woId: String(out["Ticket ID"] ?? ""),
        caseId: String(out["Case ID"] ?? ""),
        callStatus,
        feedback,
        remarks: remarks.trim(),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mSheetBackdrop" onClick={() => !saving && onClose()}>
      <div className="mSheet" onClick={(e) => e.stopPropagation()}>
        <div className="mSheet__grip" />
        <div className="mSheet__title">
          Customer Feedback · {String(out["Ticket ID"] ?? "")}
        </div>

        {error && <div className="mError">{error}</div>}

        <label className="mField">
          <span>Call Status</span>
          <select
            className="mSelect"
            value={callStatus}
            onChange={(e) => setCallStatus(e.target.value)}
          >
            <option value="">Select call status…</option>
            {CALL_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>

        <label className="mField">
          <span>Customer Feedback</span>
          <select
            className="mSelect"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          >
            <option value="">Select feedback…</option>
            {CUSTOMER_FEEDBACK_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>

        <label className="mField">
          <span>Remarks <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <textarea
            className="mInput"
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Any extra notes…"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button
            type="button"
            className="mBtn mBtn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mBtn"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
