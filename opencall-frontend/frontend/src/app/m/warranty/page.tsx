"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, useMobileSession } from "../session";
import {
  createWarrantyJob,
  downloadWarrantyJobFile,
  getWarrantyJob,
  retryWarrantyJob,
} from "../../../lib/warrantyApiClient";
import type { WarrantyJobDetail } from "@opencall/shared";

const POLL_INTERVAL_MS = 5_000;
const AVG_SECONDS_PER_LOOKUP = 9;
const LAST_JOB_STORAGE_KEY = "opencall.warranty.lastJobId";

function formatEta(remaining: number): string {
  const seconds = remaining * AVG_SECONDS_PER_LOOKUP;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * HP Warranty Lookup — same batch job as the desktop: upload a Flex WIP workbook, the
 * server checks each unique serial on HP's site, then the workbook comes back with the
 * warranty end date and lookup status appended.
 *
 * Special-access logins cannot use this at all (the backend rejects their token), so the
 * screen is gated to regular users with the "warranty" section.
 */
export default function MobileWarrantyPage() {
  const { session } = useMobileSession();
  const allowed =
    session?.user.role !== "SPECIAL_ACCESS" && canSeeMobileSection(session, "warranty");

  const [job, setJob] = useState<WarrantyJobDetail | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const counts = job?.counts ?? null;
  const isRunning = job?.status === "pending" || job?.status === "processing";

  // Restore the last job so closing the app does not lose a running lookup.
  useEffect(() => {
    if (!session || !allowed) return;
    const stored = window.localStorage.getItem(LAST_JOB_STORAGE_KEY);
    if (!stored) return;
    void getWarrantyJob(session.token, stored)
      .then(setJob)
      .catch(() => window.localStorage.removeItem(LAST_JOB_STORAGE_KEY));
  }, [session, allowed]);

  const refreshJob = useCallback(async () => {
    if (!session || !job) return;
    try {
      setJob(await getWarrantyJob(session.token, job.id));
    } catch {
      // Poll failures are transient — keep the last known state on screen.
    }
  }, [session, job]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => void refreshJob(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, refreshJob]);

  async function handleUpload() {
    if (!session || !selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const created = await createWarrantyJob(session.token, selectedFile);
      setJob(created);
      window.localStorage.setItem(LAST_JOB_STORAGE_KEY, created.id);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry() {
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
  }

  async function handleDownload() {
    if (!session || !job) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, fileName } = await downloadWarrantyJobFile(session.token, job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <>
        <AppBar title="Warranty Lookup" back />
        <main className="mMain">
          <div className="mCard">
            <div className="mMuted">You do not have access to Warranty Lookup.</div>
          </div>
        </main>
      </>
    );
  }

  const done = counts ? counts.done + counts.notFound + counts.noSerial : 0;
  const percent = counts && counts.total > 0 ? Math.round((done / counts.total) * 100) : 0;
  const remaining = counts ? counts.pending + counts.processing : 0;

  return (
    <>
      <AppBar
        title="Warranty Lookup"
        subtitle="Data & Operations"
        back
        action={
          job ? (
            <button
              type="button"
              className="mIconBtn"
              aria-label="Refresh"
              onClick={() => void refreshJob()}
            >
              ↻
            </button>
          ) : null
        }
      />
      <main className="mMain">
        {error && <div className="mError">{error}</div>}

        <div className="mCard">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            Upload a Flex WIP report
          </div>
          <p className="mMuted" style={{ fontSize: 12, marginBottom: 12 }}>
            Every unique serial is checked on HP&apos;s warranty site. You get the same
            workbook back with the warranty end date (column AX) and lookup status
            (column AY) appended.
          </p>

          <label className="mLabel" htmlFor="warranty-file">
            Flex WIP report (.xlsx)
          </label>
          <input
            id="warranty-file"
            ref={fileInputRef}
            className="mInput"
            type="file"
            accept=".xlsx,.xls"
            disabled={uploading || busy}
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            className="mBtn"
            style={{ marginTop: 10 }}
            disabled={!selectedFile || uploading || busy}
            onClick={() => void handleUpload()}
          >
            {uploading ? "Uploading…" : "Start lookup"}
          </button>

          {isRunning && (
            <p className="mMuted" style={{ fontSize: 11.5, marginTop: 10 }}>
              Lookups are paced 6–12s apart to stay friendly with HP&apos;s site, so large
              files take a while. You can close the app — the job keeps running on the
              server.
            </p>
          )}
        </div>

        {job && counts && (
          <>
            <div className="mSectionTitle">Current job</div>
            <div className="mCard">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, wordBreak: "break-word" }}>
                    {job.originalFileName}
                  </div>
                  <div className="mMuted" style={{ fontSize: 11.5, textTransform: "capitalize" }}>
                    {job.status}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--m-primary)" }}>
                  {percent}%
                </div>
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "var(--m-border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background:
                      job.status === "completed" ? "var(--m-good)" : "var(--m-primary)",
                  }}
                />
              </div>

              {remaining > 0 && (
                <div className="mMuted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  {remaining} left · about {formatEta(remaining)} remaining
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--m-border)",
                }}
              >
                <Mini label="Total" value={counts.total} />
                <Mini label="Done" value={counts.done} color="var(--m-good)" />
                <Mini label="Not found" value={counts.notFound} color="var(--m-warn)" />
                <Mini label="No serial" value={counts.noSerial} />
                <Mini label="Pending" value={counts.pending} />
                <Mini label="Failed" value={counts.failed} color="var(--m-danger)" />
              </div>

              {job.status === "completed" && (
                <button
                  type="button"
                  className="mBtn"
                  style={{ marginTop: 14 }}
                  disabled={busy}
                  onClick={() => void handleDownload()}
                >
                  ⬇ Download workbook
                </button>
              )}
              {counts.failed > 0 && (
                <button
                  type="button"
                  className="mBtn mBtn--ghost"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  onClick={() => void handleRetry()}
                >
                  ↻ Retry {counts.failed} failed
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Mini({
  label, value, color,
}: Readonly<{ label: string; value: number; color?: string }>) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: color ?? "var(--m-text)" }}>
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: "var(--m-muted)", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
