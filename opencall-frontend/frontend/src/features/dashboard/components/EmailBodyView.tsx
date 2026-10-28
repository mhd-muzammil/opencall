import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAttachmentObjectUrl,
  getCustomerEmailDetail,
  type EmailAttachment,
} from "../../../lib/customerEmailApiClient";
import { applyInlineImages, buildEmailSrcDoc, referencedAttachmentIds } from "./emailHtmlView";

/**
 * The message itself, shown the way the sender wrote it.
 *
 * Mail HTML is attacker-controlled, so it is never put into this document. It goes into an
 * iframe whose `sandbox` grants no scripting: nothing in a mail can execute, read the
 * session, or navigate the app. `allow-same-origin` is present only so the height can be
 * measured, and it grants nothing on its own — without `allow-scripts` there is no code to
 * use it. Links open in a new tab with the referrer suppressed.
 *
 * Pictures on the sender's own servers load straight away, as they do in the original mail
 * — the office chose that over holding them back. The sender's ATTACHED pictures are
 * fetched with the session token and swapped in as blobs.
 *
 * A message stored before the reader kept plain-text mail as HTML still has only its text,
 * which is shown as text.
 */
export function EmailBodyView({
  token,
  emailId,
  fallbackText,
}: Readonly<{ token: string; emailId: string; fallbackText: string }>) {
  const [html, setHtml] = useState("");
  const [text, setText] = useState(fallbackText);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(320);

  // Every object URL created for this message, so they can all be revoked on close.
  // Without this, opening a mailbox leaks every image of every mail opened.
  const blobUrls = useRef<string[]>([]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml("");
    setText(fallbackText);
    setAttachments([]);
    setFrameHeight(320);

    const release = () => {
      for (const url of blobUrls.current) URL.revokeObjectURL(url);
      blobUrls.current = [];
    };
    release();

    void (async () => {
      try {
        const detail = await getCustomerEmailDetail(token, emailId);
        if (cancelled) return;

        setText(detail.message.bodyText || fallbackText);
        // An inline picture the body never draws would otherwise be shown nowhere at all.
        const drawn = referencedAttachmentIds(detail.message.bodyHtml);
        setAttachments(detail.attachments.filter((a) => !a.isInline || !drawn.has(a.id)));

        // Every file the body draws, whatever its part was marked: a ticketing system's logo
        // often arrives as a plain attachment that the HTML still points at by cid:. Fetched
        // together, so thirty signature pictures do not keep the mail waiting in a queue.
        const pictures = detail.attachments.filter((a) => drawn.has(a.id));
        const blobByAttachmentId = new Map<string, string>();
        await Promise.all(
          pictures.map(async (attachment) => {
            try {
              const url = await fetchAttachmentObjectUrl(token, emailId, attachment.id);
              // A picture that arrives after the reader moved on is released on its own,
              // never into the next message's list.
              if (cancelled) {
                URL.revokeObjectURL(url);
                return;
              }
              blobUrls.current.push(url);
              blobByAttachmentId.set(attachment.id, url);
            } catch {
              // One picture that will not load is not worth failing the message over.
            }
          }),
        );
        if (cancelled) return;
        setHtml(applyInlineImages(detail.message.bodyHtml, blobByAttachmentId));
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load the message");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [token, emailId, fallbackText]);

  // A long HP thread is a lot of markup; without this it would be rebuilt on every render,
  // including the one the height measurement itself causes.
  const srcDoc = useMemo(() => buildEmailSrcDoc(html), [html]);

  // Size the frame to its content so the pane scrolls as one, rather than trapping the mail
  // in a small box with its own scrollbar. Measured with the frame collapsed: a document is
  // never shorter than the frame it sits in, so measuring at the current height could only
  // ever keep it that tall. The document's height, not the body's, which leaves out the
  // body's own margin. A long HP thread runs well past 4,000px, which used to cut it off
  // into an inner scrollbar.
  const fitToContent = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.documentElement || doc.URL === "about:blank") return;
    // Collapsing the frame shrinks every scroller around it for a moment, which would throw
    // a reader halfway down a long mail back to the top, so their positions are put back.
    const scrolled: Array<[Element, number]> = [];
    for (let el = frame.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) scrolled.push([el, el.scrollTop]);
    }
    const pageY = window.scrollY;
    frame.style.height = "0px";
    let height = Math.min(Math.max(doc.documentElement.scrollHeight + 4, 120), 30000);
    frame.style.height = `${height}px`;
    // A mail wider than the pane scrolls sideways, and that scrollbar takes its height out
    // of the frame; it is added back rather than hiding the last lines behind a second one.
    const scrollbar = frame.clientHeight - doc.documentElement.clientHeight;
    if (scrollbar > 0) {
      height = Math.min(height + scrollbar, 30000);
      frame.style.height = `${height}px`;
    }
    for (const [el, top] of scrolled) el.scrollTop = top;
    if (window.scrollY !== pageY) window.scrollTo(window.scrollX, pageY);
    setFrameHeight(height);
  }, []);

  // The load event waits for every picture, and one slow picture host would keep the mail
  // in its first 320px until then. The text is laid out long before that, so the frame is
  // also fitted as soon as its document has been read, and again on load.
  useEffect(() => {
    if (!html) return;
    const timers = [150, 600, 2000].map((ms) =>
      window.setTimeout(() => {
        const doc = frameRef.current?.contentDocument;
        if (doc && doc.URL !== "about:blank" && doc.readyState !== "loading") fitToContent();
      }, ms),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [html, srcDoc, fitToContent]);

  // A narrower or wider pane rewraps the mail, so its height changes with the width: a
  // resized window, a rotated phone or a collapsed sidebar. Only a width change refits —
  // the fit itself changes the height, and reacting to that would loop.
  useEffect(() => {
    const frame = frameRef.current;
    if (!html || !frame || typeof ResizeObserver === "undefined") return;
    let width = frame.clientWidth;
    const observer = new ResizeObserver(() => {
      if (frame.clientWidth === width) return;
      width = frame.clientWidth;
      fitToContent();
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [html, fitToContent]);

  if (loading && !html) {
    return <div style={{ fontSize: "13px", color: "#94a3b8" }}>Loading the message…</div>;
  }

  return (
    <div>
      {error ? (
        <div style={{ fontSize: "12px", color: "#b45309", marginBottom: "10px" }}>
          {error} — showing the plain-text copy.
        </div>
      ) : null}

      {html ? (
        <iframe
          ref={frameRef}
          title="Message"
          srcDoc={srcDoc}
          onLoad={fitToContent}
          // No allow-scripts and no allow-forms: nothing in a mail can run or post anywhere.
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          style={{
            display: "block",
            width: "100%",
            height: `${frameHeight}px`,
            border: "none",
            background: "#ffffff",
          }}
        />
      ) : (
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "13.5px",
            lineHeight: 1.65,
            color: "#1e293b",
          }}
        >
          {text || "(empty message)"}
        </div>
      )}

      {attachments.length > 0 ? (
        <AttachmentBar token={token} emailId={emailId} attachments={attachments} />
      ) : null}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** The paperclip list. Each file is fetched with the session token, then handed to the browser. */
function AttachmentBar({
  token,
  emailId,
  attachments,
}: Readonly<{ token: string; emailId: string; attachments: readonly EmailAttachment[] }>) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = async (attachment: EmailAttachment) => {
    setBusyId(attachment.id);
    try {
      const url = await fetchAttachmentObjectUrl(token, emailId, attachment.id);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename || "attachment";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on the next tick so the click has taken the URL first.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      style={{
        marginTop: "18px",
        paddingTop: "14px",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
        📎 {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
      </span>
      {attachments.map((attachment) => (
        <button
          key={attachment.id}
          type="button"
          disabled={busyId === attachment.id}
          onClick={() => void download(attachment)}
          title={`${attachment.filename} · ${formatSize(attachment.sizeBytes)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            maxWidth: "260px",
            background: "#ffffff",
            color: "#1e293b",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: 600,
            minHeight: "32px",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {attachment.filename || "attachment"}
          </span>
          <span style={{ color: "#94a3b8", fontWeight: 500, flexShrink: 0 }}>
            {busyId === attachment.id ? "…" : formatSize(attachment.sizeBytes)}
          </span>
        </button>
      ))}
    </div>
  );
}
