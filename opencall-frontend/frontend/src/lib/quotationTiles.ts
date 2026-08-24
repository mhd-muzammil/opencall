import type { Quotation } from "./quotationApiClient";

/**
 * What each header box counts, and the only place it is decided.
 *
 * The count in a box and the rows you get when you click it come from the same test, which
 * is what stops the two disagreeing — a tile reading 38 over a list of 41 is worse than
 * either number being wrong on its own. The money under Paid and Not paid is summed over
 * these same tests for the same reason: written separately, "₹83,789 outstanding" once
 * described seven more quotations than the 40 the box beside it was counting, and nothing on
 * the screen said which of the two to believe.
 *
 * Lifted out of the page so the arithmetic below can be tested rather than eyeballed.
 */

/**
 * The customer has this quotation.
 *
 * Normally that means a send was recorded — mailed from here, or found in the mailbox's own
 * Sent folder. But a customer who has PAID a quotation plainly received it, and one who
 * turned it down read it before saying no. Those are stronger evidence of delivery than a
 * Sent-folder entry, and a search that cannot turn the mail up is a limit of the search,
 * not proof the quotation never went.
 *
 * It matters because every box below Sent is measured against this. Without it, three paid
 * quotations whose mail could not be found would sit under "not mailed yet" while their
 * money sat under Paid — and Paid, counted within Sent as it is, would read zero on three
 * quotations that are paid for.
 */
export const reachedCustomer = (q: Quotation): boolean =>
  Boolean(q.sentAt) || q.paymentStatus === "PAID" || q.paymentStatus === "DECLINED";

export type TileKey =
  | "CREATED"
  | "SENT"
  | "REPLIED"
  | "NO_REPLY"
  | "PAID"
  | "NOT_PAID"
  | "REJECTED";

/**
 * A FUNNEL, and the arithmetic closes three ways:
 *
 *   Created + Sent      = every quotation there is
 *   Replied + No reply  = Sent
 *   Paid    + Not paid  = Sent
 *
 * Created and Sent answer one question between them — has the customer got it — so every
 * quotation is in exactly one of the two, settled or not. The four boxes underneath ask two
 * further questions of the ones that went out: did the customer write back, and did they
 * pay. Both are asked of Sent and neither of Created, because a quotation the customer has
 * not received cannot have been answered or paid, and counting it as unanswered or unpaid
 * reads as a customer ignoring us when nobody has been asked anything yet.
 *
 * That is what Not paid used to get wrong. It counted every open quotation, so seven that
 * had never been sent were reported as money a customer was withholding.
 */
export const TILE_TESTS: Record<TileKey, (q: Quotation) => boolean> = {
  CREATED: (q) => !reachedCustomer(q),
  SENT: reachedCustomer,
  REPLIED: (q) => reachedCustomer(q) && Boolean(q.replySeenAt),
  NO_REPLY: (q) => reachedCustomer(q) && !q.replySeenAt,
  PAID: (q) => reachedCustomer(q) && q.paymentStatus === "PAID",
  NOT_PAID: (q) => reachedCustomer(q) && (q.paymentStatus ?? "PENDING") === "PENDING",
  // The customer said no. Settled like Paid — nothing is owed and nobody should chase it —
  // so it is not counted as money outstanding either. Set by hand, never by the sweep.
  REJECTED: (q) => q.paymentStatus === "DECLINED",
};

/** What the "showing X only" line calls each box. */
export const TILE_LABELS: Record<TileKey, string> = {
  CREATED: "created",
  SENT: "sent",
  REPLIED: "replied",
  NO_REPLY: "no reply",
  PAID: "paid",
  NOT_PAID: "not paid",
  REJECTED: "rejected",
};

/** The rupee total of the quotations one box counts, tax included. */
export function tileTotal(items: readonly Quotation[], key: TileKey): number {
  return items
    .filter(TILE_TESTS[key])
    .reduce((sum, q) => sum + q.baseAmount * (1 + (q.sgstPercent + q.cgstPercent) / 100), 0);
}

/** How many quotations one box counts. */
export function tileCount(items: readonly Quotation[], key: TileKey): number {
  return items.filter(TILE_TESTS[key]).length;
}
