"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DebouncedSearchInput } from "../../../components/DebouncedSearchInput";
import {
  NotConfiguredNotice,
  PriorityTag,
  StatusTag,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
  formatDate,
  formatDateTime,
  humanize,
} from "../../../features/ticketing/ticketingUi";
import {
  listTicketingCustomers,
  listTicketingTickets,
  type TicketingCustomer,
  type TicketingPagination,
  type TicketingTicketSummary,
} from "../../../lib/ticketingApiClient";
import { readSession } from "../../../lib/session";

/**
 * Ticketing System: customers of the Renderways (RTPL) customer app and the
 * tickets they raise, read live from Renderways. View only.
 */

type Tab = "customers" | "tickets";

const PAGE_SIZE = 25;

function Paginator({
  pagination,
  noun,
  busy,
  onPage,
}: Readonly<{
  pagination: TicketingPagination | null;
  noun: string;
  busy: boolean;
  onPage: (page: number) => void;
}>) {
  if (!pagination) return null;
  return (
    <div className="adminPaginator">
      <span className="muted">
        {pagination.total} {noun} · page {pagination.page} of {pagination.pages}
      </span>
      <div className="adminPaginatorButtons">
        <button
          type="button"
          className="btnSecondary"
          disabled={busy || pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
        >
          ← Previous
        </button>
        <button
          type="button"
          className="btnSecondary"
          disabled={busy || pagination.page >= pagination.pages}
          onClick={() => onPage(pagination.page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function CustomersTab({ token, refreshKey }: Readonly<{ token: string; refreshKey: number }>) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TicketingCustomer[]>([]);
  const [pagination, setPagination] = useState<TicketingPagination | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setBusy(true);
    setError(null);
    listTicketingCustomers(token, { search, status, page, limit: PAGE_SIZE })
      .then((result) => {
        if (stale) return;
        setConfigured(result.configured);
        setRows(result.customers);
        setPagination(result.configured ? result.pagination : null);
      })
      .catch((e) => {
        if (!stale) setError(e instanceof Error ? e.message : "Failed to load customers");
      })
      .finally(() => {
        if (!stale) setBusy(false);
      });
    // A newer search or page supersedes this request; drop its late answer.
    return () => {
      stale = true;
    };
  }, [token, search, status, page, refreshKey]);

  return (
    <>
      <div className="adminFilters">
        <label className="adminField">
          <span>Search</span>
          <DebouncedSearchInput
            type="search"
            value={search}
            placeholder="Name, mobile, email or company"
            onDebouncedChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
          />
        </label>
        <label className="adminField">
          <span>Account</span>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as "" | "active" | "inactive");
            }}
          >
            <option value="">All customers</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </select>
        </label>
      </div>

      {!configured && <NotConfiguredNotice />}
      {error && <div className="adminError">{error}</div>}

      <div className="adminTableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>City</th>
              <th>Joined</th>
              <th>Last sign-in</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {busy ? "Loading…" : "No customers match these filters."}
                </td>
              </tr>
            )}
            {rows.map((customer) => (
              <tr
                key={customer.id}
                style={{ cursor: "pointer" }}
                onClick={() => router.push(`/admin/ticketing/customers/${customer.id}`)}
              >
                <td>
                  <strong>{customer.name}</strong>
                  {customer.company && <div className="muted">{customer.company}</div>}
                </td>
                <td>{customer.phone}</td>
                <td>{customer.email ?? <span className="muted">Signed up with mobile</span>}</td>
                <td>{customer.address.city || "—"}</td>
                <td>{formatDate(customer.createdAt)}</td>
                <td>{formatDateTime(customer.lastLoginAt)}</td>
                <td>
                  <span className={`adminTag ${customer.isActive ? "good" : "neutral"}`}>
                    {customer.isActive ? "Active" : "Deactivated"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginator pagination={pagination} noun="customers" busy={busy} onPage={setPage} />
    </>
  );
}

function TicketsTab({ token, refreshKey }: Readonly<{ token: string; refreshKey: number }>) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TicketingTicketSummary[]>([]);
  const [pagination, setPagination] = useState<TicketingPagination | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setBusy(true);
    setError(null);
    listTicketingTickets(token, {
      search,
      status,
      priority,
      overdue: overdue || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (stale) return;
        setConfigured(result.configured);
        setRows(result.tickets);
        setPagination(result.configured ? result.pagination : null);
      })
      .catch((e) => {
        if (!stale) setError(e instanceof Error ? e.message : "Failed to load tickets");
      })
      .finally(() => {
        if (!stale) setBusy(false);
      });
    // A newer filter or page supersedes this request; drop its late answer.
    return () => {
      stale = true;
    };
  }, [token, search, status, priority, overdue, page, refreshKey]);

  return (
    <>
      <div className="adminFilters">
        <label className="adminField">
          <span>Search</span>
          <DebouncedSearchInput
            type="search"
            value={search}
            placeholder="Ticket number or subject"
            onDebouncedChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
          />
        </label>
        <label className="adminField">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            {TICKET_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>Priority</span>
          <select
            value={priority}
            onChange={(e) => {
              setPage(1);
              setPriority(e.target.value);
            }}
          >
            {TICKET_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adminField">
          <span>SLA</span>
          <select
            value={overdue ? "overdue" : ""}
            onChange={(e) => {
              setPage(1);
              setOverdue(e.target.value === "overdue");
            }}
          >
            <option value="">All</option>
            <option value="overdue">Overdue only</option>
          </select>
        </label>
      </div>

      {!configured && <NotConfiguredNotice />}
      {error && <div className="adminError">{error}</div>}

      <div className="adminTableWrap">
        <table className="adminTable">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Technician</th>
              <th>Raised</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  {busy ? "Loading…" : "No tickets match these filters."}
                </td>
              </tr>
            )}
            {rows.map((ticket) => (
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
                  {ticket.customer?.name ?? "—"}
                  {ticket.customer?.phone && <div className="muted">{ticket.customer.phone}</div>}
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

      <Paginator pagination={pagination} noun="tickets" busy={busy} onPage={setPage} />
    </>
  );
}

function TicketingRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params?.get("tab") === "tickets" ? "tickets" : "customers";
  const [token, setToken] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setToken(readSession()?.token ?? null);
  }, []);

  const showTab = useCallback(
    (next: Tab) => router.replace(next === "tickets" ? "/admin/ticketing?tab=tickets" : "/admin/ticketing"),
    [router],
  );

  return (
    <section className="adminPage">
      <div className="adminPageHeader">
        <div>
          <p className="eyebrow">Renderways · RTPL customer app</p>
          <h2>Ticketing System</h2>
          <small className="muted">
            Customers who use the Renderways app and website, and the service tickets they raise —
            read live from Renderways. View only.
          </small>
        </div>
        <div className="adminPageActions">
          <button
            type="button"
            className={tab === "customers" ? "btnPrimary" : "btnSecondary"}
            onClick={() => showTab("customers")}
          >
            Customers
          </button>
          <button
            type="button"
            className={tab === "tickets" ? "btnPrimary" : "btnSecondary"}
            onClick={() => showTab("tickets")}
          >
            Tickets
          </button>
          <button
            type="button"
            className="btnSecondary"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      {token &&
        (tab === "customers" ? (
          <CustomersTab token={token} refreshKey={refreshKey} />
        ) : (
          <TicketsTab token={token} refreshKey={refreshKey} />
        ))}
    </section>
  );
}

export default function TicketingPage() {
  // useSearchParams needs a Suspense boundary, or the route opts out of static rendering.
  return (
    <Suspense fallback={null}>
      <TicketingRoute />
    </Suspense>
  );
}
