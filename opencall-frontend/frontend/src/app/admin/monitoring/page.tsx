"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getMonitoringDashboard,
  type MonitoringDashboard,
  type RegionDashboardEntry,
} from "../../../lib/monitoringApiClient";
import { readSession, type ClientSession } from "../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
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

export default function MonitoringDashboardPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(readSession());
  }, []);

  function reload() {
    if (!session) return;
    setBusy(true);
    setError(null);
    getMonitoringDashboard(session.token, null, 20)
      .then(setDashboard)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load dashboard"),
      )
      .finally(() => setBusy(false));
  }

  useEffect(reload, [session]);

  if (!dashboard) {
    return (
      <section className="adminPage">
        {error ? <div className="adminError">{error}</div> : (
          <p className="muted">Loading monitoring dashboard…</p>
        )}
      </section>
    );
  }

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Operational monitoring</h2>
          <small className="muted">
            Snapshot generated {formatDate(dashboard.generatedAt)}
          </small>
        </div>
        <div className="adminPageActions">
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
          <span>Active regions</span>
          <strong>
            {dashboard.summary.activeRegions} / {dashboard.summary.totalRegions}
          </strong>
        </div>
        <div className="metric">
          <span>Active users</span>
          <strong>{dashboard.summary.totalActiveUsers}</strong>
        </div>
        <div className="metric">
          <span>Reports (30d)</span>
          <strong>{dashboard.summary.totalReports30d}</strong>
        </div>
        <div className="metric">
          <span>Pending manual entries</span>
          <strong>{dashboard.summary.totalPendingManualEntries}</strong>
        </div>
      </div>

      <div className="adminGrid">
        {dashboard.regions.map((r) => (
          <RegionTile key={r.regionId} region={r} />
        ))}
      </div>

      <div className="adminGrid" style={{ marginTop: 24 }}>
        <ActivityFeed
          title="Recent logins"
          rows={dashboard.recentLogins.map((row) => ({
            primary: row.username ?? row.email,
            secondary: `${row.role}${row.regionId ? ` · ${row.regionId.slice(0, 8)}` : ""}`,
            time: row.lastLoginAt,
            tone: row.isActive ? "good" : "bad",
            toneLabel: row.isActive ? "active" : "inactive",
          }))}
        />
        <ActivityFeed
          title="Recent uploads"
          rows={dashboard.recentUploads.map((row) => ({
            primary: row.originalFileName,
            secondary: `${row.sourceType} · ${row.rowCount} rows · ${row.errorCount} errors`,
            time: row.createdAt,
            tone:
              row.status === "FAILED"
                ? "bad"
                : row.status === "PROCESSED" || row.status === "VALIDATED"
                  ? "good"
                  : "neutral",
            toneLabel: row.status,
          }))}
        />
        <ActivityFeed
          title="Recent reports"
          rows={dashboard.recentReports.map((row) => ({
            primary: `Report ${row.reportDate}`,
            secondary: `${row.totalRows} rows · ${row.duplicateTicketCount} dupes · ${row.unmatchedTicketCount} unmatched`,
            time: row.createdAt,
            tone: "neutral",
            toneLabel: "GENERATED",
          }))}
        />
      </div>
    </section>
  );
}

function RegionTile({ region }: { region: RegionDashboardEntry }) {
  return (
    <div className="panel regionTile">
      <div className="regionTileHeader">
        <div>
          <h3>{region.regionName}</h3>
          <small className="muted">{region.regionCode}</small>
        </div>
        <Link
          className="btnSecondary"
          href={`/admin/monitoring/regions/${region.regionId}`}
        >
          Drill in →
        </Link>
      </div>

      <div className="regionTileGrid">
        <div className="metric small">
          <span>Active users</span>
          <strong>{region.activeUserCount}</strong>
        </div>
        <div className="metric small">
          <span>Logins 24h</span>
          <strong>{region.recentLoginCount24h}</strong>
        </div>
        <div className="metric small">
          <span>Reports 30d</span>
          <strong>{region.reportCount30d}</strong>
        </div>
        <div
          className={`metric small ${
            region.failedBatchCount30d > 0 ? "alert" : ""
          }`}
        >
          <span>Failed uploads 30d</span>
          <strong>{region.failedBatchCount30d}</strong>
        </div>
        <div
          className={`metric small ${
            region.pendingManualEntries > 0 ? "alert" : ""
          }`}
        >
          <span>Pending manual entries</span>
          <strong>{region.pendingManualEntries}</strong>
        </div>
      </div>

      <dl className="adminDefList compact">
        <dt>Last login</dt>
        <dd>{relativeAge(region.lastLoginAt)}</dd>
        <dt>Last upload</dt>
        <dd>{relativeAge(region.lastUploadAt)}</dd>
        <dt>Last report</dt>
        <dd>{relativeAge(region.lastReportGeneratedAt)}</dd>
      </dl>

      {region.rtplMetrics.length > 0 && (
        <div className="rtplBlock">
          <h4>RTPL distribution (latest report)</h4>
          <ul className="rtplList">
            {region.rtplMetrics.slice(0, 6).map((m) => (
              <li key={m.rtplStatus}>
                <span>{m.rtplStatus}</span>
                <strong>{m.count}</strong>
              </li>
            ))}
            {region.rtplMetrics.length > 6 && (
              <li className="muted">
                +{region.rtplMetrics.length - 6} more…
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActivityFeed({
  title,
  rows,
}: {
  title: string;
  rows: {
    primary: string;
    secondary: string;
    time: string | null;
    tone: "good" | "bad" | "neutral" | "warn";
    toneLabel: string;
  }[];
}) {
  return (
    <div className="panel activityFeed">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <ul className="activityList">
          {rows.map((row, idx) => (
            <li key={idx}>
              <div className="activityPrimary">
                <strong>{row.primary}</strong>
                <span className={`adminTag ${row.tone}`}>{row.toneLabel}</span>
              </div>
              <div className="activitySecondary muted">{row.secondary}</div>
              <div className="activityTime muted">{relativeAge(row.time)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
