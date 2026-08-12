import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Customer Emails client — Stage 1 is read + triage only, so there is no send function
 * here on purpose. Types are declared locally, like the other newer clients.
 */

export interface InboundEmailRow {
  id: string;
  mailboxEmail: string;
  regionCode: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  bodyPreview: string;
  /** Full cleaned message text for the reading pane. */
  bodyText: string;
  receivedAt: string;
  matchedTicketId: string;
  matchedCaseId: string;
  /** 'WO_NUMBER' | 'CUSTOMER_EMAIL' | 'NONE' */
  matchMethod: string;
  /** 'HIGH' | 'LOW' | 'NONE' */
  matchConfidence: string;
  isAutoReply: boolean;
  /** 'HIGH' | 'WATCH' | 'NONE' */
  escalationLevel: string;
  /** Pipe-separated reasons the message was flagged. */
  escalationReasons: string;
  /** 'NEW' | 'REVIEWED' | 'IGNORED' */
  status: string;
}

export interface MailboxHealth {
  regionCode: string;
  email: string;
  ingestFrom: string;
  lastPolledAt: string | null;
  lastError: string;
}

export interface CustomerEmailsResponse {
  rows: InboundEmailRow[];
  mailboxes: MailboxHealth[];
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function getCustomerEmails(
  token: string,
  params: { status?: string; limit?: number } = {},
): Promise<CustomerEmailsResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/customer-emails${suffix}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<CustomerEmailsResponse>(response);
}

export async function setCustomerEmailStatus(
  token: string,
  id: string,
  status: "NEW" | "REVIEWED" | "IGNORED",
): Promise<{ id: string; status: string }> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/customer-emails/${id}/status`,
    {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  return readJson<{ id: string; status: string }>(response);
}

/** Fetch now instead of waiting for the worker. Still read-only. */
export async function pollCustomerEmails(
  token: string,
): Promise<{ results: Array<{ mailbox: string; fetched: number; stored: number; matched: number; error: string }> }> {
  const response = await fetch(`${WEB_API_BASE_URL}/api/v1/customer-emails/poll`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return readJson<{ results: Array<{ mailbox: string; fetched: number; stored: number; matched: number; error: string }> }>(response);
}

// --- Stage 2 replies: APPROVAL MODE ---
// Draft and save never send. Only `sendCustomerEmailReply` puts mail on the wire, and the
// server records the caller as the approver.

export interface EmailReply {
  id: string;
  inboundEmailId: string;
  toEmail: string;
  subject: string;
  body: string;
  generatedBy: string;
  /** 'DRAFT' | 'SENT' | 'FAILED' */
  status: string;
  approvedBy: string | null;
  sentAt: string | null;
  error: string;
}

const REPLY_BASE = `${WEB_API_BASE_URL}/api/v1/customer-emails`;

export async function getCustomerEmailReply(
  token: string,
  id: string,
): Promise<EmailReply | null> {
  const response = await fetch(`${REPLY_BASE}/${id}/reply`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<EmailReply | null>(response);
}

export async function generateCustomerEmailReply(
  token: string,
  id: string,
): Promise<EmailReply> {
  const response = await fetch(`${REPLY_BASE}/${id}/reply/draft`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return readJson<EmailReply>(response);
}

export async function saveCustomerEmailReply(
  token: string,
  id: string,
  draft: { subject: string; body: string },
): Promise<EmailReply> {
  const response = await fetch(`${REPLY_BASE}/${id}/reply`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return readJson<EmailReply>(response);
}

/** Sends for real. Only called from an explicit Send click. */
export async function sendCustomerEmailReply(
  token: string,
  id: string,
): Promise<EmailReply> {
  const response = await fetch(`${REPLY_BASE}/${id}/reply/send`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return readJson<EmailReply>(response);
}
