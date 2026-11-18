"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import {
  deleteAcerCall,
  listAcerCalls,
  reopenAcerCall,
  saveProblems,
  updateAcerCall,
  type AcerCallFields,
  type AcerCallListItem,
} from "../../lib/brandCallApiClient";

/**
 * Every Acer call entered — open and closed — with what happened to it. Closed calls
 * leave the Records table the day after they close; this is where they stay visible.
 *
 *  - Reopen: a call closed by mistake, or the customer called back (SUPER_ADMIN and
 *    REGION_ADMIN — whoever works the calls).
 *  - Edit / Delete: correct a saved call, or remove one entered by mistake (SUPER_ADMIN).
 *
 * onChanged lets the page regenerate the report so Records shows the change at once.
 */

type StatusFilter = "open" | "closed" | "all";

const REGION_OPTIONS = Object.entries(ASP_CODE_REGION_MAP).map(([code, name]) => ({
  code,
  name: name.charAt(0) + name.slice(1).toLowerCase(),
}));

function regionName(code: string): string {
  const name = ASP_CODE_REGION_MAP[code.toUpperCase()];
  return name ? name.charAt(0) + name.slice(1).toLowerCase() : code;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const EDIT_FIELDS: ReadonlyArray<{ key: Exclude<keyof AcerCallFields, "caseId">; label: string; wide?: boolean }> = [
  { key: "customerName", label: "Customer Name", wide: true },
  { key: "callStatus", label: "Call Status" },
  { key: "serviceType", label: "Service Type" },
  { key: "model", label: "Model" },
  { key: "productCategory", label: "Product Category" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "warrantyStatus", label: "Warranty Status" },
  { key: "issueDescription", label: "Issue Description", wide: true },
  { key: "fullAddress", label: "Full Address", wide: true },
  { key: "pincode", label: "Pincode" },
  { key: "primaryContact", label: "Primary Contact" },
  { key: "altContact", label: "Alt Contact" },
];

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(calls: readonly AcerCallListItem[], label: string) {
  const header = [
    "Case ID", "Ticket ID", "Branch", "Customer Name", "Primary Contact", "Alt Contact", "Pincode",
    "Full Address", "Model", "Product Category", "Serial Number", "Issue Description",
    "Warranty Status", "Service Type", "Call Status", "Entered On", "Entered By", "Engineer",
    "RTPL Status", "Evening Status", "Current Remarks", "State", "Closed On", "Closed Status", "Closed By",
  ];
  const lines = calls.map((call) =>
    [
      call.caseId, call.ticketId, regionName(call.regionCode), call.customerName, call.primaryContact,
      call.altContact, call.pincode, call.fullAddress, call.model, call.productCategory,
      call.serialNumber, call.issueDescription, call.warrantyStatus, call.serviceType, call.callStatus,
      formatDateTime(call.createdAt), call.createdBy, call.engineer ?? "", call.morningStatus ?? "",
      call.eveningStatus ?? "", call.remarks ?? "", call.closedAt ? "Closed" : "Open",
      formatDateTime(call.closedAt), call.closedStatus ?? "", call.closedBy ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([`﻿${[header.join(","), ...lines].join("\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `acer-calls-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AcerCallsManager({
  token,
  isSuperAdmin,
  onChanged,
}: Readonly<{
  token: string;
  isSuperAdmin: boolean;
  onChanged: (message: string) => void;
}>) {
  const [status, setStatus] = useState<StatusFilter>("closed");
  const [search, setSearch] = useState("");
  const [calls, setCalls] = useState<AcerCallListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AcerCallListItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCalls(await listAcerCalls(token, { status, search: search.trim(), limit: 500 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the Acer calls.");
    } finally {
      setLoading(false);
    }
  }, [token, status, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const counts = useMemo(
    () => ({
      open: calls.filter((call) => !call.closedAt).length,
      closed: calls.filter((call) => call.closedAt).length,
    }),
    [calls],
  );

  const act = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setConfirmDeleteId(null);
      await load();
      onChanged(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="acerManager">
      <div className="acerManagerBar">
        <div className="brandTabs" role="tablist" aria-label="Which Acer calls">
          {(["open", "closed", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`brandTab ${status === value ? "active" : ""}`}
              onClick={() => setStatus(value)}
            >
              {value === "open" ? "Open" : value === "closed" ? "Closed" : "All"}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="acerManagerSearch"
          placeholder="Search case ID, customer, serial, phone, pincode…"
          aria-label="Search Acer calls"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="acerManagerCount">
          {loading ? "Loading…" : `${calls.length} call${calls.length === 1 ? "" : "s"}`}
          {status === "all" && !loading ? ` · ${counts.open} open · ${counts.closed} closed` : ""}
        </span>
        <button
          type="button"
          className="secondaryButton"
          disabled={calls.length === 0}
          onClick={() => downloadCsv(calls, status)}
        >
          Download
        </button>
      </div>

      {error ? (
        <div className="acerPasteError" role="alert">
          {error}
        </div>
      ) : null}

      <div className="acerManagerScroll">
        <table className="acerManagerTable">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Branch</th>
              <th>Customer</th>
              <th>Model</th>
              <th>Issue</th>
              <th>Entered</th>
              <th>Engineer</th>
              <th>RTPL status</th>
              <th>Evening status</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 && !loading ? (
              <tr>
                <td colSpan={11} className="acerManagerEmpty">
                  {status === "closed" ? "No closed Acer calls." : "No Acer calls."}
                </td>
              </tr>
            ) : null}
            {calls.map((call) => {
              const busy = busyId === call.id;
              return (
                <tr key={call.id}>
                  <td className="acerManagerCase">
                    <strong>{call.caseId}</strong>
                    <span>{call.ticketId}</span>
                  </td>
                  <td>{regionName(call.regionCode)}</td>
                  <td className="acerManagerWide" title={call.fullAddress}>
                    {call.customerName}
                    <span>{[call.primaryContact, call.pincode].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td>
                    {call.model}
                    <span>{call.serialNumber}</span>
                  </td>
                  <td className="acerManagerWide">{call.issueDescription}</td>
                  <td>
                    {formatDateTime(call.createdAt)}
                    <span>{call.createdBy}</span>
                  </td>
                  <td>{call.engineer ?? ""}</td>
                  <td>{call.morningStatus ?? ""}</td>
                  <td>{call.eveningStatus ?? ""}</td>
                  <td>
                    {call.closedAt ? (
                      <span className="acerState closed" title={`Closed by ${call.closedBy ?? "?"}`}>
                        Closed {formatDateTime(call.closedAt)}
                        {call.closedStatus ? ` · ${call.closedStatus}` : ""}
                      </span>
                    ) : (
                      <span className="acerState open">
                        Open{call.reopenedAt ? ` (reopened ${formatDateTime(call.reopenedAt)})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="acerManagerActions">
                    {call.closedAt ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={busy}
                        onClick={() =>
                          void act(call.id, () => reopenAcerCall(token, call.id), `Acer call ${call.caseId} reopened.`)
                        }
                      >
                        Reopen
                      </button>
                    ) : null}
                    {isSuperAdmin ? (
                      <button type="button" className="secondaryButton" disabled={busy} onClick={() => setEditing(call)}>
                        Edit
                      </button>
                    ) : null}
                    {isSuperAdmin ? (
                      confirmDeleteId === call.id ? (
                        <span className="acerDeleteConfirm">
                          Delete {call.caseId}?
                          <button
                            type="button"
                            className="dangerButton"
                            disabled={busy}
                            onClick={() =>
                              void act(call.id, () => deleteAcerCall(token, call.id), `Acer call ${call.caseId} deleted.`)
                            }
                          >
                            Yes, delete
                          </button>
                          <button type="button" className="secondaryButton" disabled={busy} onClick={() => setConfirmDeleteId(null)}>
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="secondaryButton acerDeleteButton"
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(call.id)}
                        >
                          Delete
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <AcerCallEditModal
          token={token}
          call={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            const caseId = editing.caseId;
            setEditing(null);
            await load();
            onChanged(`Acer call ${caseId} updated.`);
          }}
        />
      ) : null}
    </div>
  );
}

function AcerCallEditModal({
  token,
  call,
  onClose,
  onSaved,
}: Readonly<{
  token: string;
  call: AcerCallListItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}>) {
  const [fields, setFields] = useState(() => ({
    regionCode: call.regionCode,
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
    primaryContact: call.primaryContact,
    altContact: call.altContact,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setProblems([]);
    try {
      await updateAcerCall(token, call.id, fields);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      setProblems(saveProblems(caught));
    } finally {
      setSaving(false);
    }
  };

  // Rendered on <body>: the Records card it opens from creates a containing block that
  // would otherwise clip a fixed-position overlay.
  return createPortal(
    <div className="modalOverlay" onClick={saving ? undefined : onClose}>
      <div
        className="modalCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acer-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <span className="modalEyebrow">Acer · {call.ticketId}</span>
            <h2 className="modalTitle" id="acer-edit-title">
              Edit case {call.caseId}
            </h2>
          </div>
          <button type="button" className="modalCloseBtn" aria-label="Close" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>
        <div className="modalBody">
          <p className="acerPasteHint">
            The Case ID cannot change — it is the call&apos;s ticket on every report. If it is wrong,
            delete this call and paste it again.
          </p>
          <div className="acerEditGrid">
            <label className="acerEditField">
              <span>Branch</span>
              <select
                value={fields.regionCode}
                onChange={(event) => setFields((current) => ({ ...current, regionCode: event.target.value }))}
              >
                {REGION_OPTIONS.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            {EDIT_FIELDS.map((field) => (
              <label key={field.key} className={`acerEditField ${field.wide ? "wide" : ""}`}>
                <span>{field.label}</span>
                <input
                  type="text"
                  value={fields[field.key]}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          {error ? (
            <div className="acerPasteError" role="alert">
              <strong>{error}</strong>
              {problems.length > 0 ? (
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="modalActions">
            <button type="button" className="secondaryButton" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="saveBtn" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
