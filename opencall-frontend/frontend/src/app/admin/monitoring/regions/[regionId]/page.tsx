"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getRegionDrillDown,
  type RegionDrillDown,
} from "../../../../../lib/monitoringApiClient";
import { readSession, type ClientSession } from "../../../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function relativeAge(value: string | null): string {
  if (!value) return "never";
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RegionDrillDownPage() {
  const router = useRouter();
  const params = useParams<{ regionId: string }>();
  const regionId = Array.isArray(params.regionId)
    ? params.regionId[0]
    : params.regionId;

  const [session, setSession] = useState<ClientSession | null>(null);
  const [data, setData] = useState<RegionDrillDown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(readSession());
  }, []);

  function reload() {
    if (!session || !regionId) return;
    setBusy(true);
    setError(null);
    getRegionDrillDown(session.token, regionId, 50)
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load region"),
      )
      .finally(() => setBusy(false));
  }

  useEffect(reload, [session, regionId]);

  if (!data) {
    return (
      <section className="adminPage">
        {error ? (
          <div className="adminError">{error}</div>
        ) : (
          <p className="muted">Loading region…</p>
        )}
      </section>
    );
  }

  const r = data.region;

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h2>
            {r.regionName}
            <span className={`adminTag ${r.regionIsActive ? "good" : "bad"}`} style={{ marginLeft: 12 }}>
              {r.regionIsActive ? "active" : "inactive"}
            </span>
          </h2>
          <small className="muted">{r.regionCode}</small>
        </div>
        <div className="adminPageActions">
          <button
            type="button"
            className="btnSecondary"
            onClick={() => router.push("/admin/monitoring")}
          >
            ← Dashboard
          </button>
          <button
            type="button"
            className="btnSecondary"
            onClick={reload}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="adminError">{error}</div>}

      <div className="metricGrid" style={{ marginBottom: 24 }}>
        <div className="metric">
          <span>Active users</span>
          <strong>{r.activeUserCount}</strong>
        </div>
        <div className="metric">
          <span>Logins 24h</span>
          <strong>{r.recentLoginCount24h}</strong>
        </div>
        <div className="metric">
          <span>Reports 30d</span>
          <strong>{r.reportCount30d}</strong>
        </div>
        <div className={`metric ${r.failedBatchCount30d > 0 ? "alert" : ""}`}>
          <span>Failed uploads 30d</span>
          <strong>{r.failedBatchCount30d}</strong>
        </div>
        <div className={`metric ${r.pendingManualEntries > 0 ? "alert" : ""}`}>
          <span>Pending manual entries</span>
          <strong>{r.pendingManualEntries}</strong>
        </div>
      </div>

      <div className="adminGrid">
        <div className="panel">
          <h3>Operational timestamps</h3>
          <dl className="adminDefList">
            <dt>Last login</dt>
            <dd>
              {formatDate(r.lastLoginAt)}{" "}
              <span className="muted">({relativeAge(r.lastLoginAt)})</span>
            </dd>
            <dt>Last upload</dt>
            <dd>
              {formatDate(r.lastUploadAt)}{" "}
              <span className="muted">({relativeAge(r.lastUploadAt)})</span>
            </dd>
            <dt>Last report generated</dt>
            <dd>
              {formatDate(r.lastReportGeneratedAt)}{" "}
              <span className="muted">
                ({relativeAge(r.lastReportGeneratedAt)})
              </span>
            </dd>
          </dl>
        </div>

        <div className="panel">
          <h3>RTPL distribution (latest report)</h3>
          {r.rtplMetrics.length === 0 ? (
            <p className="muted">No report rows available.</p>
          ) : (
            <ul className="rtplList">
              {r.rtplMetrics.map((m) => (
                <li key={m.rtplStatus}>
                  <span>{m.rtplStatus}</span>
                  <strong>{m.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel activityFeed">
          <h3>Recent logins</h3>
          {data.recentLogins.length === 0 ? (
            <p className="muted">No logins yet.</p>
          ) : (
            <ul className="activityList">
              {data.recentLogins.map((row) => (
                <li key={row.userId}>
                  <div className="activityPrimary">
                    <strong>{row.username ?? row.email}</strong>
                    <span className={`adminTag ${row.isActive ? "good" : "bad"}`}>
                      {row.isActive ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="activitySecondary muted">{row.email}</div>
                  <div className="activityTime muted">
                    {relativeAge(row.lastLoginAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel activityFeed">
          <h3>Recent uploads</h3>
          {data.recentUploads.length === 0 ? (
            <p className="muted">No uploads yet.</p>
          ) : (
            <ul className="activityList">
              {data.recentUploads.map((row) => (
                <li key={row.batchId}>
                  <div className="activityPrimary">
                    <strong>{row.originalFileName}</strong>
                    <span
                      className={`adminTag ${
                        row.status === "FAILED"
                          ? "bad"
                          : row.status === "VALIDATED" ||
                              row.status === "PROCESSED"
                            ? "good"
                            : "neutral"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <div className="activitySecondary muted">
                    {row.sourceType} · {row.rowCount} rows · {row.errorCount}{" "}
                    errors
                  </div>
                  <div className="activityTime muted">
                    {relativeAge(row.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel activityFeed">
          <h3>Recent reports</h3>
          {data.recentReports.length === 0 ? (
            <p className="muted">No reports yet.</p>
          ) : (
            <ul className="activityList">
              {data.recentReports.map((row) => (
                <li key={row.reportId}>
                  <div className="activityPrimary">
                    <strong>Report {row.reportDate}</strong>
                    <span className="adminTag neutral">GENERATED</span>
                  </div>
                  <div className="activitySecondary muted">
                    {row.totalRows} rows · {row.duplicateTicketCount} dupes ·{" "}
                    {row.unmatchedTicketCount} unmatched
                  </div>
                  <div className="activityTime muted">
                    {relativeAge(row.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
