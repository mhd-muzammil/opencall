"use client";

import { useMemo, useState } from "react";
import {
  createAcerCalls,
  previewAcerCalls,
  saveProblems,
  type AcerCallFields,
  type AcerCallPreview,
  type AcerPastePreview,
  type CreateAcerCallsResult,
} from "../../lib/brandCallApiClient";

/**
 * Add Acer calls (SUPER_ADMIN): paste the calls copied from Acer's portal, check the
 * fields the server read out of each line, fix anything, pick the branch, save.
 *
 * Saved calls join the daily report as rows ("ACER-<case id>") the next time it is
 * generated — onSaved asks the page to do that straight away.
 */

const FIELD_COLUMNS: ReadonlyArray<{ key: keyof AcerCallFields; label: string; width: number }> = [
  { key: "caseId", label: "Case ID", width: 110 },
  { key: "customerName", label: "Customer Name", width: 260 },
  { key: "callStatus", label: "Call Status", width: 170 },
  { key: "serviceType", label: "Service Type", width: 100 },
  { key: "model", label: "Model", width: 140 },
  { key: "productCategory", label: "Product Category", width: 170 },
  { key: "serialNumber", label: "Serial Number", width: 200 },
  { key: "issueDescription", label: "Issue Description", width: 220 },
  { key: "warrantyStatus", label: "Warranty Status", width: 120 },
  { key: "fullAddress", label: "Full Address", width: 340 },
  { key: "pincode", label: "Pincode", width: 90 },
  { key: "altContact", label: "Alt Contact", width: 120 },
  { key: "primaryContact", label: "Primary Contact", width: 130 },
];

interface DraftCall extends AcerCallPreview {
  /** Unticked = left out of the save. Calls already on file start unticked. */
  include: boolean;
}

/** On file and still open: saving it again would change nothing, so it cannot be ticked. */
function isOpenOnFile(call: AcerCallPreview): boolean {
  return call.existing !== null && !call.existing.closedAt && !call.existing.deletedAt;
}

/** What the row's note says about a case already on file. */
function existingNote(call: AcerCallPreview): string | null {
  if (!call.existing) return null;
  if (call.existing.deletedAt) {
    return `Deleted on ${formatDate(call.existing.deletedAt)} — tick it to add it back.`;
  }
  if (call.existing.closedAt) {
    return `Closed on ${formatDate(call.existing.closedAt)} — tick it to reopen the call with these details.`;
  }
  return `Already open (added ${formatDate(call.existing.createdAt)}) — it will be skipped.`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** What still stops a call being saved, after the admin's edits. */
function blockingProblems(call: DraftCall): string[] {
  const problems: string[] = [];
  const caseId = call.caseId.trim();
  if (!caseId) problems.push("Case ID is missing.");
  else if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(caseId)) problems.push("Case ID may only hold letters, digits, -, _ and /.");
  if (!call.customerName.trim()) problems.push("Customer Name is missing.");
  if (!call.regionCode) problems.push("Pick the branch.");
  // Duplicates inside the paste are re-checked live in the component.
  return problems;
}

export function AcerCallsPasteModal({
  token,
  onClose,
  onSaved,
}: Readonly<{
  token: string;
  onClose: () => void;
  onSaved: (result: CreateAcerCallsResult) => void;
}>) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<AcerPastePreview | null>(null);
  const [drafts, setDrafts] = useState<DraftCall[]>([]);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorList, setErrorList] = useState<string[]>([]);

  const readPaste = async () => {
    setBusy("reading");
    setError(null);
    setErrorList([]);
    try {
      const result = await previewAcerCalls(token, text);
      setPreview(result);
      setDrafts(result.calls.map((call) => ({ ...call, include: call.existing === null })));
      if (result.calls.length === 0) {
        setError("No calls found. Each call should be one line with the 13 Acer columns.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the paste.");
    } finally {
      setBusy(null);
    }
  };

  const updateDraft = (index: number, patch: Partial<DraftCall>) => {
    setDrafts((current) => current.map((call, i) => (i === index ? { ...call, ...patch } : call)));
  };

  // Problems per row, including a case id typed twice among the ticked rows.
  const problemsByRow = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of drafts) {
      if (!call.include) continue;
      const key = call.caseId.trim().toUpperCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return drafts.map((call) => {
      if (!call.include) return [];
      const problems = blockingProblems(call);
      if ((counts.get(call.caseId.trim().toUpperCase()) ?? 0) > 1) {
        problems.push("This Case ID is ticked twice.");
      }
      return problems;
    });
  }, [drafts]);

  const includedCount = drafts.filter((call) => call.include).length;
  const blockedCount = problemsByRow.filter((problems) => problems.length > 0).length;

  const save = async () => {
    setBusy("saving");
    setError(null);
    setErrorList([]);
    try {
      const calls = drafts
        .filter((call) => call.include)
        .map((call) => ({
          caseId: call.caseId.trim(),
          customerName: call.customerName,
          callStatus: call.callStatus,
          serviceType: call.serviceType,
          model: call.model,
          productCategory: call.productCategory,
          serialNumber: call.serialNumber,
          issueDescription: call.issueDescription,
          warrantyStatus: call.warrantyStatus,
          fullAddress: call.fullAddress,
          pincode: call.pincode,
          altContact: call.altContact,
          primaryContact: call.primaryContact,
          regionCode: call.regionCode,
          sourceLine: call.sourceLine,
        }));
      const result = await createAcerCalls(token, calls);
      onSaved(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the calls.");
      setErrorList(saveProblems(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modalOverlay" onClick={busy ? undefined : onClose}>
      <div
        className="modalCard acerPasteCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acer-paste-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <span className="modalEyebrow">Acer</span>
            <h2 className="modalTitle" id="acer-paste-title">
              {preview ? "Check the calls" : "Add Acer calls"}
            </h2>
          </div>
          <button type="button" className="modalCloseBtn" aria-label="Close" onClick={onClose} disabled={busy !== null}>
            ×
          </button>
        </div>

        <div className="modalBody">
          {!preview ? (
            <>
              <p className="acerPasteHint">
                Copy the calls from Acer&apos;s portal and paste them below — one call per line, all 13
                columns (Case ID, Customer Name, Call Status, Service Type, Model, Product Category,
                Serial Number, Issue Description, Warranty Status, Full Address, Pincode, Alt Contact,
                Primary Contact). Headings such as &ldquo;new calls&rdquo; are skipped.
              </p>
              <textarea
                className="modalTextarea acerPasteTextarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"1877563C\t33030206501 KANCHEEPURAM PUMS …\tAwaiting Onsite Visit\tOn-Site\tVeriton M4670G\t…"}
                spellCheck={false}
                autoFocus
              />
            </>
          ) : (
            <>
              <div className="acerPasteSummary">
                <span>
                  <strong>{drafts.length}</strong> call{drafts.length === 1 ? "" : "s"} read
                </span>
                <span>
                  <strong>{includedCount}</strong> to save
                </span>
                {drafts.some(isOpenOnFile) ? (
                  <span>
                    <strong>{drafts.filter(isOpenOnFile).length}</strong> already open (skipped)
                  </span>
                ) : null}
                {drafts.some((call) => call.existing && !isOpenOnFile(call)) ? (
                  <span>
                    <strong>{drafts.filter((call) => call.existing && !isOpenOnFile(call)).length}</strong>{" "}
                    closed or deleted before — tick to reopen
                  </span>
                ) : null}
                {preview.ignoredLines.length > 0 ? (
                  <span title={preview.ignoredLines.map((line) => `Line ${line.lineNumber}: ${line.text}`).join("\n")}>
                    {preview.ignoredLines.length} line{preview.ignoredLines.length === 1 ? "" : "s"} skipped (not a call)
                  </span>
                ) : null}
              </div>

              <div className="acerPreviewScroll">
                <table className="acerPreviewTable">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Save</th>
                      <th style={{ width: 60 }}>Line</th>
                      <th style={{ width: 170 }}>Branch</th>
                      {FIELD_COLUMNS.map((column) => (
                        <th key={column.key} style={{ minWidth: column.width }}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((call, index) => {
                      const problems = problemsByRow[index] ?? [];
                      const onFileNote = existingNote(call);
                      const notes = [
                        ...(onFileNote ? [onFileNote] : []),
                        ...problems,
                        ...call.warnings,
                      ];
                      return (
                        <tr
                          key={`${call.lineNumber}-${index}`}
                          className={[
                            call.include ? "" : "excluded",
                            problems.length > 0 ? "hasError" : "",
                          ].join(" ")}
                        >
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Save case ${call.caseId}`}
                              checked={call.include}
                              disabled={isOpenOnFile(call)}
                              onChange={(event) => updateDraft(index, { include: event.target.checked })}
                            />
                          </td>
                          <td className="acerPreviewLine">
                            {call.lineNumber}
                            {notes.length > 0 ? (
                              <span className="acerPreviewNote" title={notes.join("\n")} aria-label={notes.join(" ")}>
                                !
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <select
                              value={call.regionCode}
                              aria-label={`Branch for case ${call.caseId}`}
                              title={call.regionReason}
                              disabled={!call.include}
                              onChange={(event) => updateDraft(index, { regionCode: event.target.value })}
                            >
                              <option value="">Pick…</option>
                              {preview.regions.map((region) => (
                                <option key={region.code} value={region.code}>
                                  {region.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          {FIELD_COLUMNS.map((column) => (
                            <td key={column.key}>
                              <input
                                type="text"
                                value={call[column.key]}
                                aria-label={`${column.label}, line ${call.lineNumber}`}
                                disabled={!call.include}
                                onChange={(event) =>
                                  updateDraft(index, { [column.key]: event.target.value } as Partial<DraftCall>)
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {blockedCount > 0 ? (
                <ul className="acerPasteProblems">
                  {drafts.map((call, index) =>
                    (problemsByRow[index] ?? []).map((problem) => (
                      <li key={`${index}-${problem}`}>
                        Line {call.lineNumber} ({call.caseId || "no case id"}): {problem}
                      </li>
                    )),
                  )}
                </ul>
              ) : null}
            </>
          )}

          {error ? (
            <div className="acerPasteError" role="alert">
              <strong>{error}</strong>
              {errorList.length > 0 ? (
                <ul>
                  {errorList.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="modalActions">
            {preview ? (
              <button
                type="button"
                className="secondaryButton"
                disabled={busy !== null}
                onClick={() => {
                  setPreview(null);
                  setDrafts([]);
                  setError(null);
                  setErrorList([]);
                }}
              >
                Back to paste
              </button>
            ) : null}
            <button type="button" className="secondaryButton" disabled={busy !== null} onClick={onClose}>
              Cancel
            </button>
            {preview ? (
              <button
                type="button"
                className="saveBtn"
                disabled={busy !== null || includedCount === 0 || blockedCount > 0}
                onClick={() => void save()}
              >
                {busy === "saving" ? "Saving…" : `Save ${includedCount} call${includedCount === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                type="button"
                className="saveBtn"
                disabled={busy !== null || !text.trim()}
                onClick={() => void readPaste()}
              >
                {busy === "reading" ? "Reading…" : "Read calls"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
