import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCustomerEmails,
  pollCustomerEmails,
  setCustomerEmailStatus,
  generateCustomerEmailReply,
  getCustomerEmailReply,
  saveCustomerEmailReply,
  sendCustomerEmailReply,
  type EmailReply,
  type InboundEmailCount,
  type InboundEmailRow,
  type MailboxHealth,
} from "../../../lib/customerEmailApiClient";
import { defaultCabRange, normalizeCabRange } from "../../../lib/cabDateRange";
import { EmailBodyView } from "./EmailBodyView";
import { ComposeModal } from "./ComposeModal";
import { SentMailPanel } from "./SentMailPanel";

/**
 * Customer Emails — a two-pane mail client: message list on the left, the selected message
 * on the right, the way Gmail and Outlook read.
 *
 * REPLIES RUN IN APPROVAL MODE. A draft can be generated from the call's live status and
 * edited, but it only leaves the building when a human presses Approve & send and confirms.
 * Nothing on this page sends by itself, and machine-generated / no-reply senders cannot be
 * replied to at all — that is how auto-responder loops start.
 */

const STATUS_TABS = [
  { key: "NEW", label: "Inbox" },
  { key: "REVIEWED", label: "Reviewed" },
  { key: "IGNORED", label: "Ignored" },
  { key: "ALL", label: "All mail" },
] as const;

const MATCH_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  HIGH: { bg: "#dcfce7", fg: "#166534", label: "WO matched" },
  LOW: { bg: "#fef3c7", fg: "#92400e", label: "Sender matched" },
  NONE: { bg: "#f1f5f9", fg: "#64748b", label: "No match" },
};

/**
 * Escalation styling. HIGH means the sender explicitly named it an escalation (HP calls it
 * an "Elevation") or threatened legal action — that is what a coordinator picks up first.
 * WATCH is only impatient wording.
 */
const ESCALATION_STYLE: Record<string, { bg: string; fg: string; label: string; icon: string }> = {
  HIGH: { bg: "#fee2e2", fg: "#991b1b", label: "Escalation", icon: "🔴" },
  WATCH: { bg: "#ffedd5", fg: "#9a3412", label: "Needs a look", icon: "🟠" },
};

/**
 * Rows per page, in the list and in each "load older" after it.
 *
 * Sized to fill the pane a few screens deep without pulling a whole mailbox: every row
 * carries its full body text, so the cost of a page is real.
 */
const PAGE_SIZE = 200;

const REGION_TINT: Record<string, string> = {
  CHENNAI: "#6366f1",
  SALEM: "#0ea5e9",
  HOSUR: "#f59e0b",
  VELLORE: "#10b981",
  KANCHIPURAM: "#ec4899",
};

function initials(name: string, email: string): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Date for the list row: "11 Aug", with the year once it is not this one. */
function listDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  }).format(d);
}

/** 12-hour clock, as everyone here reads it: "6:50 pm". */
function listClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function CustomerEmailsPage({
  token,
  ticketFilter,
  onClearTicketFilter,
}: Readonly<{
  token: string;
  /** Opened from a report row's envelope marker: show only that work order's mail. */
  ticketFilter?: string;
  onClearTicketFilter?: () => void;
}>) {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]["key"]>("NEW");
  const [rows, setRows] = useState<InboundEmailRow[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxHealth[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** Region to show, or null for every region. Filtered client-side off the loaded page. */
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  /** When on, show only the messages flagged as an escalation or worth a look. */
  const [escalationOnly, setEscalationOnly] = useState(false);
  // Compose is the one screen that writes outbound mail. It opens only from the button.
  const [composeOpen, setComposeOpen] = useState(false);
  // The Sent tab is a separate record set, not another inbox status filter.
  const [showSent, setShowSent] = useState(false);

  // --- Reply state (approval mode). `reply` is the stored draft, the two text fields are
  // the human's working copy; nothing here can send without the Approve & send click.
  const [reply, setReply] = useState<EmailReply | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftText, setDraftText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  // Nothing is ever deleted, so the mailbox only grows; the list shows a page of it and
  // fetches the next on request. Every row carries its full body text, which is why this is
  // paged rather than simply raised — one big number would make every open slow for the
  // sake of mail nobody scrolls to.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState<InboundEmailCount[]>([]);

  /**
   * Cab mail only.
   *
   * Sent to the server rather than applied to `rows`: cab mail from last week is older than
   * the page this list holds, so filtering what is already loaded would show nothing and
   * read as "there is no cab mail". Off by default — the inbox opens exactly as it did.
   */
  const [cabOnly, setCabOnly] = useState(false);

  /**
   * The period the CAB view covers. Cab mail is read as a period — what was spent over the
   * last couple of months — where the rest of the inbox is read as "what came in", so this
   * range exists for CAB and is applied only while CAB is on.
   *
   * Seeded to the last two months and the reader's to change from there.
   */
  const [cabFrom, setCabFrom] = useState(() => defaultCabRange().from);
  const [cabTo, setCabTo] = useState(() => defaultCabRange().to);
  const cabRange = useMemo(
    () => (cabOnly ? normalizeCabRange(cabFrom, cabTo) : null),
    [cabOnly, cabFrom, cabTo],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCustomerEmails(token, {
        status,
        limit: PAGE_SIZE,
        ...(ticketFilter ? { ticketId: ticketFilter } : {}),
        ...(cabOnly ? { cabOnly: true } : {}),
        ...(cabRange ?? {}),
      });
      setRows(res.rows);
      setMailboxes(res.mailboxes);
      setCounts(res.counts ?? []);
      // A short page means the end; a full one only means there may be more.
      setHasMore(res.rows.length === PAGE_SIZE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load customer emails");
    } finally {
      setLoading(false);
    }
  }, [token, status, ticketFilter, cabOnly, cabRange]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await getCustomerEmails(token, {
        status,
        limit: PAGE_SIZE,
        offset: rows.length,
        ...(ticketFilter ? { ticketId: ticketFilter } : {}),
        // The older page has to be narrowed the same way, or "load older" would pour the
        // whole inbox in underneath a filtered list.
        ...(cabOnly ? { cabOnly: true } : {}),
        ...(cabRange ?? {}),
      });
      // Mail can arrive between one page and the next, which shifts everything down by one
      // and would otherwise re-show the row that fell across the boundary.
      setRows((prev) => {
        const held = new Set(prev.map((r) => r.id));
        return [...prev, ...res.rows.filter((r) => !held.has(r.id))];
      });
      setHasMore(res.rows.length === PAGE_SIZE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load older mail");
    } finally {
      setLoadingMore(false);
    }
  }, [token, status, rows.length, ticketFilter, cabOnly, cabRange]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Mail in the chosen region only — the region chips count against this, not the filter. */
  const inRegion = useMemo(
    () =>
      regionFilter
        ? rows.filter((r) => r.regionCode.toUpperCase() === regionFilter)
        : rows,
    [rows, regionFilter],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = escalationOnly
      ? inRegion.filter((r) => r.escalationLevel !== "NONE")
      : inRegion;
    if (needle) {
      list = list.filter((r) =>
        [r.fromEmail, r.fromName, r.subject, r.bodyPreview, r.matchedTicketId, r.regionCode]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    // Escalations first, then newest — the whole point of the flag is that it jumps the queue.
    return [...list].sort((a, b) => {
      const rank = (v: string) => (v === "HIGH" ? 0 : v === "WATCH" ? 1 : 2);
      return rank(a.escalationLevel) - rank(b.escalationLevel) ||
        b.receivedAt.localeCompare(a.receivedAt);
    });
  }, [inRegion, search, escalationOnly]);

  // ── Header tallies ──────────────────────────────────────────────────────────────────
  //
  // Counted by the server over everything stored, not by counting the rows on screen. The
  // list holds one page, so row-counting made every total sit at the page size and stay
  // there — a mailbox of 743 reported 200 whatever arrived, which reads as a limit on what
  // is kept rather than on what is shown.
  //
  // `counts` is optional on the response: during a deploy the browser may still be talking
  // to an API that does not send it, and a header of zeroes would be worse than a page-
  // shaped one. Absent, each tally falls back to the old row-derived number.
  const serverCounts = counts.length > 0;

  /** Counts narrowed to the status tab showing; "ALL" spans every status. */
  const countsForStatus = useMemo(
    () => (status === "ALL" ? counts : counts.filter((c) => c.status === status)),
    [counts, status],
  );

  const regionCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (serverCounts) {
      for (const c of countsForStatus) {
        const key = c.regionCode.toUpperCase();
        map.set(key, (map.get(key) ?? 0) + c.total);
      }
      return map;
    }
    for (const r of rows) {
      const key = r.regionCode.toUpperCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [serverCounts, countsForStatus, rows]);

  /** Everything at the status showing, across the regions this login may see. */
  const totalForStatus = useMemo(
    () =>
      serverCounts
        ? countsForStatus.reduce((n, c) => n + c.total, 0)
        : rows.length,
    [serverCounts, countsForStatus, rows.length],
  );

  /** Totals per status tab, so each tab says how much is behind it. */
  const statusTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of counts) map.set(c.status, (map.get(c.status) ?? 0) + c.total);
    map.set("ALL", counts.reduce((n, c) => n + c.total, 0));
    return map;
  }, [counts]);

  // Follows the region chip, since the escalation filter narrows whatever is showing.
  const escalationCount = useMemo(() => {
    if (!serverCounts) return inRegion.filter((r) => r.escalationLevel !== "NONE").length;
    const scoped = regionFilter
      ? countsForStatus.filter((c) => c.regionCode.toUpperCase() === regionFilter)
      : countsForStatus;
    return scoped.reduce((n, c) => n + c.escalations, 0);
  }, [serverCounts, countsForStatus, regionFilter, inRegion]);

  // Keep a selection: default to the newest, and never leave a dead id selected.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;

  // Load whatever draft exists whenever a different message is opened.
  useEffect(() => {
    if (!selectedId) {
      setReply(null);
      setDraftSubject("");
      setDraftText("");
      return;
    }
    let cancelled = false;
    void getCustomerEmailReply(token, selectedId)
      .then((r) => {
        if (cancelled) return;
        setReply(r);
        setDraftSubject(r?.subject ?? "");
        setDraftText(r?.body ?? "");
      })
      .catch(() => {
        if (!cancelled) setReply(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedId]);

  /** Build a draft from the call's live status. Does not send. */
  async function makeDraft() {
    if (!selectedId) return;
    setReplyBusy(true);
    setMessage(null);
    try {
      const r = await generateCustomerEmailReply(token, selectedId);
      setReply(r);
      setDraftSubject(r.subject);
      setDraftText(r.body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not draft a reply");
    } finally {
      setReplyBusy(false);
    }
  }

  /** Keep the edits without sending. */
  async function saveOnly() {
    if (!selectedId) return;
    setReplyBusy(true);
    try {
      setReply(await saveCustomerEmailReply(token, selectedId, { subject: draftSubject, body: draftText }));
      setMessage("Draft saved — nothing has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the draft");
    } finally {
      setReplyBusy(false);
    }
  }

  /** The only path that emails the customer, and it needs this explicit confirmation. */
  async function approveAndSend() {
    if (!selectedId || !reply) return;
    const ok = window.confirm(
      `Send this reply to ${reply.toEmail}?

It will go out from ${selected?.mailboxEmail ?? ""}. This cannot be undone.`,
    );
    if (!ok) return;
    setReplyBusy(true);
    setMessage(null);
    try {
      await saveCustomerEmailReply(token, selectedId, { subject: draftSubject, body: draftText });
      const sent = await sendCustomerEmailReply(token, selectedId);
      setReply(sent);
      setMessage(`Reply sent to ${sent.toEmail}.`);
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send failed");
    } finally {
      setReplyBusy(false);
    }
  }

  async function triage(id: string, next: "REVIEWED" | "IGNORED") {
    try {
      await setCustomerEmailStatus(token, id, next);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update");
    }
  }

  async function pollNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await pollCustomerEmails(token);
      const stored = res.results.reduce((s, r) => s + r.stored, 0);
      const errs = res.results.filter((r) => r.error);
      setMessage(
        stored > 0 ? `${stored} new message(s).` : "No new mail." +
          (errs.length ? ` Errors: ${errs.map((e) => `${e.mailbox}: ${e.error}`).join("; ")}` : ""),
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    minHeight: "34px",
    borderRadius: "999px",
    border: `1px solid ${active ? "#4f46e5" : "#e5e7eb"}`,
    background: active ? "#4f46e5" : "#ffffff",
    color: active ? "#ffffff" : "#475569",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const actionBtn: React.CSSProperties = {
    padding: "7px 14px",
    minHeight: "34px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    color: "#334155",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <section style={{ minWidth: 0, maxWidth: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "14px",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "19px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Customer Emails
          </h2>
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#64748b" }}>
            Mail arriving in the region mailboxes, matched to a call. Read-only — nothing is
            ever sent from this screen.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mail…"
            style={{
              padding: "8px 14px",
              minHeight: "36px",
              borderRadius: "999px",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              fontSize: "13px",
              minWidth: "240px",
              color: "#334155",
            }}
          />
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            disabled={mailboxes.length === 0}
            title={
              mailboxes.length === 0
                ? "No region mailbox is configured yet"
                : "Write a new mail from a region mailbox"
            }
            style={{
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "999px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 700,
              minHeight: "36px",
              cursor: mailboxes.length === 0 ? "not-allowed" : "pointer",
              opacity: mailboxes.length === 0 ? 0.5 : 1,
            }}
          >
            ✉ Compose
          </button>
          <button
            type="button"
            onClick={() => void pollNow()}
            disabled={busy}
            style={{ ...actionBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Checking…" : "↻ Check now"}
          </button>
        </div>
      </div>

      {/* Tabs + mailbox health */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setShowSent(false);
              setStatus(t.key);
            }}
            style={tabBtn(!showSent && status === t.key)}
          >
            {t.label}
            {!showSent ? ` · ${statusTotals.get(t.key) ?? 0}` : ""}
          </button>
        ))}
        {/* Outbound: what this team sent, and who sent it. */}
        <button
          type="button"
          onClick={() => setShowSent(true)}
          title="Mail sent from OpenCall — Compose and approved replies"
          style={tabBtn(showSent)}
        >
          Sent
        </button>
        {/* Escalations jump the queue, so they get their own switch. */}
        <button
          type="button"
          onClick={() => setEscalationOnly((v) => !v)}
          title="Show only messages flagged as an escalation"
          style={{
            padding: "7px 16px",
            minHeight: "34px",
            borderRadius: "999px",
            border: `1px solid ${escalationOnly ? "#dc2626" : escalationCount > 0 ? "#fecaca" : "#e5e7eb"}`,
            background: escalationOnly ? "#dc2626" : escalationCount > 0 ? "#fef2f2" : "#ffffff",
            color: escalationOnly ? "#ffffff" : escalationCount > 0 ? "#991b1b" : "#94a3b8",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ⚠ Escalations · {escalationCount}
        </button>
        {/* Cab mail, beside Escalations because it is the same kind of switch: a slice of the
            same inbox rather than another place to go. Its date range lives on its own row
            below — two date fields in here would push the tabs onto a second line. */}
        <button
          type="button"
          onClick={() => setCabOnly((on) => !on)}
          title={
            cabOnly
              ? "Showing cab mail only — click to show all mail again"
              : "Show only mail about cabs"
          }
          style={{
            padding: "7px 16px",
            minHeight: "34px",
            borderRadius: "999px",
            border: `1px solid ${cabOnly ? "#4f46e5" : "#e5e7eb"}`,
            background: cabOnly ? "#4f46e5" : "#ffffff",
            color: cabOnly ? "#ffffff" : "#475569",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          🚕 CAB
        </button>
      </div>

      {/* Region filter. Each chip is also the mailbox health light: green when the last
          poll succeeded, red when it errored (hover for the reason). */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.04em", marginRight: "2px" }}>
          REGION
        </span>
        <button
          type="button"
          onClick={() => setRegionFilter(null)}
          style={{
            padding: "5px 12px",
            minHeight: "30px",
            borderRadius: "999px",
            border: `1px solid ${regionFilter === null ? "#4f46e5" : "#e2e8f0"}`,
            background: regionFilter === null ? "#eef2ff" : "#ffffff",
            color: regionFilter === null ? "#3730a3" : "#475569",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          All regions · {totalForStatus}
        </button>
        {mailboxes.map((m) => {
          const code = (m.regionCode || m.email).toUpperCase();
          const active = regionFilter === code;
          const tint = REGION_TINT[code] ?? "#64748b";
          return (
            <button
              key={m.email}
              type="button"
              // Clicking the active chip clears the filter, so it works as a toggle.
              onClick={() => setRegionFilter(active ? null : code)}
              title={
                m.lastError
                  ? `${m.email}\nLast poll failed: ${m.lastError}`
                  : `${m.email}\nIngesting mail received after ${fullTime(m.ingestFrom)}${m.lastPolledAt ? `\nLast checked ${fullTime(m.lastPolledAt)}` : ""}`
              }
              style={{
                padding: "5px 12px",
                minHeight: "30px",
                borderRadius: "999px",
                background: active ? tint : m.lastError ? "#fef2f2" : "#ffffff",
                color: active ? "#ffffff" : m.lastError ? "#991b1b" : "#475569",
                fontSize: "11px",
                fontWeight: 700,
                border: `1px solid ${active ? tint : m.lastError ? "#fecaca" : "#e2e8f0"}`,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  marginRight: "6px",
                  background: m.lastError ? "#dc2626" : active ? "#ffffff" : "#22c55e",
                }}
              />
              {m.regionCode || m.email} · {regionCounts.get(code) ?? 0}
            </button>
          );
        })}
      </div>

      {/* The period the CAB view covers. The button itself sits with the tabs above; this row
          appears under it only while CAB is on, and holds nothing otherwise — two date fields
          in the tab row would push the tabs onto a second line. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: cabOnly ? "12px" : 0,
        }}
      >
        {/* The period, and only while CAB is on. Cab mail is read as a period — what was
            spent over the last couple of months — where the rest of the inbox is read as
            "what came in", so this belongs to CAB and appears with it. Off, the inbox has no
            date filter at all and behaves exactly as it always did. */}
        {cabOnly ? (
          <>
            <label style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
              From{" "}
              <input
                type="date"
                value={cabFrom}
                max={cabTo || undefined}
                onChange={(e) => setCabFrom(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                }}
              />
            </label>
            <label style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
              To{" "}
              <input
                type="date"
                value={cabTo}
                min={cabFrom || undefined}
                onChange={(e) => setCabTo(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const fresh = defaultCabRange();
                setCabFrom(fresh.from);
                setCabTo(fresh.to);
              }}
              style={{
                padding: "5px 10px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#475569",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Last 2 months
            </button>
            {/* A range the wrong way round is not silently swapped — that would show a
                period nobody chose. It is refused, said so, and the list stays where it was. */}
            <span
              style={{ fontSize: "11.5px", color: cabRange ? "#4338ca" : "#b91c1c" }}
            >
              {cabRange
                ? "Cab mail only — click CAB again to show everything."
                : "From must be on or before To."}
            </span>
          </>
        ) : null}
      </div>

      {/* A filtered inbox that does not say it is filtered reads as an empty one — this is
          opened from a report row, so the reader arrives without having chosen the filter
          themselves and needs both the reason and the way out. */}
      {ticketFilter ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "12px",
            padding: "9px 14px",
            borderRadius: "10px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            fontSize: "13px",
            color: "#3730a3",
          }}
        >
          <span>
            Showing mail for <strong>{ticketFilter}</strong> only.
          </span>
          {onClearTicketFilter ? (
            <button
              type="button"
              onClick={onClearTicketFilter}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "#4338ca",
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "12px",
              }}
            >
              Show all mail
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            marginBottom: "12px",
            padding: "9px 14px",
            borderRadius: "10px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            fontSize: "13px",
            color: "#1e40af",
          }}
        >
          {message}
        </div>
      ) : null}

      {/* Sent replaces the two-pane client: it is a different shape of record — outbound,
          with no triage and nothing to reply to. */}
      {showSent ? <SentMailPanel token={token} /> : null}

      {/* Two-pane client */}
      <div
        hidden={showSent}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
          gap: "0",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          overflow: "hidden",
          minHeight: "560px",
          background: "#ffffff",
          minWidth: 0,
        }}
      >
        {/* ── List ── */}
        <div style={{ borderRight: "1px solid #e2e8f0", overflowY: "auto", maxHeight: "72vh", minWidth: 0 }}>
          {loading && filtered.length === 0 ? (
            <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              Loading…
            </div>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              No mail here. Only messages arriving from now on are ingested — the mailbox
              history is deliberately left untouched.
            </div>
          ) : null}

          {filtered.map((r) => {
            const active = r.id === selectedId;
            const tint = REGION_TINT[r.regionCode.toUpperCase()] ?? "#64748b";
            const conf = MATCH_STYLE[r.matchConfidence] ?? MATCH_STYLE.NONE!;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                style={{
                  width: "100%",
                  display: "block",
                  textAlign: "left",
                  padding: "12px 14px",
                  minHeight: "auto",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  borderLeft: `3px solid ${active ? tint : "transparent"}`,
                  background: active ? "#f8fafc" : "#ffffff",
                  cursor: "pointer",
                  borderRadius: 0,
                  fontWeight: 400,
                }}
              >
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", minWidth: 0 }}>
                  <span
                    style={{
                      flex: "0 0 auto",
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: tint,
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {initials(r.fromName, r.fromEmail)}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: r.status === "NEW" ? 700 : 500,
                          color: "#0f172a",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.fromName || r.fromEmail}
                      </span>
                      {/* Date over time, both compact, so the column stays narrow. */}
                      <span
                        style={{
                          fontSize: "10.5px",
                          color: "#94a3b8",
                          whiteSpace: "nowrap",
                          textAlign: "right",
                          lineHeight: 1.35,
                          flex: "0 0 auto",
                        }}
                      >
                        {listDate(r.receivedAt)}
                        <br />
                        {listClock(r.receivedAt)}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: r.status === "NEW" ? 600 : 400,
                        color: "#1e293b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: "1px",
                      }}
                    >
                      {r.hasAttachments ? (
                        <span title="Has an attachment" style={{ marginRight: "5px" }}>
                          📎
                        </span>
                      ) : null}
                      {r.subject || "(no subject)"}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "#94a3b8",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: "1px",
                      }}
                    >
                      {r.bodyPreview}
                    </span>
                    <span style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      {ESCALATION_STYLE[r.escalationLevel] ? (
                        <span
                          title={r.escalationReasons.split(" | ").join("\n")}
                          style={{
                            fontSize: "10px",
                            fontWeight: 800,
                            padding: "1px 7px",
                            borderRadius: "999px",
                            background: ESCALATION_STYLE[r.escalationLevel]!.bg,
                            color: ESCALATION_STYLE[r.escalationLevel]!.fg,
                          }}
                        >
                          {ESCALATION_STYLE[r.escalationLevel]!.icon}{" "}
                          {ESCALATION_STYLE[r.escalationLevel]!.label}
                        </span>
                      ) : null}
                      <span style={{ fontSize: "10px", fontWeight: 700, color: tint }}>
                        {r.regionCode}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: "999px",
                          background: conf.bg,
                          color: conf.fg,
                        }}
                      >
                        {r.matchedTicketId || conf.label}
                      </span>
                      {r.isAutoReply ? (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#9a3412" }}>auto</span>
                      ) : null}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}

          {/* Older mail is stored, just not loaded — nothing here is ever deleted. The
              button reads against `rows`, not `filtered`, because the region and search
              filters run over what has been loaded: a filter that shows nothing may still
              have matches in the pages below. */}
          {hasMore && !loading ? (
            <div style={{ padding: "14px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{
                  padding: "8px 18px",
                  borderRadius: "999px",
                  border: "1px solid #cbd5e1",
                  background: loadingMore ? "#f1f5f9" : "#ffffff",
                  color: "#334155",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: loadingMore ? "default" : "pointer",
                }}
              >
                {loadingMore ? "Loading…" : `Load older mail (${rows.length} shown)`}
              </button>
            </div>
          ) : null}
          {!hasMore && rows.length > PAGE_SIZE ? (
            <div style={{ padding: "14px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
              That is all {rows.length} messages.
            </div>
          ) : null}
        </div>

        {/* ── Reading pane ── */}
        <div style={{ overflowY: "auto", maxHeight: "72vh", minWidth: 0 }}>
          {!selected ? (
            <div style={{ padding: "60px 28px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              Select a message to read it.
            </div>
          ) : (
            <div style={{ padding: "22px 26px", minWidth: 0 }}>
              <h3
                style={{
                  margin: "0 0 14px 0",
                  fontSize: "19px",
                  fontWeight: 700,
                  color: "#0f172a",
                  lineHeight: 1.35,
                  wordBreak: "break-word",
                }}
              >
                {selected.subject || "(no subject)"}
              </h3>

              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "16px" }}>
                <span
                  style={{
                    flex: "0 0 auto",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: REGION_TINT[selected.regionCode.toUpperCase()] ?? "#64748b",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {initials(selected.fromName, selected.fromEmail)}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                    {selected.fromName || selected.fromEmail}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", wordBreak: "break-all" }}>
                    {selected.fromEmail} → {selected.mailboxEmail}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                    {fullTime(selected.receivedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {selected.status !== "REVIEWED" ? (
                    <button type="button" onClick={() => void triage(selected.id, "REVIEWED")} style={actionBtn}>
                      ✓ Reviewed
                    </button>
                  ) : null}
                  {selected.status !== "IGNORED" ? (
                    <button type="button" onClick={() => void triage(selected.id, "IGNORED")} style={actionBtn}>
                      Ignore
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Matched call */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  marginBottom: "18px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    background: (MATCH_STYLE[selected.matchConfidence] ?? MATCH_STYLE.NONE!).bg,
                    color: (MATCH_STYLE[selected.matchConfidence] ?? MATCH_STYLE.NONE!).fg,
                  }}
                >
                  {(MATCH_STYLE[selected.matchConfidence] ?? MATCH_STYLE.NONE!).label}
                </span>
                {selected.matchedTicketId ? (
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                    {selected.matchedTicketId}
                    {selected.matchedCaseId ? (
                      <span style={{ color: "#64748b", fontWeight: 400 }}> · case {selected.matchedCaseId}</span>
                    ) : null}
                  </span>
                ) : (
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Not linked to a call — no WO number quoted and the sender is not a known contact.
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                  {selected.regionCode}
                </span>
              </div>

              {/* Escalation banner — says WHY it was flagged, so the judgement is auditable
                  rather than a mystery badge. */}
              {ESCALATION_STYLE[selected.escalationLevel] ? (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    background: ESCALATION_STYLE[selected.escalationLevel]!.bg,
                    border: `1px solid ${ESCALATION_STYLE[selected.escalationLevel]!.fg}33`,
                    marginBottom: "14px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: ESCALATION_STYLE[selected.escalationLevel]!.fg,
                      marginBottom: selected.escalationReasons ? "4px" : 0,
                    }}
                  >
                    {ESCALATION_STYLE[selected.escalationLevel]!.icon}{" "}
                    {selected.escalationLevel === "HIGH"
                      ? "Escalation — handle this first"
                      : "Worth a look"}
                  </div>
                  {selected.escalationReasons ? (
                    <div style={{ fontSize: "12px", color: ESCALATION_STYLE[selected.escalationLevel]!.fg }}>
                      {selected.escalationReasons.split(" | ").join(" · ")}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selected.isAutoReply ? (
                <div
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    color: "#9a3412",
                    fontSize: "12px",
                    marginBottom: "14px",
                  }}
                >
                  Machine-generated / no-reply sender — this one is barred from any future
                  auto-reply.
                </div>
              ) : null}

              {/* Body — the sender's own HTML, sandboxed, with their inline pictures put
                  back and anything remote held until asked. Falls back to plain text. */}
              <EmailBodyView
                key={selected.id}
                token={token}
                emailId={selected.id}
                fallbackText={selected.bodyText || selected.bodyPreview}
              />

              {/* --- Reply: APPROVAL MODE ---
                  A draft is only ever a draft until Send is pressed. Nothing on this panel
                  fires automatically, and machine mail cannot be replied to at all. */}
              <div
                style={{
                  marginTop: "22px",
                  paddingTop: "18px",
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                {selected.isAutoReply ? (
                  <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 600 }}>
                    Reply disabled — machine-generated / no-reply sender.
                  </div>
                ) : reply?.status === "SENT" ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "#dcfce7",
                      border: "1px solid #86efac",
                      fontSize: "12.5px",
                      color: "#166534",
                    }}
                  >
                    <strong>Reply sent</strong>
                    {reply.sentAt ? ` · ${fullTime(reply.sentAt)}` : ""} · to {reply.toEmail}
                    <div style={{ whiteSpace: "pre-wrap", marginTop: "8px", color: "#14532d" }}>
                      {reply.body}
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                      }}
                    >
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "#334155" }}>
                        Reply
                      </span>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "#eef2ff",
                          color: "#3730a3",
                        }}
                      >
                        Approval required — nothing sends on its own
                      </span>
                      <button
                        type="button"
                        onClick={() => void makeDraft()}
                        disabled={replyBusy}
                        style={{
                          marginLeft: "auto",
                          padding: "5px 12px",
                          minHeight: "30px",
                          borderRadius: "8px",
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          color: "#374151",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: replyBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        {reply ? "Regenerate draft" : "Draft a reply"}
                      </button>
                    </div>

                    {reply ? (
                      <>
                        <div style={{ fontSize: "11.5px", color: "#64748b", marginBottom: "6px" }}>
                          To <strong>{reply.toEmail}</strong> · from{" "}
                          <strong>{selected.mailboxEmail}</strong>
                        </div>
                        <input
                          value={draftSubject}
                          onChange={(e) => setDraftSubject(e.target.value)}
                          placeholder="Subject"
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: "1px solid #d1d5db",
                            fontSize: "13px",
                            color: "#1e293b",
                            marginBottom: "8px",
                          }}
                        />
                        <textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          rows={12}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid #d1d5db",
                            fontSize: "13px",
                            lineHeight: 1.6,
                            color: "#1e293b",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                        {reply.status === "FAILED" && reply.error ? (
                          <div style={{ fontSize: "12px", color: "#991b1b", marginTop: "6px" }}>
                            Last send failed: {reply.error}
                          </div>
                        ) : null}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "8px",
                            marginTop: "10px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => void saveOnly()}
                            disabled={replyBusy}
                            style={{
                              padding: "8px 16px",
                              minHeight: "36px",
                              borderRadius: "8px",
                              border: "1px solid #d1d5db",
                              background: "#ffffff",
                              color: "#374151",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: replyBusy ? "not-allowed" : "pointer",
                            }}
                          >
                            Save draft
                          </button>
                          <button
                            type="button"
                            onClick={() => void approveAndSend()}
                            disabled={replyBusy || !draftText.trim()}
                            style={{
                              padding: "8px 18px",
                              minHeight: "36px",
                              borderRadius: "8px",
                              border: "1px solid #16a34a",
                              background: replyBusy || !draftText.trim() ? "#86efac" : "#16a34a",
                              color: "#ffffff",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: replyBusy || !draftText.trim() ? "not-allowed" : "pointer",
                            }}
                          >
                            {replyBusy ? "Working…" : "✓ Approve & send"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                        No draft yet. “Draft a reply” fills one from this call’s live status —
                        you can edit it before anything is sent.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {composeOpen ? (
        <ComposeModal
          token={token}
          mailboxes={mailboxes}
          defaultRegion={selected?.regionCode ?? regionFilter}
          onClose={() => setComposeOpen(false)}
          onSent={(summary) => setMessage(summary)}
        />
      ) : null}
    </section>
  );
}
