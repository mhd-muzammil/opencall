"use client";

import type { WarrantyJobDetail } from "@opencall/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWarrantyJob,
  downloadWarrantyJobFile,
  getWarrantyJob,
  retryWarrantyJob,
} from "../lib/warrantyApiClient";
import { readSession, type ClientSession } from "../lib/session";

/**
 * HP Warranty Lookup workspace view.
 *
 * Upload a Flex WIP workbook → the backend worker looks up each unique serial
 * on HP's site (paced, so a full file takes a while) → download the same
 * workbook with `Warranty Status` (end date) and `_Lookup Status` appended.
 *
 * Self-contained like AdminRtplStatusesManager: reads its own session, owns its
 * polling loop, and survives page refreshes by remembering the last job id.
 */

const LAST_JOB_STORAGE_KEY = "opencall.warranty.lastJobId";
const POLL_INTERVAL_MS = 5_000;
/** Matches the worker's 6–12s pacing; used only for the rough ETA label. */
const AVG_SECONDS_PER_LOOKUP = 9;

function formatEta(pendingCount: number): string {
  const totalSeconds = pendingCount * AVG_SECONDS_PER_LOOKUP;
  if (totalSeconds < 90) {
    return `~${Math.max(1, Math.round(totalSeconds / 60))} min`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `~${hours}h ${minutes}m` : `~${minutes} min`;
}

function readLastJobId(): string | null {
  try {
    return window.localStorage.getItem(LAST_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastJobId(jobId: string | null): void {
  try {
    if (jobId) {
      window.localStorage.setItem(LAST_JOB_STORAGE_KEY, jobId);
    } else {
      window.localStorage.removeItem(LAST_JOB_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable — polling still works for the session.
  }
}

export function WarrantyLookupManager() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [job, setJob] = useState<WarrantyJobDetail | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  // Restore the last job after a refresh so a running lookup stays visible.
  useEffect(() => {
    if (!session) return;
    const lastJobId = readLastJobId();
    if (!lastJobId) return;
    getWarrantyJob(session.token, lastJobId)
      .then(setJob)
      .catch(() => writeLastJobId(null));
  }, [session]);

  const refreshJob = useCallback(async () => {
    if (!session || !job) return;
    try {
      setJob(await getWarrantyJob(session.token, job.id));
    } catch {
      // Transient poll failure — keep showing the last known state.
    }
  }, [session, job]);

  const isRunning = job !== null && job.status !== "completed";

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => void refreshJob(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRunning, refreshJob]);

  const handleUpload = async () => {
    if (!session || !selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createWarrantyJob(session.token, selectedFile);
      setJob(created);
      writeLastJobId(created.id);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!session || !job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await retryWarrantyJob(session.token, job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!session || !job) return;
    setDownloading(true);
    setError(null);
    try {
      const { blob, fileName } = await downloadWarrantyJobFile(session.token, job.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const counts = job?.counts ?? null;
  const resolvedCount = counts ? counts.done + counts.failed : 0;
  const progressPercent =
    counts && counts.total > 0 ? Math.round((resolvedCount / counts.total) * 100) : 0;

  return (
    <div className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Data & Operations</p>
          <h2>HP Warranty Lookup</h2>
          <p className="muted">
            Upload a Flex WIP report; each unique serial is checked on HP&apos;s
            warranty site. Download the same workbook with the warranty end date
            (column AX) and lookup status (column AY) appended.
          </p>
        </div>
      </div>

      {error && <div className="adminError">{error}</div>}

      <div className="adminForm" style={{ maxWidth: "560px" }}>
        <div className="adminField">
          <label htmlFor="warranty-file">Flex WIP report (.xlsx)</label>
          <input
            id="warranty-file"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="adminFormActions">
          <button
            type="button"
            className="btnPrimary"
            disabled={busy || !selectedFile}
            onClick={() => void handleUpload()}
          >
            {busy ? "Uploading…" : "Start Warranty Lookup"}
          </button>
        </div>
        {isRunning && (
          <p className="muted" style={{ marginTop: "4px" }}>
            Lookups are paced 6–12s apart to stay friendly with HP&apos;s site, so
            large files take a while. You can leave this page — the job keeps
            running on the server.
          </p>
        )}
      </div>

      {job && counts && (
        <div className="panel" style={{ marginTop: "16px" }}>
          <div className="sectionHeader">
            <h3 style={{ margin: 0 }}>{job.originalFileName}</h3>
            <span className="muted">
              {job.totalRows} rows · {job.uniqueSerials} unique serials
            </span>
          </div>

          <div style={{ margin: "12px 0" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              <strong>
                {job.status === "completed"
                  ? "Completed"
                  : `Processing — ${resolvedCount} / ${counts.total} serials`}
              </strong>
              {isRunning && counts.pending > 0 && (
                <span className="muted">{formatEta(counts.pending)} remaining</span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: "8px",
                borderRadius: "4px",
                background: "rgba(120, 120, 160, 0.2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: "4px",
                  background:
                    job.status === "completed" ? "var(--success, #22c55e)" : "var(--accent, #6366f1)",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>

          <div className="batchGrid">
            <div className="batchCard">
              <span>Warranty found</span>
              <strong>{counts.ok}</strong>
            </div>
            <div className="batchCard">
              <span>Not found</span>
              <strong>{counts.notFound}</strong>
            </div>
            <div className="batchCard">
              <span>No serial</span>
              <strong>{counts.noSerial}</strong>
            </div>
            <div className="batchCard">
              <span>Failed</span>
              <strong style={counts.failed > 0 ? { color: "var(--danger, #f87171)" } : undefined}>
                {counts.failed}
              </strong>
            </div>
            <div className="batchCard">
              <span>Queued</span>
              <strong>{counts.pending + counts.processing}</strong>
            </div>
          </div>

          <div className="adminFormActions" style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="btnPrimary"
              disabled={job.status !== "completed" || downloading}
              onClick={() => void handleDownload()}
            >
              {downloading
                ? "Preparing…"
                : job.status === "completed"
                  ? "Download Result (.xlsx)"
                  : "Download available when completed"}
            </button>
            {counts.failed > 0 && (
              <button
                type="button"
                className="btnSecondary"
                disabled={busy}
                onClick={() => void handleRetry()}
              >
                Retry {counts.failed} Failed
              </button>
            )}
            <button
              type="button"
              className="btnSecondary"
              disabled={busy}
              onClick={() => void refreshJob()}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
