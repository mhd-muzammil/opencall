import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Ticketing System: Renderways (RTPL customer app) customers and the tickets
 * they raise, read live through the OpenCall backend (endpoints under
 * /api/v1/ticketing, SUPER_ADMIN only). Mirrors payrollTrackingApiClient: pass
 * the session token.
 */

export interface TicketingAddress {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
}

export interface TicketingPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface TicketingCustomer {
  id: string;
  name: string;
  /** Null for customers who signed up with just a mobile number. */
  email: string | null;
  phone: string;
  company: string;
  address: TicketingAddress;
  isActive: boolean;
  notificationPrefs: { email: boolean; whatsapp: boolean } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TicketingPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export interface TicketingAttachment {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface TicketingComment {
  id: string;
  author: TicketingPerson | null;
  message: string;
  isInternal: boolean;
  attachments: TicketingAttachment[];
  createdAt: string;
}

export interface TicketingActivity {
  action: string;
  by: TicketingPerson | null;
  from: string;
  to: string;
  note: string;
  at: string;
}

export interface TicketingTicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  serviceMode: string;
  customer: TicketingPerson | null;
  assignedTo: TicketingPerson | null;
  isOverdue: boolean;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TicketingTicket extends TicketingTicketSummary {
  description: string;
  device: {
    type: string;
    brand: string;
    model: string;
    serialNumber: string;
    underWarranty: boolean;
  } | null;
  location: TicketingAddress | null;
  customerCompany: string;
  preferredSlot: string | null;
  attachments: TicketingAttachment[];
  comments: TicketingComment[];
  activity: TicketingActivity[];
  estimatedCost: number | null;
  finalCost: number | null;
  resolutionSummary: string;
  rating: { stars: number; feedback: string; ratedAt: string | null } | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketingCustomerList {
  /** False until the backend has RENDERWAYS_API_URL / _USER / _PASSWORD. */
  configured: boolean;
  customers: TicketingCustomer[];
  pagination: TicketingPagination;
}

export interface TicketingTicketList {
  configured: boolean;
  tickets: TicketingTicketSummary[];
  pagination: TicketingPagination;
}

export interface TicketingCustomerDetail {
  customer: TicketingCustomer;
  stats: { totalTickets: number; openTickets: number };
  tickets: TicketingTicketSummary[];
  ticketPagination: TicketingPagination;
}

function url(path: string): string {
  return `${WEB_API_BASE_URL}${path}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function listTicketingCustomers(
  token: string,
  params: {
    search?: string | undefined;
    status?: "active" | "inactive" | "" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  },
): Promise<TicketingCustomerList> {
  const response = await fetch(url(`/api/v1/ticketing/customers${query(params)}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<TicketingCustomerList>(response);
}

export async function getTicketingCustomer(
  token: string,
  customerId: string,
): Promise<TicketingCustomerDetail> {
  const response = await fetch(
    url(`/api/v1/ticketing/customers/${encodeURIComponent(customerId)}`),
    { headers: authHeaders(token), cache: "no-store" },
  );
  return readJson<TicketingCustomerDetail>(response);
}

export async function listTicketingTickets(
  token: string,
  params: {
    search?: string | undefined;
    status?: string | undefined;
    priority?: string | undefined;
    overdue?: boolean | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  },
): Promise<TicketingTicketList> {
  const response = await fetch(url(`/api/v1/ticketing/tickets${query(params)}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<TicketingTicketList>(response);
}

export async function getTicketingTicket(token: string, ticketId: string): Promise<TicketingTicket> {
  const response = await fetch(url(`/api/v1/ticketing/tickets/${encodeURIComponent(ticketId)}`), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<TicketingTicket>(response);
}
