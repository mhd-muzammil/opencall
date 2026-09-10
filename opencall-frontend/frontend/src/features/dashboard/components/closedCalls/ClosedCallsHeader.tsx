import React from "react";
import { SyncBadge, type ClosureFreshness } from "./SyncBadge";

/**
 * Page title, the closure-sync freshness badge, and the four things you can DO here.
 *
 * Import and Sync are gated on `canImport` (the caller passes the closure-import token's
 * presence, i.e. SUPER_ADMIN / REGION_ADMIN and not a special-access credential). The
 * gate is the caller's decision, not this component's — it renders what it is told it may.
 */
export function ClosedCallsHeader({
  freshness,
  canImport,
  importing,
  importMessage,
  onImportFile,
  rawSyncing,
  rawSyncMessage,
  onSyncRaw,
  exportDisabled,
  onExport,
  onOpenRecords,
}: Readonly<{
  freshness: ClosureFreshness;
  canImport: boolean;
  importing: boolean;
  importMessage: string | null;
  onImportFile: (file: File | null) => void;
  rawSyncing: boolean;
  rawSyncMessage: string | null;
  onSyncRaw: () => void;
  exportDisabled: boolean;
  onExport: () => void;
  onOpenRecords: () => void;
}>) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className="ccHead">
      <div>
        <div className="ccCrumb">Home / Dashboards / Closed calls</div>
        <h1>Closed Calls</h1>
        <p>
          Completed work orders across operational regions, compared against FieldEZ and
          raw Flex data.
        </p>
      </div>

      <div className="ccActions">
        <SyncBadge freshness={freshness} />

        {canImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              hidden
              onChange={(event) => {
                onImportFile(event.target.files?.[0] ?? null);
                // Clearing the input is what lets the same file be re-imported after a
                // failure — without it `change` never fires for the identical path.
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="ccBtn"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              title="Adds and refreshes the closures this file lists. Closures it does not mention are left alone."
            >
              {importing ? "Importing…" : "Import closure dates"}
            </button>
            <button
              type="button"
              className="ccBtn"
              disabled={rawSyncing}
              onClick={onSyncRaw}
              title="Pulls the raw Flex closed-call rows from the raw-data API and replaces the stored set."
            >
              {rawSyncing ? "Syncing…" : "Sync raw data"}
            </button>
          </>
        )}

        <button
          type="button"
          className="ccBtn"
          onClick={onExport}
          disabled={exportDisabled}
          title="Exports every filtered record, not just the visible page."
        >
          Export Excel
        </button>
        <button type="button" className="ccBtn ccPrimary" onClick={onOpenRecords}>
          Open records table
        </button>

        {(importMessage || rawSyncMessage) && (
          <div className="ccActionNote">
            {[importMessage, rawSyncMessage].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
