import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  composeCustomerEmail,
  type MailboxHealth,
} from "../../../lib/customerEmailApiClient";

/**
 * Compose — write a mail to anyone and send it from a region mailbox.
 *
 * NOTHING here sends on its own. The only path to the network is the Send button, and it
 * asks for confirmation naming the exact recipients first, because this reaches strangers
 * over the company's own domain and cannot be taken back. The server independently
 * re-checks that the chosen mailbox belongs to a region this admin is scoped to — the
 * dropdown below is a convenience, not the control.
 *
 * Rendered through a portal: `.panel` sets `backdrop-filter`, which makes it the containing
 * block for `position: fixed` and would otherwise strand the dialog inside the panel.
 */

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "4px",
  display: "block",
};

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  fontSize: "13.5px",
  color: "#0f172a",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  fontFamily: "inherit",
};

export function ComposeModal({
  token,
  mailboxes,
  defaultRegion,
  inReplyToId,
  defaultTo,
  defaultSubject,
  onClose,
  onSent,
}: Readonly<{
  token: string;
  mailboxes: readonly MailboxHealth[];
  defaultRegion?: string | null;
  inReplyToId?: string | null;
  defaultTo?: string;
  defaultSubject?: string;
  onClose: () => void;
  onSent: (summary: string) => void;
}>) {
  const options = useMemo(
    () => [...mailboxes].sort((a, b) => a.regionCode.localeCompare(b.regionCode)),
    [mailboxes],
  );

  const [regionCode, setRegionCode] = useState(
    defaultRegion?.toUpperCase() || options[0]?.regionCode.toUpperCase() || "",
  );
  const [to, setTo] = useState(defaultTo ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Escape closes, the way every other dialog in the app does. Disabled mid-send so a
  // stray key cannot leave the caller wondering whether the mail went.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const fromEmail = options.find((box) => box.regionCode.toUpperCase() === regionCode)?.email ?? "";

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 10));
    if (fileInput.current) fileInput.current.value = "";
  };

  const send = async () => {
    setError(null);
    if (totalBytes > MAX_TOTAL_BYTES) {
      setError(`The attachments are over ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))} MB in total`);
      return;
    }

    const recipients = [to, cc].filter(Boolean).join(", ");
    const confirmed = window.confirm(
      `Send this mail?\n\nFrom: ${fromEmail}\nTo: ${recipients}\nSubject: ${subject}\n` +
        `${files.length > 0 ? `Attachments: ${files.length}\n` : ""}` +
        `\nIt goes out immediately and cannot be recalled.`,
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const result = await composeCustomerEmail(token, {
        regionCode,
        to,
        cc,
        subject,
        body,
        inReplyToId: inReplyToId ?? null,
        attachments: files,
      });
      onSent(`Sent from ${result.fromEmail} to ${result.to.join(", ")}`);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose email"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: "14px",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <strong style={{ fontSize: "15px", color: "#0f172a" }}>
            {inReplyToId ? "Forward / reply" : "New message"}
          </strong>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              background: "#ffffff",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              minHeight: "30px",
              padding: "2px 12px",
              fontSize: "16px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "16px 20px", overflowY: "auto", display: "grid", gap: "12px" }}>
          <div>
            <label style={label} htmlFor="compose-from">
              From
            </label>
            <select
              id="compose-from"
              value={regionCode}
              onChange={(event) => setRegionCode(event.target.value)}
              style={{ ...field, cursor: "pointer" }}
            >
              {options.length === 0 ? <option value="">No mailbox available</option> : null}
              {options.map((box) => (
                <option key={box.email} value={box.regionCode.toUpperCase()}>
                  {box.regionCode.toUpperCase()} — {box.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="compose-to">
              To
            </label>
            <input
              id="compose-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="customer@example.com, someone@hp.com"
              style={field}
            />
          </div>

          <div>
            <label style={label} htmlFor="compose-cc">
              Cc (optional)
            </label>
            <input
              id="compose-cc"
              value={cc}
              onChange={(event) => setCc(event.target.value)}
              placeholder="manager@renderways.in"
              style={field}
            />
          </div>

          <div>
            <label style={label} htmlFor="compose-subject">
              Subject
            </label>
            <input
              id="compose-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="WO-035104670 — update"
              style={field}
            />
          </div>

          <div>
            <label style={label} htmlFor="compose-body">
              Message
            </label>
            <textarea
              id="compose-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              style={{ ...field, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              onChange={(event) => addFiles(event.target.files)}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                style={{
                  background: "#ffffff",
                  color: "#1e293b",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  minHeight: "34px",
                  cursor: "pointer",
                }}
              >
                📎 Attach files
              </button>
              {files.length > 0 ? (
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  {files.length} file{files.length === 1 ? "" : "s"} · {formatSize(totalBytes)}
                </span>
              ) : null}
            </div>

            {files.length > 0 ? (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {files.map((file, index) => (
                  <span
                    key={`${file.name}-${String(index)}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      borderRadius: "999px",
                      padding: "4px 6px 4px 12px",
                      fontSize: "12px",
                      color: "#1e293b",
                      maxWidth: "260px",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((current) => current.filter((_, i) => i !== index))
                      }
                      style={{
                        background: "#ffffff",
                        color: "#64748b",
                        border: "1px solid #e2e8f0",
                        borderRadius: "999px",
                        width: "22px",
                        minHeight: "22px",
                        height: "22px",
                        padding: 0,
                        fontSize: "13px",
                        lineHeight: 1,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {error ? (
            <div
              style={{
                padding: "9px 12px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "12.5px",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
            Goes out from {fromEmail || "—"}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{
              marginLeft: "auto",
              background: "#ffffff",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 600,
              minHeight: "38px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || options.length === 0}
            style={{
              background: sending ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 22px",
              fontSize: "13px",
              fontWeight: 700,
              minHeight: "38px",
              cursor: sending ? "default" : "pointer",
            }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
