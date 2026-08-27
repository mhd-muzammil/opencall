import { WEB_API_BASE_URL } from "./api/webApiClient";
import { readJson } from "./api/http";

/**
 * Customer Emails client. Types are declared locally, like the other newer clients.
 *
 * Two functions here put mail on the wire — `sendCustomerEmailReply` and
 * `composeCustomerEmail` — and both are called only from an explicit Send click. Nothing
 * on this page sends on a timer, on load, or as a side effect of anything else.
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
  /** True when the message carries a real (non-inline) file. Drives the paperclip icon. */
  hasAttachments?: boolean;
}

export interface EmailAttachment {
  id: string;
  /** Non-empty only for pictures the HTML body refers to as src="cid:...". */
  contentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isInline: boolean;
}

export interface InboundEmailDetail {
  /** The list row plus `bodyHtml`, which the list deliberately does not carry. */
  message: InboundEmailRow & { bodyHtml: string };
  attachments: EmailAttachment[];
}

export interface MailboxHealth {
  regionCode: string;
  email: string;
  ingestFrom: string;
  lastPolledAt: string | null;
  lastError: string;
}

/** Mail held against one work order, for the marker on a report row. */
export interface InboundEmailWoSummary {
  ticketId: string;
  total: number;
  escalations: number;
  lastReceivedAt: string;
}

/**
 * Which work orders have mail against them.
 *
 * One request for the whole report rather than one per row: a report is hundreds of rows
 * and the answer for most is "none", so the reader takes this list and turns it into a
 * lookup.
 */
export async function getCustomerEmailWoSummary(
  token: string,
): Promise<InboundEmailWoSummary[]> {
  const response = await fetch(
    `${WEB_API_BASE_URL}/api/v1/customer-emails/wo-summary`,
    { headers: authHeaders(token), cache: "no-store" },
  );
  const data = await readJson<{ rows: InboundEmailWoSummary[] }>(response);
  return data.rows;
}

/**
 * How much mail is held at one status in one region — counted over everything stored, not
 * over the page that came back with it. The header's tallies are about the mailbox; the
 * rows are only what is currently on screen.
 */
export interface InboundEmailCount {
  status: string;
  regionCode: string;
  total: number;
  escalations: number;
}

export interface CustomerEmailsResponse {
  rows: InboundEmailRow[];
  mailboxes: MailboxHealth[];
  /** Absent from an older API; treat as empty and fall back to counting rows. */
  counts?: InboundEmailCount[];
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function getCustomerEmails(
  token: string,
  params: {
    status?: string;
    limit?: number;
    offset?: number;
    ticketId?: string;
    cabOnly?: boolean;
    /** Inclusive day bounds, `YYYY-MM-DD`. The server reads them as IST days. */
    from?: string;
    to?: string;
  } = {},
): Promise<CustomerEmailsResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  // Only when asked for. Omitted means the newest page, which is what every existing
  // caller wants and what the server assumes.
  if (params.offset) qs.set("offset", String(params.offset));
  // One work order's mail only — filtered on the server, so mail older than the current
  // page is still found.
  if (params.ticketId) qs.set("ticketId", params.ticketId);
  // Cab mail only. Filtered on the server for the same reason as the work order above: cab
  // mail from last week is older than the page the list holds, and filtering what is already
  // loaded would show nothing and read as "there is no cab mail".
  if (params.cabOnly) qs.set("cabOnly", "1");
  // Both bounds are inclusive days. Sent only when present, so a caller that asks for no
  // period gets the same unbounded list it always did.
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
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

// --- Original-fidelity reading ---

/** One message with the sender's own HTML and the list of files it carries. */
export async function getCustomerEmailDetail(
  token: string,
  id: string,
): Promise<InboundEmailDetail> {
  const response = await fetch(`${REPLY_BASE}/${id}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<InboundEmailDetail>(response);
}

/**
 * One attachment's bytes as an object URL.
 *
 * The endpoint needs a bearer token and an `<img>` cannot carry one, so the picture is
 * fetched here and handed to the renderer as a `blob:` URL. Callers must revoke it when
 * the message is closed, or every mail opened leaks its images for the life of the tab.
 */
export async function fetchAttachmentObjectUrl(
  token: string,
  emailId: string,
  attachmentId: string,
): Promise<string> {
  const response = await fetch(`${REPLY_BASE}/${emailId}/attachments/${attachmentId}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Attachment failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

// --- Compose: a new mail to anyone, from a region mailbox ---
// Super Admin and Region Admin only; the server re-checks that the chosen mailbox belongs
// to a region the caller is scoped to.

export interface ComposeResult {
  id: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  attachmentCount: number;
}

export interface SentEmailRow {
  id: string;
  regionCode: string;
  fromEmail: string;
  toEmails: string;
  ccEmails: string;
  subject: string;
  bodyText: string;
  /** 'QUEUED' | 'SENT' | 'FAILED' */
  status: string;
  error: string;
  sentByName: string;
  sentAt: string | null;
  createdAt: string;
  attachmentCount: number;
}

/** Sends for real. Only ever called from an explicit Send click. */
export async function composeCustomerEmail(
  token: string,
  input: {
    regionCode: string;
    to: string;
    cc: string;
    subject: string;
    body: string;
    inReplyToId?: string | null;
    attachments: readonly File[];
  },
): Promise<ComposeResult> {
  const form = new FormData();
  form.set("regionCode", input.regionCode);
  form.set("to", input.to);
  form.set("cc", input.cc);
  form.set("subject", input.subject);
  form.set("body", input.body);
  if (input.inReplyToId) form.set("inReplyToId", input.inReplyToId);
  for (const file of input.attachments) form.append("attachments", file);

  // No Content-Type here on purpose — the browser has to set the multipart boundary.
  const response = await fetch(`${REPLY_BASE}/compose`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return readJson<ComposeResult>(response);
}

export async function getSentCustomerEmails(
  token: string,
  limit = 100,
): Promise<{ rows: SentEmailRow[] }> {
  const response = await fetch(`${REPLY_BASE}/sent?limit=${limit}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return readJson<{ rows: SentEmailRow[] }>(response);
}
