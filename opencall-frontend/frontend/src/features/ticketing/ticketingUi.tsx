import type { TicketingAddress } from "../../lib/ticketingApiClient";

/** Shared formatting for the Ticketing System pages (Renderways customers and tickets). */

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** "in_progress" / "chip-level-service" -> "In progress" / "Chip level service". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function addressLine(address: TicketingAddress | null | undefined): string {
  if (!address) return "—";
  const parts = [address.line1, address.landmark, address.city, address.state, address.pincode]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

const STATUS_TONE: Record<string, string> = {
  open: "warn",
  assigned: "warn",
  in_progress: "warn",
  awaiting_customer: "warn",
  resolved: "good",
  closed: "good",
  cancelled: "neutral",
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bad",
  high: "bad",
  medium: "warn",
  low: "neutral",
};

export function StatusTag({ status }: Readonly<{ status: string }>) {
  return <span className={`adminTag ${STATUS_TONE[status] ?? "neutral"}`}>{humanize(status)}</span>;
}

export function PriorityTag({ priority }: Readonly<{ priority: string }>) {
  return (
    <span className={`adminTag ${PRIORITY_TONE[priority] ?? "neutral"}`}>{humanize(priority)}</span>
  );
}

export const TICKET_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Open tickets (not closed)" },
  { value: "", label: "All tickets" },
  { value: "archived", label: "Closed / resolved / cancelled" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export const TICKET_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any priority" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Shown while the backend has no Renderways credentials. */
export function NotConfiguredNotice() {
  return (
    <div className="adminError">
      Renderways is not connected yet. Set RENDERWAYS_API_URL, RENDERWAYS_API_USER and
      RENDERWAYS_API_PASSWORD on the OpenCall backend, then refresh.
    </div>
  );
}
