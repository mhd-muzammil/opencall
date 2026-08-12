import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAttachmentObjectUrl,
  getCustomerEmailDetail,
  type EmailAttachment,
} from "../../../lib/customerEmailApiClient";
import {
  applyInlineImages,
  blockRemoteImages,
  buildEmailSrcDoc,
  restoreRemoteImages,
} from "./emailHtmlView";

/**
 * The message itself, shown the way the sender wrote it.
 *
 * Mail HTML is attacker-controlled, so it is never put into this document. It goes into an
 * iframe whose `sandbox` grants no scripting: nothing in a mail can execute, read the
 * session, or navigate the app. `allow-same-origin` is present only so the height can be
 * measured, and it grants nothing on its own — without `allow-scripts` there is no code to
 * use it. Links open in a new tab with the referrer suppressed.
 *
 * Remote images start blocked, the same as Outlook and Gmail: loading one tells the sender
 * the address is live and that someone opened the mail. The sender's OWN attached pictures
 * are fetched with the session token and swapped in as blobs, so a signature logo appears
 * immediately without any request leaving for a third party.
 *
 * Plain-text mail is still rendered as plain text — no iframe, no images, nothing to block.
 */
export function EmailBodyView({
  token,
  emailId,
  fallbackText,
}: Readonly<{ token: string; emailId: string; fallbackText: string }>) {
  const [html, setHtml] = useState("");
  const [text, setText] = useState(fallbackText);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [showImages, setShowImages] = useState(false);
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
    setShowImages(false);
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
        setAttachments(detail.attachments.filter((a) => !a.isInline));

        const inline = detail.attachments.filter((a) => a.isInline);
        const blobByAttachmentId = new Map<string, string>();
        for (const attachment of inline) {
          try {
            const url = await fetchAttachmentObjectUrl(token, emailId, attachment.id);
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            blobUrls.current.push(url);
            blobByAttachmentId.set(attachment.id, url);
          } catch {
            // One picture that will not load is not worth failing the message over.
          }
        }
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

  // A long HP thread is a lot of markup; without this it would be re-scanned on every
  // render, including the one the height measurement itself causes.
  const blocked = useMemo(
    () => (html ? blockRemoteImages(html) : { html: "", blocked: 0 }),
    [html],
  );
  const srcDoc = useMemo(
    () => buildEmailSrcDoc(showImages ? restoreRemoteImages(blocked.html) : blocked.html),
    [blocked.html, showImages],
  );

  // Grow the frame to its content so the pane scrolls as one, rather than trapping the mail
  // in a small box with its own scrollbar.
  const fitToContent = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    setFrameHeight(Math.min(Math.max(doc.body.scrollHeight + 16, 120), 4000));
  }, []);

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

      {blocked.blocked > 0 && !showImages ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            padding: "8px 12px",
            marginBottom: "12px",
            borderRadius: "8px",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            color: "#475569",
          }}
        >
          <span>
            {blocked.blocked} image{blocked.blocked === 1 ? "" : "s"} from the internet
            {" "}blocked — loading them tells the sender you opened this.
          </span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            style={{
              marginLeft: "auto",
              background: "#ffffff",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 600,
              minHeight: "28px",
              cursor: "pointer",
            }}
          >
            Show images
          </button>
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
