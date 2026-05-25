"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getRcaTimeline,
  type RcaActionKind,
  type RcaSeverity,
  type RcaTimelineEntry,
  type RcaTimelineResponse,
  type RcaTrackedField,
} from "../../../../lib/rcaApiClient";
import { readSession, type ClientSession } from "../../../../lib/session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
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

const FIELD_LABELS: Record<RcaTrackedField, string> = {
  rtpl_status: "Status",
  segment: "Segment",
  engineer: "Engineer",
  location: "Location",
  case_created_time: "Case opened",
  hp_owner_status: "HP owner",
  customer_mail: "Customer email",
  rca: "RCA",
  remarks: "Remarks",
  manual_notes: "Manual notes",
};

function fieldLabel(field: RcaTrackedField | string): string {
  return FIELD_LABELS[field as RcaTrackedField] ?? field;
}

const ACTION_LABELS: Record<RcaActionKind, string> = {
  FIRST_APPEARANCE: "Case opened",
  MANUAL_EDIT: "Manual update",
  FRESH_FROM_UPLOAD: "Fresh data from upload",
  CARRIED_FORWARD: "No update (auto carry-forward)",
  NO_CHANGE: "No update",
};

function actionTone(kind: RcaActionKind): string {
  if (kind === "MANUAL_EDIT") return "good";
  if (kind === "FIRST_APPEARANCE") return "neutral";
  if (kind === "FRESH_FROM_UPLOAD") return "neutral";
  if (kind === "NO_CHANGE" || kind === "CARRIED_FORWARD") return "warn";
  return "neutral";
}

function entryActor(entry: RcaTimelineEntry): string {
  if (entry.updatedByUsername) return entry.updatedByUsername;
  if (entry.updatedByEmail) return entry.updatedByEmail;
  return "—";
}

export default function AdminRcaDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = decodeURIComponent(params?.ticketId ?? "");
  const [session, setSession] = useState<ClientSession | null>(null);
  const [data, setData] = useState<RcaTimelineResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (!session || !ticketId) return;
    setBusy(true);
    setError(null);
    getRcaTimeline(session.token, ticketId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load case"))
      .finally(() => setBusy(false));
  }, [session, ticketId]);

  const reversedEntries = useMemo(
    () => (data ? [...data.entries].reverse() : []),
    [data],
  );

  if (!session) {
    return (
      <section className="adminPage">
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (busy && !data) {
    return (
      <section className="adminPage">
        <p className="muted">Loading case timeline…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="adminPage">
        <div className="adminPageHeader">
          <div>
            <Link href="/admin/rca" className="adminNavLink">
              ← Back to RCA
            </Link>
            <h2 style={{ marginTop: 12 }}>{ticketId}</h2>
          </div>
        </div>
        <div className="adminError">{error}</div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="adminPage">
        <p className="muted">Case not found.</p>
      </section>
    );
  }

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <Link href="/admin/rca" className="adminNavLink">
            ← Back to RCA
          </Link>
          <p className="eyebrow" style={{ marginTop: 12 }}>Case timeline</p>
          <h2>
            {data.ticketId}{" "}
            <span className={`adminTag ${severityTone(data.severity)}`}>
              {severityLabel(data.severity)}
            </span>
          </h2>
          <small className="muted">
            {data.customerName || data.accountName || "—"}
            {data.regionName ? ` · ${data.regionName}` : ""}
            {data.workLocation ? ` · ${data.workLocation}` : ""}
          </small>
        </div>
      </div>

      <div className="rcaDetailHeader">
        <div className="rcaDetailMeta">
          <div>
            <p className="rcaMetaLabel">Customer</p>
            <p className="rcaMetaValue">{data.customerName || "—"}</p>
          </div>
          <div>
            <p className="rcaMetaLabel">Account</p>
            <p className="rcaMetaValue">{data.accountName || "—"}</p>
          </div>
          <div>
            <p className="rcaMetaLabel">Case ID</p>
            <p className="rcaMetaValue">{data.caseId || "—"}</p>
          </div>
          <div>
            <p className="rcaMetaLabel">Customer email</p>
            <p className="rcaMetaValue">{data.customerMail || "—"}</p>
          </div>
          <div>
            <p className="rcaMetaLabel">Current status</p>
            <p className="rcaMetaValue">{data.currentStatus || "—"}</p>
          </div>
          <div>
            <p className="rcaMetaLabel">Current engineer</p>
            <p className="rcaMetaValue">{data.currentEngineer || "—"}</p>
          </div>
        </div>

        <div className="rcaStatGrid compact">
          <div className="rcaStat">
            <p className="rcaStatLabel">Days open</p>
            <p className="rcaStatValue">{data.daysOpen}</p>
            <p className="rcaStatMeta">
              Since {formatDate(data.caseCreatedTime ?? data.firstSeenDate)}
            </p>
          </div>
          <div
            className={`rcaStat ${data.severity === "critical" ? "critical" : data.severity === "warn" ? "warn" : ""}`}
          >
            <p className="rcaStatLabel">Days since last action</p>
            <p className="rcaStatValue">{data.daysSinceLastAction}</p>
            <p className="rcaStatMeta">
              {data.daysSinceLastAction >= 2
                ? "Highlight: needs intervention"
                : "Recently updated"}
            </p>
          </div>
          <div className="rcaStat neutral">
            <p className="rcaStatLabel">Total actions taken</p>
            <p className="rcaStatValue">
              {data.totalActions}
              <span className="rcaStatValueSub"> / {data.totalAppearances}d</span>
            </p>
            <p className="rcaStatMeta">Across all daily reports</p>
          </div>
        </div>
      </div>

      {data.currentRca && (
        <div className="rcaCurrentRca">
          <p className="rcaMetaLabel">Latest RCA on file</p>
          <p className="rcaCurrentRcaBody">{data.currentRca}</p>
        </div>
      )}

      <div className="rcaTimelineHeader">
        <h3>Day-by-day actions</h3>
        <small className="muted">
          Newest first. Gaps where no action was taken are flagged so the team can substantiate
          the work history if challenged by the customer.
        </small>
      </div>

      <ol className="rcaTimeline">
        {reversedEntries.map((entry, idx) => {
          const isStaleGap = entry.daysSincePreviousEntry >= 2 && idx !== reversedEntries.length - 1;
          const tone = actionTone(entry.actionKind);
          return (
            <li key={entry.reportId} className={`rcaTimelineEntry rcaTone-${tone}`}>
              {isStaleGap && (
                <div className="rcaGapBanner">
                  ⚠ {entry.daysSincePreviousEntry} day gap since the prior action
                </div>
              )}
              <div className="rcaTimelineDot" aria-hidden="true" />
              <div className="rcaTimelineCard">
                <div className="rcaTimelineCardHeader">
                  <div>
                    <p className="rcaTimelineDay">Day {entry.dayNo}</p>
                    <h4>{formatDate(entry.reportDate)}</h4>
                    <small className="muted">
                      Report generated {formatDateTime(entry.reportCreatedAt)}
                    </small>
                  </div>
                  <div className="rcaTimelineCardTags">
                    <span className={`adminTag ${tone}`}>{ACTION_LABELS[entry.actionKind]}</span>
                    {entry.updatedAt && (
                      <span className="adminTag neutral">
                        by {entryActor(entry)} · {formatDateTime(entry.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="activityChipRow">
                  {entry.status && (
                    <span className="activityChip">
                      <span className="activityChipLabel">Status</span>
                      <span className="activityChipValue">{entry.status}</span>
                    </span>
                  )}
                  {entry.engineer && (
                    <span className="activityChip">
                      <span className="activityChipLabel">Engineer</span>
                      <span className="activityChipValue">{entry.engineer}</span>
                    </span>
                  )}
                  {entry.location && (
                    <span className="activityChip">
                      <span className="activityChipLabel">Location</span>
                      <span className="activityChipValue">{entry.location}</span>
                    </span>
                  )}
                  {entry.segment && (
                    <span className="activityChip">
                      <span className="activityChipLabel">Segment</span>
                      <span className="activityChipValue">{entry.segment}</span>
                    </span>
                  )}
                  {entry.workLocation && (
                    <span className="activityChip">
                      <span className="activityChipLabel">ASP</span>
                      <span className="activityChipValue">{entry.workLocation}</span>
                    </span>
                  )}
                </div>

                {entry.changedFields.length > 0 && (
                  <div className="rcaTimelineBlock">
                    <p className="rcaMetaLabel">Fields updated this day</p>
                    <div className="activityChipRow">
                      {entry.changedFields.map((field) => (
                        <span key={field} className="activityChip rcaChipChanged">
                          <span className="activityChipLabel">Changed</span>
                          <span className="activityChipValue">{fieldLabel(field)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entry.carriedForwardFields.length > 0 && (
                  <div className="rcaTimelineBlock">
                    <p className="rcaMetaLabel">Auto-carried from prior report</p>
                    <div className="activityChipRow">
                      {entry.carriedForwardFields.map((field) => (
                        <span key={field} className="activityChip rcaChipCarried">
                          <span className="activityChipLabel">Carried</span>
                          <span className="activityChipValue">{fieldLabel(field)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entry.rca && (
                  <div className="rcaTimelineBlock">
                    <p className="rcaMetaLabel">RCA note</p>
                    <p className="rcaTimelineText">{entry.rca}</p>
                  </div>
                )}

                {entry.remarks && (
                  <div className="rcaTimelineBlock">
                    <p className="rcaMetaLabel">Remarks</p>
                    <p className="rcaTimelineText">{entry.remarks}</p>
                  </div>
                )}

                {entry.manualNotes && (
                  <div className="rcaTimelineBlock">
                    <p className="rcaMetaLabel">Internal notes</p>
                    <p className="rcaTimelineText">{entry.manualNotes}</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
