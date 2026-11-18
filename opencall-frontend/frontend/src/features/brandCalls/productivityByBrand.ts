import { brandForTicketId, type CallBrand } from "@opencall/shared";

/**
 * Engineer Productivity per brand. The counts are not stored per brand — a frozen
 * day's snapshot predates Acer — but every count carries its ticket list, and a
 * ticket's brand is in its id ("ACER-…"). So a brand's figures are its tickets'
 * counts. For a range the lists hold one entry per call-day, matching the counts.
 */

export type ProductivityBrandView = "ALL" | CallBrand;

const BUCKETS = [
  ["assigned", "assignedTickets"],
  ["attended", "attendedTickets"],
  ["closed", "closedTickets"],
  ["partOrdered", "partOrderedTickets"],
  ["underObservation", "underObservationTickets"],
  ["cxReschedule", "cxRescheduleTickets"],
  ["engineerDelay", "engineerDelayTickets"],
] as const;

type Countable = {
  assigned: number;
  attended: number;
  closed: number;
  partOrdered: number;
  underObservation: number;
  cxReschedule: number;
  engineerDelay?: number;
  assignedTickets?: readonly string[];
  attendedTickets?: readonly string[];
  closedTickets?: readonly string[];
  partOrderedTickets?: readonly string[];
  underObservationTickets?: readonly string[];
  cxRescheduleTickets?: readonly string[];
  engineerDelayTickets?: readonly string[];
};

/** One engineer's entry with only `brand`'s calls counted. */
export function entryForBrand<T extends Countable>(entry: T, brand: CallBrand): T {
  const next: T = { ...entry };
  for (const [countKey, ticketsKey] of BUCKETS) {
    const tickets = entry[ticketsKey];
    if (!tickets) {
      // No ticket list to split by: everything before Acer was HP.
      if (brand !== "HP") (next as Record<string, unknown>)[countKey] = 0;
      continue;
    }
    const kept = tickets.filter((ticket) => brandForTicketId(ticket) === brand);
    (next as Record<string, unknown>)[ticketsKey] = kept;
    (next as Record<string, unknown>)[countKey] = kept.length;
  }
  return next;
}

/** The list for a brand view: engineers with no call of that brand drop out. */
export function listForBrand<T extends Countable>(list: readonly T[], view: ProductivityBrandView): T[] {
  if (view === "ALL") return [...list];
  return list
    .map((entry) => entryForBrand(entry, view))
    .filter((entry) => BUCKETS.some(([countKey]) => (entry[countKey] ?? 0) > 0));
}

/** Does the period have any Acer call at all? (Hides the switch until it matters.) */
export function hasBrandCalls(list: readonly Countable[], brand: CallBrand): boolean {
  return list.some((entry) =>
    BUCKETS.some(([, ticketsKey]) =>
      (entry[ticketsKey] ?? []).some((ticket) => brandForTicketId(ticket) === brand),
    ),
  );
}
