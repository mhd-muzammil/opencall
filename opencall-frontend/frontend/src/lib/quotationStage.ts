import type { Quotation } from "./quotationApiClient";

/**
 * Where a quotation has got to, as one word.
 *
 * The row already carried the facts — sent or not, replied or not, how many days, what the
 * payment status is — and left the reader to assemble them. This does the assembling, so
 * the column answers "what is happening with this one" rather than handing over four fields
 * to compare.
 *
 * The order below is the order they are tested in, and that order is the design: a settled
 * quotation is settled no matter what else is true of it, and a customer who has written
 * back is not "waiting" however long ago it went out.
 */

export type QuotationStage =
  | "CREATED"
  | "SENT"
  | "WAITING"
  | "REPLIED"
  | "PAID"
  | "DECLINED";

export interface StageView {
  stage: QuotationStage;
  label: string;
  /** Chip colours, so every reader tells the same story about the same state. */
  bg: string;
  fg: string;
  /** True for the states someone should act on: chase them, or read their reply. */
  needsAttention: boolean;
}

/** Sent this long ago with no answer stops being "sent" and starts being "waiting". */
export const OVERDUE_DAYS = 3;

/**
 * Whole days since the FIRST send.
 *
 * From the first, never the last: it answers how long the customer has had it, and a
 * follow-up must not make a fortnight-old quotation look like it went out yesterday.
 * Computed on read, which is what makes the ageing keep itself up to date.
 */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function quotationStage(quotation: Quotation): StageView {
  const status = quotation.paymentStatus ?? "PENDING";

  // Settled first. Both of these are somebody's conclusion — reached by hand or read out
  // of a reply — and nothing about ageing or replies should dress them up as unfinished.
  if (status === "PAID") {
    return { stage: "PAID", label: "Paid", bg: "#dcfce7", fg: "#166534", needsAttention: false };
  }
  if (status === "DECLINED") {
    return { stage: "DECLINED", label: "Declined", bg: "#f1f5f9", fg: "#64748b", needsAttention: false };
  }

  // Never sent from here. Not a failure — plenty are handed over on WhatsApp, at the
  // counter, or were raised before sending existed — so it is stated plainly rather than
  // warned about.
  //
  // Those cannot be re-sent; the customer already has one. What they CAN do is write back
  // saying they have paid, and the watcher reads their work order's mail either way. So a
  // payment-shaped reply is surfaced here too: verifying it is the only thing left to do
  // for a quotation that was never sent from here.
  if (!quotation.sentAt) {
    const flagged = quotation.paymentSignal === "WEAK" || quotation.paymentSignal === "STRONG";
    return flagged
      ? {
          stage: "CREATED",
          label: "Created · check payment",
          bg: "#fef2f2",
          fg: "#b91c1c",
          needsAttention: true,
        }
      : { stage: "CREATED", label: "Created", bg: "#f1f5f9", fg: "#475569", needsAttention: false };
  }

  // They wrote back and it is still open, so someone has to read it. This outranks the
  // ageing: a customer who replied yesterday is not being ignored, whatever the day count
  // says, and chasing them would be the wrong move.
  if (quotation.replySeenAt) {
    return {
      stage: "REPLIED",
      label: quotation.paymentSignal === "WEAK" ? "Replied · check payment" : "Replied",
      bg: "#fef2f2",
      fg: "#b91c1c",
      needsAttention: true,
    };
  }

  const days = daysSince(quotation.sentAt) ?? 0;
  if (days >= OVERDUE_DAYS) {
    return { stage: "WAITING", label: "Waiting", bg: "#ffedd5", fg: "#9a3412", needsAttention: true };
  }

  return { stage: "SENT", label: "Sent", bg: "#dbeafe", fg: "#1d4ed8", needsAttention: false };
}
