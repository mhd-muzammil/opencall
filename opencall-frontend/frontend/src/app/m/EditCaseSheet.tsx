"use client";

import { useEffect, useState } from "react";
import { isScheduledStatus } from "@opencall/shared";
import {
  getEngineersDropdown,
  getRtplStatusesDropdown,
  updateReportRow,
} from "../../lib/apiClient";
import { updateSpecialAccessReportRow } from "../../lib/specialAccessApiClient";
import type { GeneratedReportResponse } from "../../lib/api/types";
import type { ClientSession } from "../../lib/session";

type Row = GeneratedReportResponse["rows"][number];

/**
 * The columns the API accepts for a manual edit, mirroring the web's
 * EDITABLE_COLUMN_API_FIELD so the app can change exactly what the web can — no more.
 */
const EDITABLE: Array<{ column: string; field: string; kind: "text" | "textarea" }> = [
  { column: "Engineer", field: "engineer", kind: "text" },
  { column: "RTPL status", field: "rtpl_status", kind: "text" },
  { column: "Evening status", field: "evening_rtpl_status", kind: "text" },
  { column: "Current Remarks", field: "remarks", kind: "textarea" },
  { column: "Segment", field: "segment", kind: "text" },
  { column: "Location", field: "location", kind: "text" },
  { column: "Status Aging", field: "status_aging", kind: "text" },
  { column: "HP Owner Status", field: "hp_owner_status", kind: "text" },
  { column: "Customer Mail", field: "customer_mail", kind: "text" },
  { column: "RCA", field: "rca", kind: "textarea" },
  { column: "Part", field: "part", kind: "text" },
];

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";

function initialValue(row: Row, column: string): string {
  const raw = String((row.output as Record<string, unknown>)[column] ?? "").trim();
  return raw === MANUAL_ENTRY_REQUIRED ? "" : raw;
}

/**
 * Bottom-sheet editor for a case. Saves through the same endpoints the web uses —
 * PATCH /report-rows/:id for regular users, the special-access endpoint otherwise —
 * and applies the same client-side guard (scheduling needs an engineer).
 */
export function EditCaseSheet({
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
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE.map((f) => [f.field, initialValue(row, f.column)])),
  );
  const [engineers, setEngineers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown sources — same endpoints the web edit form uses.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [eng, sts] = await Promise.all([
          getEngineersDropdown(session.token).catch(() => ({ engineers: [] })),
          getRtplStatusesDropdown(session.token).catch(() => ({ statuses: [] })),
        ]);
        if (cancelled) return;
        setEngineers(eng.engineers.map((e) => e.engineerName).filter(Boolean));
        setStatuses(sts.statuses.map((s) => s.name).filter(Boolean));
      } catch {
        /* dropdowns are a convenience; free text still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.token]);

  const set = (field: string, v: string) =>
    setValues((cur) => ({ ...cur, [field]: v }));

  async function handleSave() {
    if (!row.id) {
      setError("This row is not persisted yet — regenerate the report and retry.");
      return;
    }

    // Only send what actually changed, so a save never clobbers a field the user
    // did not touch (same contract as the web).
    const patch: Record<string, string | null> = {};
    for (const f of EDITABLE) {
      const next = values[f.field] ?? "";
      if (next.trim() !== initialValue(row, f.column)) {
        patch[f.field] = next.trim() === "" ? null : next.trim();
      }
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    // Mirror of the server guard: scheduling requires an engineer.
    const settingScheduled =
      isScheduledStatus(patch["rtpl_status"] ?? undefined) ||
      isScheduledStatus(patch["evening_rtpl_status"] ?? undefined);
    if (settingScheduled) {
      const effectiveEngineer = (
        "engineer" in patch
          ? patch["engineer"] ?? ""
          : String(row.output["Engineer"] ?? "")
      ).trim();
      if (!effectiveEngineer || effectiveEngineer === MANUAL_ENTRY_REQUIRED) {
        setError("You must assign an engineer before scheduling.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const isSpecialAccess = session.user.role === "SPECIAL_ACCESS";
      if (isSpecialAccess) {
        await updateSpecialAccessReportRow({
          token: session.token,
          rowId: row.id,
          values: patch as never,
        });
      } else {
        await updateReportRow({
          token: session.token,
          rowId: row.id,
          values: patch as never,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const ticket = String(row.output["Ticket ID"] ?? "Case");

  return (
    <div className="mSheetBackdrop" onClick={() => !saving && onClose()}>
      <div className="mSheet" onClick={(e) => e.stopPropagation()}>
        <div className="mSheet__grip" />
        <div className="mSheet__title">Edit {ticket}</div>

        {error && <div className="mError">{error}</div>}

        {EDITABLE.map((f) => {
          const options =
            f.field === "engineer"
              ? engineers
              : f.field === "rtpl_status" || f.field === "evening_rtpl_status"
                ? statuses
                : null;

          return (
            <label key={f.field} className="mField">
              <span>{f.column}</span>
              {options && options.length > 0 ? (
                <select
                  className="mSelect"
                  value={values[f.field] ?? ""}
                  onChange={(e) => set(f.field, e.target.value)}
                >
                  <option value="">— none —</option>
                  {/* Keep an existing value that is not in the dropdown selectable. */}
                  {values[f.field] && !options.includes(values[f.field]!) && (
                    <option value={values[f.field]}>{values[f.field]}</option>
                  )}
                  {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea
                  className="mInput"
                  rows={3}
                  value={values[f.field] ?? ""}
                  onChange={(e) => set(f.field, e.target.value)}
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <input
                  className="mInput"
                  value={values[f.field] ?? ""}
                  onChange={(e) => set(f.field, e.target.value)}
                />
              )}
            </label>
          );
        })}

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
            {saving ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
