"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listAdminRegions, type AdminRegion } from "../../../lib/adminApiClient";
import {
  listRcaCases,
  type RcaCaseSummary,
  type RcaListResult,
  type RcaSeverity,
  type RcaStatusFilter,
} from "../../../lib/rcaApiClient";
import { readSession, type ClientSession } from "../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function relativeDays(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function severityLabel(sev: RcaSeverity): string {
  if (sev === "critical") return "Critical";
  if (sev === "warn") return "Stale";
  return "On track";
}

function severityTone(sev: RcaSeverity): string {
  if (sev === "critical") return "bad";
  if (sev === "warn") return "warn";
  return "good";
}

function severityRowClass(sev: RcaSeverity): string {
  if (sev === "critical") return "rcaRow rcaRowCritical";
  if (sev === "warn") return "rcaRow rcaRowWarn";
  return "rcaRow";
}

function displayName(row: RcaCaseSummary): string {
  return row.customerName?.trim() || row.accountName?.trim() || "—";
}

function regionLabel(row: RcaCaseSummary): string {
  if (row.regionName) return row.regionName;
  if (row.workLocation) return row.workLocation;
  return "—";
}

function lastActor(row: RcaCaseSummary): string {
  if (row.lastActionUsername) return row.lastActionUsername;
  if (row.lastActionEmail) return row.lastActionEmail;
  return "—";
}

export default function AdminRcaPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [regions, setRegions] = useState<AdminRegion[]>([]);
  const [result, setResult] = useState<RcaListResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterRegion, setFilterRegion] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<RcaStatusFilter>("stale");
  const [search, setSearch] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    listAdminRegions(session.token)
      .then(setRegions)
      .catch(() => setRegions([]));
  }, [session]);

  function reload() {
    if (!session) return;
    setBusy(true);
    setError(null);
    listRcaCases(session.token, {
      ...(filterRegion ? { regionId: filterRegion } : {}),
      status: filterStatus,
      ...(search ? { search } : {}),
      limit,
      offset,
    })
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load RCA cases"))
      .finally(() => setBusy(false));
  }

  useEffect(reload, [session, filterRegion, filterStatus, search, offset]);

  const summary = result?.summary;
  const rows = result?.rows ?? [];
  const totalFiltered = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  const criticalBanner = useMemo(() => {
    if (!summary || summary.totalCritical === 0) return null;
    const noun = summary.totalCritical === 1 ? "case has" : "cases have";
    return (
      <div className="rcaBanner critical">
        <div className="rcaBannerIcon" aria-hidden="true">!</div>
        <div className="rcaBannerBody">
          <strong>{summary.totalCritical} {noun} no action for {summary.criticalThresholdDays}+ days.</strong>
          <span className="muted">
            These need a manual update today — long-pending cases trigger consumer complaints.
          </span>
        </div>
        <button
          type="button"
          className="btnSecondary"
          onClick={() => {
            setFilterStatus("critical");
            setOffset(0);
          }}
        >
          Show only critical
        </button>
      </div>
    );
  }, [summary]);

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Root cause analysis</p>
          <h2>RCA &amp; pending action tracker</h2>
          <small className="muted">
            Cases open in each region&apos;s latest daily report (within the last{" "}
            {summary?.recencyWindowDays ?? 7} days), with day-by-day action history. Anything
            with no manual update for 2+ days is highlighted so the team can intervene before
            the customer escalates.
          </small>
        </div>
        <div className="adminPageActions">
          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setOffset(0);
              reload();
            }}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="rcaStatGrid">
        <div className="rcaStat">
          <p className="rcaStatLabel">Open cases</p>
          <p className="rcaStatValue">{summary?.totalOpen.toLocaleString() ?? "—"}</p>
          <p className="rcaStatMeta">
            {summary?.latestReportDate ? `Latest report ${formatDate(summary.latestReportDate)}` : "—"}
            {summary
              ? ` · ${summary.regionsCovered} region${summary.regionsCovered === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="rcaStat warn">
          <p className="rcaStatLabel">Stale ({summary?.staleThresholdDays ?? 2}+ days)</p>
          <p className="rcaStatValue">{summary?.totalStale.toLocaleString() ?? "—"}</p>
          <p className="rcaStatMeta">
            {summary && summary.totalOpen > 0
              ? `${Math.round((summary.totalStale / summary.totalOpen) * 100)}% of open caseload`
              : "—"}
          </p>
        </div>
        <div className="rcaStat critical">
          <p className="rcaStatLabel">Critical ({summary?.criticalThresholdDays ?? 5}+ days)</p>
          <p className="rcaStatValue">{summary?.totalCritical.toLocaleString() ?? "—"}</p>
          <p className="rcaStatMeta">Cases at consumer-complaint risk</p>
        </div>
        <div className="rcaStat neutral">
          <p className="rcaStatLabel">Avg days since last action</p>
          <p className="rcaStatValue">{summary?.avgDaysSinceLastAction.toFixed(1) ?? "—"}</p>
          <p className="rcaStatMeta">
            Avg days open: {summary?.avgDaysOpen.toFixed(1) ?? "—"}
          </p>
        </div>
      </div>

      {criticalBanner}

      <div className="adminFilters">
        <label className="adminField">
          <span>Region</span>
          <select
            value={filterRegion}
            onChange={(e) => {
              setOffset(0);
              setFilterRegion(e.target.value);
            }}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>Status</span>
          <select
            value={filterStatus}
            onChange={(e) => {
              setOffset(0);
              setFilterStatus(e.target.value as RcaStatusFilter);
            }}
          >
            <option value="stale">Stale (needs action)</option>
            <option value="critical">Critical only</option>
            <option value="active">On track</option>
            <option value="all">All cases</option>
          </select>
        </label>
        <label className="adminField rcaSearch">
          <span>Search</span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setSearch(searchInput.trim());
            }}
          >
            <input
              type="search"
              placeholder="Ticket, case, customer, account…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </label>
      </div>

      {error && <div className="adminError">{error}</div>}

      <div className="adminTableWrap">
        <table className="adminTable rcaTable">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Ticket</th>
              <th>Customer / Account</th>
              <th>Region</th>
              <th>Status</th>
              <th>Engineer</th>
              <th>Days open</th>
              <th>Last action</th>
              <th>Actions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {busy ? "Loading…" : "No cases match the current filters."}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.ticketKey} className={severityRowClass(row.severity)}>
                <td>
                  <span className={`adminTag ${severityTone(row.severity)}`}>
                    {severityLabel(row.severity)}
                  </span>
                </td>
                <td>
                  <strong>{row.ticketId}</strong>
                  {row.caseId && <div className="muted" style={{ fontSize: 12 }}>{row.caseId}</div>}
                </td>
                <td>
                  <div>{displayName(row)}</div>
                  {row.accountName && row.customerName && row.accountName !== row.customerName && (
                    <div className="muted" style={{ fontSize: 12 }}>{row.accountName}</div>
                  )}
                </td>
                <td>{regionLabel(row)}</td>
                <td>{row.status?.trim() || <span className="muted">—</span>}</td>
                <td>{row.engineer?.trim() || <span className="muted">—</span>}</td>
                <td>
                  <span className="rcaDaysCell">
                    <strong>{row.daysOpen}</strong>
                    <span className="muted">days</span>
                  </span>
                </td>
                <td>
                  <div>
                    <strong>{relativeDays(row.daysSinceLastAction)}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    by {lastActor(row)}
                  </div>
                </td>
                <td>
                  <span className="rcaDaysCell">
                    <strong>{row.totalActions}</strong>
                    <span className="muted">of {row.totalAppearances}d</span>
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link
                    href={`/admin/rca/${encodeURIComponent(row.ticketId)}`}
                    className="adminNavLink"
                  >
                    View timeline →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminPaginator">
        <span className="muted">
          {totalFiltered} cases · page {currentPage} of {totalPages}
        </span>
        <div className="adminPaginatorButtons">
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btnSecondary"
            disabled={busy || currentPage >= totalPages}
            onClick={() => setOffset(offset + limit)}
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
