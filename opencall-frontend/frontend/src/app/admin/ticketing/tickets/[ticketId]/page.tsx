"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  PriorityTag,
  StatusTag,
  addressLine,
  formatDateTime,
  formatMoney,
  humanize,
} from "../../../../../features/ticketing/ticketingUi";
import {
  getTicketingTicket,
  type TicketingAttachment,
  type TicketingTicket,
} from "../../../../../lib/ticketingApiClient";
import { readSession } from "../../../../../lib/session";

function Attachments({ files }: Readonly<{ files: TicketingAttachment[] }>) {
  if (files.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {files.map((file) => (
        <li key={file.url}>
          <a href={file.url} target="_blank" rel="noopener noreferrer">
            {file.filename || "Attachment"}
          </a>
          {file.size > 0 && <span className="muted"> · {Math.ceil(file.size / 1024)} KB</span>}
        </li>
      ))}
    </ul>
  );
}

/** One Renderways ticket: everything the customer gave, the conversation and its history. View only. */
export default function TicketingTicketPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params?.ticketId ?? "";
  const [ticket, setTicket] = useState<TicketingTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readSession()?.token;
    if (!token || !ticketId) return;
    getTicketingTicket(token, ticketId)
      .then(setTicket)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the ticket"));
  }, [ticketId]);

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">
            <Link href="/admin/ticketing?tab=tickets">← Ticketing System</Link>
          </p>
          <h2>{ticket ? `${ticket.ticketNumber} · ${ticket.subject}` : "Ticket"}</h2>
          {ticket && (
            <small className="muted">
              Raised {formatDateTime(ticket.createdAt)} · {humanize(ticket.category)} ·{" "}
              {humanize(ticket.serviceMode)}
            </small>
          )}
        </div>
        {ticket && (
          <div className="adminPageActions">
            <StatusTag status={ticket.status} />
            <PriorityTag priority={ticket.priority} />
            {ticket.isOverdue && <span className="adminTag bad">Overdue</span>}
          </div>
        )}
      </div>

      {error && <div className="adminError">{error}</div>}
      {!ticket && !error && <p className="muted">Loading…</p>}

      {ticket && (
        <>
          <div className="adminGrid">
            <div className="panel">
              <h3>Customer</h3>
              <dl className="adminDefList">
                <dt>Name</dt>
                <dd>
                  {ticket.customer ? (
                    <Link href={`/admin/ticketing/customers/${ticket.customer.id}`}>
                      {ticket.customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt>Mobile</dt>
                <dd>
                  {ticket.customer?.phone ? (
                    <a href={`tel:${ticket.customer.phone}`}>{ticket.customer.phone}</a>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt>Email</dt>
                <dd>{ticket.customer?.email ?? "—"}</dd>
                <dt>Company</dt>
                <dd>{ticket.customerCompany || "—"}</dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Visit</h3>
              <dl className="adminDefList">
                <dt>Location</dt>
                <dd>{addressLine(ticket.location)}</dd>
                <dt>Preferred slot</dt>
                <dd>{ticket.preferredSlot ? humanize(ticket.preferredSlot) : "—"}</dd>
                <dt>Technician</dt>
                <dd>
                  {ticket.assignedTo
                    ? `${ticket.assignedTo.name}${ticket.assignedTo.phone ? ` · ${ticket.assignedTo.phone}` : ""}`
                    : "Not assigned yet"}
                </dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Device</h3>
              <dl className="adminDefList">
                <dt>Type</dt>
                <dd>{ticket.device?.type || "—"}</dd>
                <dt>Brand / model</dt>
                <dd>
                  {[ticket.device?.brand, ticket.device?.model].filter(Boolean).join(" ") || "—"}
                </dd>
                <dt>Serial no.</dt>
                <dd>{ticket.device?.serialNumber || "—"}</dd>
                <dt>Under warranty</dt>
                <dd>{ticket.device ? (ticket.device.underWarranty ? "Yes" : "No") : "—"}</dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Timeline &amp; cost</h3>
              <dl className="adminDefList">
                <dt>SLA due</dt>
                <dd>{formatDateTime(ticket.slaDueAt)}</dd>
                <dt>First response</dt>
                <dd>{formatDateTime(ticket.firstRespondedAt)}</dd>
                <dt>Resolved</dt>
                <dd>{formatDateTime(ticket.resolvedAt)}</dd>
                <dt>Closed</dt>
                <dd>{formatDateTime(ticket.closedAt)}</dd>
                {/* Renderways stores 0 until a figure is entered. */}
                <dt>Estimate</dt>
                <dd>{formatMoney(ticket.estimatedCost || null)}</dd>
                <dt>Final cost</dt>
                <dd>{formatMoney(ticket.finalCost || null)}</dd>
              </dl>
            </div>
          </div>

          <div className="panel">
            <h3>Reported problem</h3>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ticket.description || "—"}</p>
            <Attachments files={ticket.attachments} />
          </div>

          {(ticket.resolutionSummary || ticket.rating) && (
            <div className="panel">
              <h3>Resolution</h3>
              {ticket.resolutionSummary && (
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ticket.resolutionSummary}</p>
              )}
              {ticket.rating && (
                <p style={{ margin: 0 }}>
                  <strong>
                    {"★".repeat(ticket.rating.stars)}
                    {"☆".repeat(Math.max(0, 5 - ticket.rating.stars))}
                  </strong>{" "}
                  {ticket.rating.feedback && <span>“{ticket.rating.feedback}”</span>}{" "}
                  <span className="muted">{formatDateTime(ticket.rating.ratedAt)}</span>
                </p>
              )}
            </div>
          )}

          <div className="panel">
            <h3>Conversation ({ticket.comments.length})</h3>
            {ticket.comments.length === 0 && <p className="muted">No messages yet.</p>}
            {ticket.comments.map((comment) => (
              <div
                key={comment.id}
                style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 6 }}
              >
                <div>
                  <strong>{comment.author?.name ?? "Unknown"}</strong>{" "}
                  {comment.author?.role && (
                    <span className="adminTag neutral">{humanize(comment.author.role)}</span>
                  )}
                  {comment.isInternal && <span className="adminTag warn">Internal note</span>}{" "}
                  <span className="muted">{formatDateTime(comment.createdAt)}</span>
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{comment.message}</p>
                <Attachments files={comment.attachments} />
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>History</h3>
            {ticket.activity.length === 0 && <p className="muted">No history yet.</p>}
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {ticket.activity.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <strong>{humanize(entry.action)}</strong>
                  {entry.from && entry.to && (
                    <span>
                      {" "}
                      {humanize(entry.from)} → {humanize(entry.to)}
                    </span>
                  )}
                  {!entry.from && entry.to && <span> → {humanize(entry.to)}</span>}
                  {entry.by?.name && <span className="muted"> · {entry.by.name}</span>}
                  <span className="muted"> · {formatDateTime(entry.at)}</span>
                  {entry.note && <div className="muted">{entry.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
