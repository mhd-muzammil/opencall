// Case Details slide-over, opened from the eye icon in the records table.
// Shows a single record's full field detail (available immediately from the
// row already in memory) plus its day-by-day status lifecycle fetched from the
// RCA timeline endpoint. Falls back to the locally-loaded RTPL status changes
// when the timeline endpoint is unavailable (e.g. permission or no history).
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getRcaTimeline,
  type RcaTimelineResponse,
  type RcaTimelineEntry,
  type RcaActionKind,
  type RcaTrackedField,
} from "../../../lib/rcaApiClient";
import { getRtplStatusChanges } from "../../../lib/apiClient";
import type { ReportRow, RtplStatusChange } from "../../../lib/api/types";

// ── Local formatting helpers (mirrors the RCA detail page) ──────────
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
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

function changeTypeTone(changeType: string | null | undefined): string {
  switch (changeType) {
    case "NEW":
    case "NEW_WORK_ORDER":
      return "good";
    case "CLOSED":
      return "neutral";
    case "UPDATED":
      return "warn";
    default:
      return "neutral";
  }
}

type TimelineItem =
  | { kind: "entry"; entry: RcaTimelineEntry }
  | { kind: "quiet"; entries: RcaTimelineEntry[] };

function StatusChips({ entry }: { entry: RcaTimelineEntry }) {
  return (
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
    </div>
  );
}

// A single timeline entry — a report run where something happened (first
// appearance, manual edit, fresh upload, or any changed field).
function EntryCard({ entry }: { entry: RcaTimelineEntry }) {
  const tone = actionTone(entry.actionKind);
  const showGap = entry.daysSincePreviousEntry >= 2 && entry.actionKind !== "FIRST_APPEARANCE";
  return (
    <li className={`rcaTimelineEntry rcaTone-${tone}`}>
      {showGap && (
        <div className="rcaGapBanner">
          ⚠ {entry.daysSincePreviousEntry} day gap since the prior action
        </div>
      )}
      <div className="rcaTimelineDot" aria-hidden="true" />
      <div className="rcaTimelineCard">
        <div className="rcaTimelineCardHeader">
          <div>
            <p className="rcaTimelineDay">Report #{entry.dayNo}</p>
            <h4>{formatDate(entry.reportDate)}</h4>
            <small className="caseSubtleNote">
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

        <StatusChips entry={entry} />

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
}

// A collapsed run of consecutive report appearances where nothing changed.
// Reports are generated many times per day, so a long quiet stretch would
// otherwise show as dozens of identical "No update" cards. We summarise the
// span and let the user expand to see each individual run for the audit trail.
function QuietGroupCard({ entries }: { entries: RcaTimelineEntry[] }) {
  const [open, setOpen] = useState(false);
  const newest = entries[0];
  const oldest = entries[entries.length - 1];
  if (!newest || !oldest) return null;
  const sameDay = formatDate(newest.reportDate) === formatDate(oldest.reportDate);
  const rangeLabel = sameDay
    ? formatDate(newest.reportDate)
    : `${formatDate(oldest.reportDate)} → ${formatDate(newest.reportDate)}`;
  return (
    <li className="rcaTimelineEntry rcaTone-warn">
      <div className="rcaTimelineDot" aria-hidden="true" />
      <div className="rcaTimelineCard caseQuietCard">
        <div className="rcaTimelineCardHeader">
          <div>
            <p className="rcaTimelineDay">No change</p>
            <h4>{rangeLabel}</h4>
            <small className="caseSubtleNote">
              {entries.length} report runs · #{oldest.dayNo}–#{newest.dayNo}
            </small>
          </div>
          <div className="rcaTimelineCardTags">
            <span className="adminTag warn">No update</span>
          </div>
        </div>

        <StatusChips entry={newest} />

        {newest.rca && (
          <div className="rcaTimelineBlock">
            <p className="rcaMetaLabel">RCA note</p>
            <p className="rcaTimelineText">{newest.rca}</p>
          </div>
        )}

        <button
          type="button"
          className="caseQuietToggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? "Hide individual runs" : `Show all ${entries.length} report runs`}
        </button>

        {open && (
          <ul className="caseQuietList">
            {entries.map((e) => (
              <li key={e.reportId}>
                Report #{e.dayNo} · {formatDateTime(e.reportCreatedAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

interface StatusEvent {
  status: string;
  at: string;
  by: string | null;
  note: string | null;
}

// Clean status-progression timeline: one row per RTPL status change, with the
// date it happened, who changed it, and a step counter (n/total).
function StatusProgressTimeline({ events }: { events: StatusEvent[] }) {
  const total = events.length;
  return (
    <ol className="statusFlow">
      {events.map((ev, i) => {
        const isCurrent = i === total - 1;
        const isStart = i === 0 && total > 1;
        return (
          <li className="statusFlowItem" key={`${ev.status}-${ev.at}-${i}`}>
            <span
              className={`statusFlowDot${isCurrent ? " statusFlowDotCurrent" : ""}`}
              aria-hidden="true"
            />
            <div className="statusFlowMain">
              <div className="statusFlowTop">
                <span className="statusFlowTitleWrap">
                  <span className="statusFlowTitle">{ev.status}</span>
                  {isCurrent && <span className="statusFlowTag statusFlowTagCurrent">Current</span>}
                  {isStart && <span className="statusFlowTag statusFlowTagStart">Start</span>}
                </span>
                <span className="statusFlowMeta">
                  <span className="statusFlowDate">{formatDateTime(ev.at)}</span>
                  {ev.by && <span className="statusFlowActor">{ev.by}</span>}
                </span>
                <span className="statusFlowBadge">
                  {i + 1}/{total}
                </span>
              </div>
              {ev.note && <p className="statusFlowNote">{ev.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface InfoItem {
  label: string;
  value: string;
}

export function CaseDetailDrawer({
  row,
  token,
  localStatusChanges,
  onClose,
}: Readonly<{
  row: ReportRow;
  token: string;
  localStatusChanges: readonly RtplStatusChange[];
  onClose: () => void;
}>) {
  const out = row.output ?? {};
  const readVal = (key: string): string => {
    const v = out[key];
    if (v === null || v === undefined || v === "") return "";
    return String(v);
  };

  const ticketId = readVal("Ticket ID").trim();
  const caseId = readVal("Case ID");
  const customerName = readVal("Customer Name");
  const workLocation = readVal("Work Location");
  const rtplStatus = readVal("RTPL status");
  const flexStatus = readVal("Flex Status");
  const segment = readVal("Segment");
  const changeType = row.comparison?.changeType ?? null;

  const [timeline, setTimeline] = useState<RcaTimelineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(ticketId));
  const [error, setError] = useState<string | null>(null);
  // Granular per-ticket status changes (every transition, incl. multiple/day).
  const [ticketChanges, setTicketChanges] = useState<RtplStatusChange[]>([]);
  const [changesLoading, setChangesLoading] = useState<boolean>(Boolean(ticketId));

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch the per-case lifecycle timeline.
  useEffect(() => {
    if (!ticketId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRcaTimeline(token, ticketId)
      .then((res) => {
        if (!cancelled) setTimeline(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load full history.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ticketId]);

  // Fetch every recorded RTPL status change for this ticket across all reports.
  useEffect(() => {
    if (!ticketId) {
      setChangesLoading(false);
      return;
    }
    let cancelled = false;
    setChangesLoading(true);
    getRtplStatusChanges({ token, ticketId, limit: 200 })
      .then((res) => {
        if (!cancelled) setTicketChanges(res);
      })
      .catch(() => {
        if (!cancelled) setTicketChanges([]);
      })
      .finally(() => {
        if (!cancelled) setChangesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ticketId]);

  // Newest-first ordering for the timeline.
  const reversedEntries = useMemo<RcaTimelineEntry[]>(
    () => (timeline ? [...timeline.entries].reverse() : []),
    [timeline],
  );

  // Collapse consecutive "no change" report runs into a single summary card so
  // the timeline highlights real activity instead of dozens of identical rows.
  const groupedTimeline = useMemo<TimelineItem[]>(() => {
    const isQuiet = (e: RcaTimelineEntry) =>
      (e.actionKind === "NO_CHANGE" || e.actionKind === "CARRIED_FORWARD") &&
      e.changedFields.length === 0;
    const items: TimelineItem[] = [];
    let run: RcaTimelineEntry[] = [];
    const flush = () => {
      const first = run[0];
      if (!first) return;
      items.push(run.length === 1 ? { kind: "entry", entry: first } : { kind: "quiet", entries: run });
      run = [];
    };
    for (const entry of reversedEntries) {
      if (isQuiet(entry)) {
        run.push(entry);
      } else {
        flush();
        items.push({ kind: "entry", entry });
      }
    }
    flush();
    return items;
  }, [reversedEntries]);

  // Fallback: this row's RTPL status changes already loaded on the page.
  const fallbackChanges = useMemo(
    () =>
      localStatusChanges
        .filter((c) => row.id != null && c.rowId === row.id)
        .slice()
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),
    [localStatusChanges, row.id],
  );

  // PRIMARY source — every recorded status change for the ticket, in order.
  // This captures multiple changes within the same day, unlike per-report
  // snapshots which only keep the status as of when each report ran.
  const granularStatusEvents = useMemo<StatusEvent[]>(() => {
    if (ticketChanges.length === 0) return [];
    // A per-report remark/RCA note, keyed by reportId, to annotate each change.
    const noteByReport = new Map<string, string>();
    if (timeline) {
      for (const e of timeline.entries) {
        const n = e.remarks || e.rca;
        if (n) noteByReport.set(e.reportId, n);
      }
    }
    const sorted = [...ticketChanges].sort(
      (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    const events: StatusEvent[] = [];

    // Beginning: the status the case held before its first recorded change.
    const firstChange = sorted[0];
    const initialStatus = firstChange?.fromStatus?.trim();
    let prev: string | null = null;
    if (firstChange && initialStatus) {
      events.push({
        status: initialStatus,
        at: timeline?.caseCreatedTime || timeline?.firstSeenDate || firstChange.changedAt,
        by: null,
        note: null,
      });
      prev = initialStatus;
    }

    // Each transition; only re-show a note when it actually changes so the same
    // remark doesn't repeat on every change within one report.
    let prevNote: string | null = null;
    for (const c of sorted) {
      const s = c.toStatus ? c.toStatus.trim() : "";
      if (!s || s === prev) continue;
      const rawNote = noteByReport.get(c.reportId) ?? null;
      events.push({
        status: s,
        at: c.changedAt,
        by: c.changedBy,
        note: rawNote && rawNote !== prevNote ? rawNote : null,
      });
      if (rawNote) prevNote = rawNote;
      prev = s;
    }
    return events;
  }, [ticketChanges, timeline]);

  // Fallback — per-report snapshots (misses intra-day changes, but covers
  // upload-driven transitions that were never manually edited).
  const snapshotStatusEvents = useMemo<StatusEvent[]>(() => {
    if (!timeline) return [];
    const events: StatusEvent[] = [];
    let prev: string | null = null;
    for (const e of timeline.entries) {
      const s = e.status ? e.status.trim() : "";
      if (s && s !== prev) {
        events.push({
          status: s,
          at: e.reportCreatedAt || e.reportDate,
          by: e.updatedByUsername || e.updatedByEmail || null,
          note: e.remarks || e.rca || null,
        });
        prev = s;
      }
    }
    return events;
  }, [timeline]);

  // Last-resort fallback — status changes already loaded on the page for this row.
  const localRowStatusEvents = useMemo<StatusEvent[]>(
    () =>
      [...fallbackChanges]
        .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
        .filter((c) => c.toStatus)
        .map((c) => ({ status: String(c.toStatus), at: c.changedAt, by: c.changedBy, note: null })),
    [fallbackChanges],
  );

  // Prefer the complete granular history; degrade gracefully when unavailable.
  const statusEvents =
    granularStatusEvents.length > 0
      ? granularStatusEvents
      : snapshotStatusEvents.length > 0
        ? snapshotStatusEvents
        : localRowStatusEvents;

  const statusTimelineLoading = loading || changesLoading;

  const customerItems: InfoItem[] = [
    { label: "Customer Name", value: customerName || timeline?.customerName || "" },
    { label: "Customer Email", value: readVal("Customer Mail") || timeline?.customerMail || "" },
    { label: "Work Location (ASP)", value: workLocation || timeline?.workLocation || "" },
    { label: "Location", value: readVal("Location") },
    { label: "Region", value: timeline?.regionName ?? "" },
  ];

  const caseItems: InfoItem[] = [
    { label: "Case ID", value: caseId || timeline?.caseId || "" },
    { label: "WO OTC Code", value: readVal("WO OTC CODE") },
    { label: "Product Line", value: readVal("Product Line Name") },
    { label: "Segment", value: segment },
    { label: "Customer Type", value: row.enriched?.customer_type ?? "" },
    { label: "Case Created", value: readVal("Case Created Time") || formatDate(timeline?.caseCreatedTime) },
  ];

  const statusItems: InfoItem[] = [
    { label: "RTPL Status", value: rtplStatus },
    { label: "Flex Status", value: flexStatus },
    { label: "WIP Aging", value: readVal("WIP aging") ? `${readVal("WIP aging")} days` : "" },
    {
      label: "Status Aging",
      value:
        readVal("Status Aging") ||
        (row.enriched?.current_status_aging != null ? `${row.enriched.current_status_aging} days` : ""),
    },
    { label: "Engineer", value: readVal("Engineer") || timeline?.currentEngineer || "" },
    { label: "HP Owner Status", value: readVal("HP Owner Status") },
  ];

  const metrics: InfoItem[] = [];
  if (timeline?.daysOpen != null) metrics.push({ label: "Days Open", value: String(timeline.daysOpen) });
  if (timeline?.daysSinceLastAction != null)
    metrics.push({ label: "Since Last Action", value: `${timeline.daysSinceLastAction}d` });
  if (timeline?.totalAppearances != null)
    metrics.push({ label: "Appearances", value: String(timeline.totalAppearances) });
  if (timeline?.totalActions != null)
    metrics.push({ label: "Actions Taken", value: String(timeline.totalActions) });

  const comparison = row.comparison;
  const changedFieldKeys = comparison?.changedFields ? Object.keys(comparison.changedFields) : [];


  const renderInfoGrid = (items: InfoItem[]) => (
    <div className="modalInfoGrid">
      {items
        .filter((it) => it.value && it.value !== "—")
        .map((it) => (
          <div className="modalInfoItem" key={it.label}>
            <span>{it.label}</span>
            <strong>{it.value}</strong>
          </div>
        ))}
    </div>
  );

  return (
    <div className="caseModalOverlay" onClick={onClose}>
      <div
        className="caseModalCard"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Case details for ticket ${ticketId || ""}`}
      >
        {/* Header */}
        <header className="caseModalHeader">
          <div className="modalTitleGroup">
            <span className="modalEyebrow">Case Details</span>
            <h2 className="modalTitle">
              Ticket ID: <span className="highlightText">{ticketId || "—"}</span>
            </h2>
            {(customerName || workLocation) && (
              <p className="caseDetailSub">
                {[customerName, workLocation].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button type="button" className="modalCloseBtn" onClick={onClose} title="Close" aria-label="Close case details">
            &times;
          </button>
        </header>

        <div className="caseModalBody">
          {/* Status badge row */}
          <div className="caseBadgeRow">
            {rtplStatus && <span className="caseStatusPill">{rtplStatus}</span>}
            {changeType && <span className={`adminTag ${changeTypeTone(changeType)}`}>{changeType}</span>}
            {flexStatus && (
              <span className="activityChip">
                <span className="activityChipLabel">Flex</span>
                <span className="activityChipValue">{flexStatus}</span>
              </span>
            )}
            {segment && (
              <span className="activityChip">
                <span className="activityChipLabel">Segment</span>
                <span className="activityChipValue">{segment}</span>
              </span>
            )}
          </div>

          {/* Metrics */}
          {metrics.length > 0 && (
            <div className="caseMetricRow">
              {metrics.map((m) => (
                <div className="caseMetric" key={m.label}>
                  <span className="caseMetricValue">{m.value}</span>
                  <span className="caseMetricLabel">{m.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Two-column layout: details (sticky) + timeline */}
          <div className="caseLayout">
            <div className="caseLayoutMain">
              <section className="caseSection">
                <p className="caseSectionTitle">Customer</p>
                {renderInfoGrid(customerItems)}
              </section>

              <section className="caseSection">
                <p className="caseSectionTitle">Case &amp; Product</p>
                {renderInfoGrid(caseItems)}
              </section>

              <section className="caseSection">
                <p className="caseSectionTitle">Status &amp; Assignment</p>
                {renderInfoGrid(statusItems)}
              </section>

              {/* Latest-report changes (day-over-day comparison) */}
              {comparison && (comparison.changeSummary || changedFieldKeys.length > 0) && (
                <section className="caseSection">
                  <p className="caseSectionTitle">Latest report changes</p>
                  {comparison.changeSummary && <p className="rcaTimelineText">{comparison.changeSummary}</p>}
                  {changedFieldKeys.length > 0 && (
                    <div className="activityChipRow">
                      {changedFieldKeys.map((field) => {
                        const diff = comparison.changedFields[field];
                        return (
                          <span key={field} className="activityChip rcaChipChanged">
                            <span className="activityChipLabel">{field}</span>
                            <span className="activityChipValue">
                              {(diff?.from ?? "—")} → {(diff?.to ?? "—")}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {comparison.flexStatusUnchangedDays != null && comparison.flexStatusUnchangedDays > 1 && (
                    <p className="caseSubtleNote">
                      Flex status unchanged for {comparison.flexStatusUnchangedDays} consecutive days.
                    </p>
                  )}
                </section>
              )}
            </div>

            <div className="caseLayoutSide">
              {/* RTPL status progression — when each status changed */}
              <div className="rcaTimelineHeader">
                <h3>RTPL Status Timeline</h3>
                <small className="caseSubtleNote">Each status change and the date it happened.</small>
              </div>

              {statusTimelineLoading && (
                <p className="caseSubtleNote">Loading status history…</p>
              )}

              {!statusTimelineLoading && statusEvents.length > 0 && (
                <StatusProgressTimeline events={statusEvents} />
              )}

              {!statusTimelineLoading && statusEvents.length === 0 && (
                <p className="caseSubtleNote">
                  {error
                    ? "Status history is unavailable for this case."
                    : "No status changes recorded for this case yet."}
                </p>
              )}

              {/* Full report-by-report history (collapsed by default) */}
              {!loading && groupedTimeline.length > 0 && (
                <details className="caseFullHistory">
                  <summary>
                    Show full report-by-report history
                    {timeline?.totalAppearances ? ` (${timeline.totalAppearances} runs)` : ""}
                  </summary>
                  <ol className="rcaTimeline">
                    {groupedTimeline.map((item) =>
                      item.kind === "entry" ? (
                        <EntryCard key={item.entry.reportId} entry={item.entry} />
                      ) : (
                        <QuietGroupCard key={`quiet-${item.entries[0]?.reportId ?? "q"}`} entries={item.entries} />
                      ),
                    )}
                  </ol>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
