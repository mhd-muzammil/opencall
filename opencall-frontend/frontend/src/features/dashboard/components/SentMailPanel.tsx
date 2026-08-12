import { useEffect, useState } from "react";
import {
  getSentCustomerEmails,
  type SentEmailRow,
} from "../../../lib/customerEmailApiClient";

/**
 * Everything this system has sent, newest first.
 *
 * The point is attributability: every row names the person who pressed Send, when, from
 * which mailbox and to whom. A copy also lands in the mailbox's own Sent folder, but this
 * is the view that survives someone tidying webmail, and the only one that records WHO in
 * the team sent it.
 *
 * Read-only. Nothing on this panel can send, resend or edit anything.
 */

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  SENT: { bg: "#dcfce7", fg: "#166534", label: "Sent" },
  FAILED: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
  QUEUED: { bg: "#fef3c7", fg: "#92400e", label: "In flight" },
};

const REGION_TINT: Record<string, string> = {
  CHENNAI: "#2563eb",
  SALEM: "#059669",
  VELLORE: "#7c3aed",
  KANCHIPURAM: "#db2777",
  HOSUR: "#ea580c",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function SentMailPanel({ token }: Readonly<{ token: string }>) {
  const [rows, setRows] = useState<SentEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSentCustomerEmails(token)
      .then((response) => {
        if (!cancelled) setRows(response.rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load sent mail");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <div style={{ padding: "28px", fontSize: "13px", color: "#94a3b8" }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: "28px", fontSize: "13px", color: "#b91c1c" }}>{error}</div>;
  }
  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 28px", textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>✉</div>
        <div style={{ fontSize: "13.5px" }}>Nothing has been sent from OpenCall yet.</div>
        <div style={{ fontSize: "12px", marginTop: "4px" }}>
          Use Compose, or reply to a message from the inbox.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px", padding: "4px 2px" }}>
      {rows.map((row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.QUEUED!;
        return (
          <div
            key={row.id}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#ffffff",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  color: REGION_TINT[row.regionCode.toUpperCase()] ?? "#64748b",
                }}
              >
                {row.regionCode.toUpperCase()}
              </span>
              <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>
                {row.subject || "(no subject)"}
              </strong>
              {row.attachmentCount > 0 ? (
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  📎 {row.attachmentCount}
                </span>
              ) : null}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  background: style.bg,
                  color: style.fg,
                }}
              >
                {style.label}
              </span>
            </div>

            <div style={{ fontSize: "12.5px", color: "#475569" }}>
              {row.fromEmail} → {row.toEmails}
              {row.ccEmails ? <span style={{ color: "#94a3b8" }}> · cc {row.ccEmails}</span> : null}
            </div>

            <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "4px" }}>
              {when(row.sentAt ?? row.createdAt)}
              {row.sentByName ? ` · by ${row.sentByName}` : ""}
            </div>

            {row.error ? (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: "12px",
                }}
              >
                {row.error}
              </div>
            ) : null}

            {row.bodyText ? (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12.5px",
                  color: "#334155",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: "120px",
                  overflow: "auto",
                }}
              >
                {row.bodyText}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
