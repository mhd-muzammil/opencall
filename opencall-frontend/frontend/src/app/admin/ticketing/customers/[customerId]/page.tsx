"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  PriorityTag,
  StatusTag,
  addressLine,
  formatDate,
  formatDateTime,
  humanize,
} from "../../../../../features/ticketing/ticketingUi";
import {
  getTicketingCustomer,
  type TicketingCustomerDetail,
} from "../../../../../lib/ticketingApiClient";
import { readSession } from "../../../../../lib/session";

/** One Renderways customer, A to Z, with every ticket they have raised. View only. */
export default function TicketingCustomerPage() {
  const router = useRouter();
  const params = useParams<{ customerId: string }>();
  const customerId = params?.customerId ?? "";
  const [detail, setDetail] = useState<TicketingCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readSession()?.token;
    if (!token || !customerId) return;
    getTicketingCustomer(token, customerId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the customer"));
  }, [customerId]);

  const customer = detail?.customer;

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">
            <Link href="/admin/ticketing">← Ticketing System</Link>
          </p>
          <h2>{customer?.name ?? "Customer"}</h2>
          {customer && (
            <small className="muted">
              Renderways customer since {formatDate(customer.createdAt)}
              {customer.company ? ` · ${customer.company}` : ""}
            </small>
          )}
        </div>
        {customer && (
          <div className="adminPageActions">
            <span className={`adminTag ${customer.isActive ? "good" : "neutral"}`}>
              {customer.isActive ? "Active account" : "Deactivated"}
            </span>
          </div>
        )}
      </div>

      {error && <div className="adminError">{error}</div>}
      {!detail && !error && <p className="muted">Loading…</p>}

      {customer && detail && (
        <>
          <div className="adminGrid">
            <div className="panel">
              <h3>Contact</h3>
              <dl className="adminDefList">
                <dt>Mobile</dt>
                <dd>
                  <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                </dd>
                <dt>Email</dt>
                <dd>
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`}>{customer.email}</a>
                  ) : (
                    <span className="muted">Not added — signed up with mobile number</span>
                  )}
                </dd>
                <dt>Company</dt>
                <dd>{customer.company || "—"}</dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Address</h3>
              <dl className="adminDefList">
                <dt>Address</dt>
                <dd>{customer.address.line1 || "—"}</dd>
                <dt>City</dt>
                <dd>{customer.address.city || "—"}</dd>
                <dt>State</dt>
                <dd>{customer.address.state || "—"}</dd>
                <dt>Pincode</dt>
                <dd>{customer.address.pincode || "—"}</dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Account</h3>
              <dl className="adminDefList">
                <dt>Joined</dt>
                <dd>{formatDateTime(customer.createdAt)}</dd>
                <dt>Last sign-in</dt>
                <dd>{formatDateTime(customer.lastLoginAt)}</dd>
                <dt>Updates by</dt>
                <dd>
                  {customer.notificationPrefs
                    ? [
                        customer.notificationPrefs.whatsapp && "WhatsApp",
                        customer.notificationPrefs.email && "Email",
                      ]
                        .filter(Boolean)
                        .join(" & ") || "Turned off"
                    : "—"}
                </dd>
                <dt>Renderways id</dt>
                <dd className="muted">{customer.id}</dd>
              </dl>
            </div>

            <div className="panel">
              <h3>Tickets</h3>
              <dl className="adminDefList">
                <dt>Total raised</dt>
                <dd>
                  <strong>{detail.stats.totalTickets}</strong>
                </dd>
                <dt>Still open</dt>
                <dd>
                  <strong>{detail.stats.openTickets}</strong>
                </dd>
                <dt>Full address</dt>
                <dd>{addressLine(customer.address)}</dd>
              </dl>
            </div>
          </div>

          <div className="adminTableWrap">
            <table className="adminTable">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Service</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {detail.tickets.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      This customer has not raised a ticket yet.
                    </td>
                  </tr>
                )}
                {detail.tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/admin/ticketing/tickets/${ticket.id}`)}
                  >
                    <td style={{ maxWidth: 360 }}>
                      <strong style={{ fontFamily: "ui-monospace, monospace" }}>
                        {ticket.ticketNumber}
                      </strong>
                      <div>{ticket.subject}</div>
                    </td>
                    <td>
                      {humanize(ticket.category)}
                      <div className="muted">{humanize(ticket.serviceMode)}</div>
                    </td>
                    <td>
                      <PriorityTag priority={ticket.priority} />
                    </td>
                    <td>
                      <StatusTag status={ticket.status} />
                      {ticket.isOverdue && <span className="adminTag bad">Overdue</span>}
                    </td>
                    <td>{ticket.assignedTo?.name ?? <span className="muted">Not assigned</span>}</td>
                    <td>{formatDateTime(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.ticketPagination.total > detail.tickets.length && (
            <p className="muted">
              Showing the latest {detail.tickets.length} of {detail.ticketPagination.total} tickets.
            </p>
          )}
        </>
      )}
    </section>
  );
}
