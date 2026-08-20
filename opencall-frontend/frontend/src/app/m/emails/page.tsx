"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBar } from "../AppBar";
import { canSeeMobileSection, useMobileSession } from "../session";
import {
  generateCustomerEmailReply,
  getCustomerEmailReply,
  getCustomerEmails,
  pollCustomerEmails,
  saveCustomerEmailReply,
  sendCustomerEmailReply,
  setCustomerEmailStatus,
  type EmailReply,
  type InboundEmailRow,
  type MailboxHealth,
} from "../../../lib/customerEmailApiClient";
import { EmailBodyView } from "../../../features/dashboard/components/EmailBodyView";
import { ComposeModal } from "../../../features/dashboard/components/ComposeModal";
import { SentMailPanel } from "../../../features/dashboard/components/SentMailPanel";

/**
 * Customer Emails on the phone.
 *
 * The desktop two-pane reader does not survive a 390px screen, so the list and the message
 * are two screens with a back button — but everything that decides what a coordinator does
 * is the same, because it is literally the same code: EmailBodyView renders the sender's
 * own HTML with images held back, ComposeModal writes a new mail, SentMailPanel is the
 * outbound record. Reusing them is the point. A second implementation of "may this be
 * replied to" would eventually disagree with the first, and the phone is exactly where
 * someone answers a customer without the desktop open to check against.
 *
 * Special-access logins are excluded here as they are on the web: the API is role-guarded
 * to SUPER_ADMIN and REGION_ADMIN, so showing the screen would only produce a 401.
 */

const STATUS_TABS = [
  { key: "NEW", label: "Inbox" },
  { key: "REVIEWED", label: "Reviewed" },
  { key: "IGNORED", label: "Ignored" },
  { key: "ALL", label: "All" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

const MATCH_LABEL: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "WO matched", cls: "mChip mChip--good" },
  LOW: { label: "Sender matched", cls: "mChip mChip--warn" },
  NONE: { label: "No match", cls: "mChip" },
};

const ESCALATION_LABEL: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "🔴 Escalation", cls: "mChip mChip--danger" },
  WATCH: { label: "🟠 Needs a look", cls: "mChip mChip--warn" },
};

function initials(name: string, email: string): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "12 Aug · 2:50 pm", the same 12-hour IST reading the desktop list uses. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  }).format(d);
  const clock = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${date} · ${clock}`;
}

/** Rows per page — the same page size the desktop reader uses. */
const PAGE_SIZE = 200;

export default function MobileCustomerEmailsPage() {
  const { session } = useMobileSession();
  const token = session?.token ?? "";
  const allowed =
    session?.user.role !== "SPECIAL_ACCESS" &&
    canSeeMobileSection(session, "customer-emails");

  const [status, setStatus] = useState<StatusKey>("NEW");
  const [showSent, setShowSent] = useState(false);
  const [rows, setRows] = useState<InboundEmailRow[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxHealth[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [escalationOnly, setEscalationOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // Reply state — approval mode, exactly as on the desktop: nothing leaves without a tap.
  const [reply, setReply] = useState<EmailReply | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftText, setDraftText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Paged for the same reason as the desktop reader: nothing is ever deleted, so the
  // mailbox only grows, and each row carries its full body text. On a phone the cost of
  // pulling more than a page is felt sooner, not later.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const res = await getCustomerEmails(token, { status, limit: PAGE_SIZE });
      setRows(res.rows);
      setMailboxes(res.mailboxes);
      setHasMore(res.rows.length === PAGE_SIZE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load mail");
    } finally {
      setLoading(false);
    }
  }, [token, allowed, status]);

  const loadMore = useCallback(async () => {
    if (!token || !allowed) return;
    setLoadingMore(true);
    try {
      const res = await getCustomerEmails(token, {
        status,
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      // Mail arriving between pages shifts the boundary; drop what is already held.
      setRows((prev) => {
        const held = new Set(prev.map((r) => r.id));
        return [...prev, ...res.rows.filter((r) => !held.has(r.id))];
      });
      setHasMore(res.rows.length === PAGE_SIZE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load older mail");
    } finally {
      setLoadingMore(false);
    }
  }, [token, allowed, status, rows.length]);

  useEffect(() => {
    void load();
  }, [load]);

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
    // Escalations jump the queue, then newest — the same order the desktop list uses.
    return [...list].sort((a, b) => {
      const rank = (v: string) => (v === "HIGH" ? 0 : v === "WATCH" ? 1 : 2);
      return (
        rank(a.escalationLevel) - rank(b.escalationLevel) ||
        b.receivedAt.localeCompare(a.receivedAt)
      );
    });
  }, [inRegion, search, escalationOnly]);

  const escalationCount = useMemo(
    () => inRegion.filter((r) => r.escalationLevel !== "NONE").length,
    [inRegion],
  );

  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = r.regionCode.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  // Load whatever draft exists for the opened message.
  useEffect(() => {
    if (!openId || !token) {
      setReply(null);
      setDraftSubject("");
      setDraftText("");
      setReplyOpen(false);
      return;
    }
    let cancelled = false;
    void getCustomerEmailReply(token, openId)
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
  }, [openId, token]);

  async function changeStatus(id: string, next: "REVIEWED" | "IGNORED") {
    if (!token) return;
    setBusy(true);
    try {
      await setCustomerEmailStatus(token, id, next);
      setOpenId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await pollCustomerEmails(token);
      const stored = result.results.reduce((total, r) => total + r.stored, 0);
      setMessage(
        `Checked ${String(result.results.length)} mailbox(es) · ${String(stored)} new`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  async function draft() {
    if (!token || !openId) return;
    setReplyBusy(true);
    try {
      const r = await generateCustomerEmailReply(token, openId);
      setReply(r);
      setDraftSubject(r.subject);
      setDraftText(r.body);
      setReplyOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not draft a reply");
    } finally {
      setReplyBusy(false);
    }
  }

  async function saveReply() {
    if (!token || !openId) return;
    setReplyBusy(true);
    try {
      const r = await saveCustomerEmailReply(token, openId, {
        subject: draftSubject,
        body: draftText,
      });
      setReply(r);
      setMessage("Draft saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save");
    } finally {
      setReplyBusy(false);
    }
  }

  async function sendReply() {
    if (!token || !openId || !open) return;
    // The desktop confirms before sending and so does this: a reply cannot be recalled.
    const ok = window.confirm(
      `Send this reply to ${open.fromEmail}?\n\nIt goes out immediately and cannot be recalled.`,
    );
    if (!ok) return;
    setReplyBusy(true);
    try {
      const r = await sendCustomerEmailReply(token, openId);
      setReply(r);
      setMessage(`Sent to ${open.fromEmail}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send failed");
    } finally {
      setReplyBusy(false);
    }
  }

  if (!session) return null;

  if (!allowed) {
    return (
      <>
        <AppBar title="Customer Emails" back />
        <main className="mMain">
          <div className="mCard mMuted">
            This login does not have access to Customer Emails.
          </div>
        </main>
      </>
    );
  }

  // ---------- Message view ----------
  if (open) {
    const match = MATCH_LABEL[open.matchConfidence] ?? MATCH_LABEL.NONE!;
    const escalation = ESCALATION_LABEL[open.escalationLevel];
    const sent = reply?.status === "SENT";

    return (
      <>
        <AppBar
          title={open.subject || "(no subject)"}
          subtitle={open.regionCode.toUpperCase()}
          back
        />
        <main className="mMain">
          <button
            type="button"
            className="mBtn mBtn--ghost"
            onClick={() => setOpenId(null)}
            style={{ marginBottom: 10 }}
          >
            ← Back to list
          </button>

          <div className="mCard">
            <div className="mRow__top">
              <div className="mRow__title">{open.fromName || open.fromEmail}</div>
              <span className="mMuted" style={{ fontSize: 12 }}>{when(open.receivedAt)}</span>
            </div>
            <div className="mRow__meta">
              {open.fromEmail} → {open.mailboxEmail}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span className={match.cls}>
                {match.label}
                {open.matchedTicketId ? ` · ${open.matchedTicketId}` : ""}
              </span>
              {escalation ? <span className={escalation.cls}>{escalation.label}</span> : null}
              {open.isAutoReply ? <span className="mChip">Automatic mail</span> : null}
            </div>
            {open.escalationReasons ? (
              <div className="mMuted" style={{ marginTop: 8, fontSize: 12 }}>
                {open.escalationReasons}
              </div>
            ) : null}
          </div>

          {/* The sender's own HTML, remote images held back — the desktop component. */}
          <div className="mCard">
            <EmailBodyView token={token} emailId={open.id} fallbackText={open.bodyText} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="mBtn"
              disabled={busy}
              onClick={() => void changeStatus(open.id, "REVIEWED")}
            >
              ✓ Reviewed
            </button>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              disabled={busy}
              onClick={() => void changeStatus(open.id, "IGNORED")}
            >
              Ignore
            </button>
            <button
              type="button"
              className="mBtn mBtn--ghost"
              onClick={() => setComposeOpen(true)}
            >
              ✉ Compose
            </button>
          </div>

          {/* Reply — approval mode. */}
          <div className="mCard">
            <div className="mSectionTitle">Reply</div>
            {open.isAutoReply ? (
              <div className="mMuted" style={{ fontSize: 12 }}>
                This is an automatic message. Replying to one is how auto-responder loops
                start, so it cannot be answered.
              </div>
            ) : sent ? (
              <div className="mChip mChip--good">Reply sent</div>
            ) : (
              <>
                {!replyOpen && !reply ? (
                  <button
                    type="button"
                    className="mBtn"
                    disabled={replyBusy}
                    onClick={() => void draft()}
                  >
                    {replyBusy ? "Drafting…" : "Draft a reply"}
                  </button>
                ) : (
                  <>
                    <label className="mLabel" htmlFor="replySubject">Subject</label>
                    <input
                      id="replySubject"
                      className="mInput"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                    />
                    <label className="mLabel" htmlFor="replyBody">Message</label>
                    <textarea
                      id="replyBody"
                      className="mInput"
                      rows={10}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <button
                        type="button"
                        className="mBtn mBtn--ghost"
                        disabled={replyBusy}
                        onClick={() => void saveReply()}
                      >
                        Save draft
                      </button>
                      <button
                        type="button"
                        className="mBtn"
                        disabled={replyBusy}
                        onClick={() => void sendReply()}
                      >
                        {replyBusy ? "Sending…" : "Approve & send"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {message ? <div className="mCard mMuted">{message}</div> : null}
        </main>

        {composeOpen ? (
          <ComposeModal
            token={token}
            mailboxes={mailboxes}
            defaultRegion={open.regionCode}
            inReplyToId={open.id}
            defaultTo={open.fromEmail}
            defaultSubject={open.subject}
            onClose={() => setComposeOpen(false)}
            onSent={(summary) => {
              setComposeOpen(false);
              setMessage(summary);
            }}
          />
        ) : null}
      </>
    );
  }

  // ---------- List view ----------
  return (
    <>
      <AppBar
        title="Customer Emails"
        subtitle="Read-only — nothing is ever sent from the list"
        back
        action={
          <button
            type="button"
            className="mIconBtn"
            aria-label="Compose"
            onClick={() => setComposeOpen(true)}
          >
            ✉
          </button>
        }
      />
      <main className="mMain">
        <div className="mSegment">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`mSegment__btn ${!showSent && status === t.key ? "mTab--active" : ""}`}
              onClick={() => {
                setShowSent(false);
                setStatus(t.key);
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className={`mSegment__btn ${showSent ? "mTab--active" : ""}`}
            onClick={() => setShowSent(true)}
          >
            Sent
          </button>
        </div>

        {showSent ? (
          <SentMailPanel token={token} />
        ) : (
          <>
            <input
              className="mSearch"
              placeholder="Search mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
              <button
                type="button"
                className={`mChip ${regionFilter === null ? "mChip--good" : ""}`}
                onClick={() => setRegionFilter(null)}
              >
                All · {rows.length}
              </button>
              {mailboxes.map((m) => {
                const code = (m.regionCode || m.email).toUpperCase();
                return (
                  <button
                    key={m.email}
                    type="button"
                    className={`mChip ${regionFilter === code ? "mChip--good" : m.lastError ? "mChip--danger" : ""}`}
                    title={m.lastError ? `Last poll failed: ${m.lastError}` : m.email}
                    onClick={() => setRegionFilter(regionFilter === code ? null : code)}
                  >
                    {code} · {regionCounts.get(code) ?? 0}
                  </button>
                );
              })}
              <button
                type="button"
                className={`mChip ${escalationOnly ? "mChip--danger" : escalationCount > 0 ? "mChip--warn" : ""}`}
                onClick={() => setEscalationOnly((v) => !v)}
              >
                ⚠ Escalations · {escalationCount}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className="mBtn mBtn--ghost"
                disabled={busy}
                onClick={() => void checkNow()}
              >
                {busy ? "Checking…" : "↻ Check now"}
              </button>
            </div>

            {message ? <div className="mCard mMuted">{message}</div> : null}

            {loading ? (
              <div className="mCenter">
                <div>
                  <div className="mSpinner" />
                  <div className="mMuted">Loading…</div>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mCard mMuted">No mail here.</div>
            ) : (
              <div className="mList">
                {filtered.map((row) => {
                  const match = MATCH_LABEL[row.matchConfidence] ?? MATCH_LABEL.NONE!;
                  const escalation = ESCALATION_LABEL[row.escalationLevel];
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="mRow"
                      onClick={() => setOpenId(row.id)}
                    >
                      <div className="mRow__top">
                        <div className="mRow__title">
                          {initials(row.fromName, row.fromEmail)} ·{" "}
                          {row.fromName || row.fromEmail}
                        </div>
                        <span className="mMuted" style={{ fontSize: 11 }}>
                          {when(row.receivedAt)}
                        </span>
                      </div>
                      <div className="mRow__title" style={{ fontWeight: 600 }}>
                        {row.subject || "(no subject)"}
                      </div>
                      <div className="mRow__meta">{row.bodyPreview}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span className="mChip">{row.regionCode.toUpperCase()}</span>
                        <span className={match.cls}>
                          {row.matchedTicketId || match.label}
                        </span>
                        {escalation ? (
                          <span className={escalation.cls}>{escalation.label}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                {hasMore ? (
                  <button
                    type="button"
                    className="mRow mCenter"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : `Load older mail (${rows.length} shown)`}
                  </button>
                ) : null}
              </div>
            )}
            {!hasMore && rows.length > PAGE_SIZE ? (
              <div className="mCard mMuted">That is all {rows.length} messages.</div>
            ) : null}
          </>
        )}
      </main>

      {composeOpen ? (
        <ComposeModal
          token={token}
          mailboxes={mailboxes}
          defaultRegion={regionFilter}
          onClose={() => setComposeOpen(false)}
          onSent={(summary) => {
            setComposeOpen(false);
            setMessage(summary);
          }}
        />
      ) : null}
    </>
  );
}
