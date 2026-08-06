// Which engineers the row editor's Engineer picker should offer.
//
// The records table can be narrowed to one ASP code (the full-screen ASP Code
// filter, or a REGION_ADMIN whose report only holds their own region). While it
// is, every row on screen belongs to that region — so offering every engineer in
// the company invites assigning a Chennai call to a Hosur engineer, which the
// productivity reports then count against the wrong region.
//
// Region records and rows speak different dialects: a region row carries a code
// like "HOS" and a name like "HOSUR", while report rows carry ASP work-location
// codes like "ASPS01511". `aspCodesForRegionIdentity` is the shared translation
// between the two — the same one the backend row-access checks use — so the
// mapping can never drift between the two sides.

import { aspCodesForRegionIdentity } from "@opencall/shared";

/** The engineer fields this scoping needs — a subset of DropdownEngineer. */
export interface RegionScopedEngineer {
  regionCode?: string | null;
  regionName?: string | null;
}

/**
 * The engineers to offer for a given ASP selection.
 *
 * Returns the full list unchanged when there is nothing to narrow by: no ASP
 * selected, the "all regions" sentinel, or an engineer list that carries no
 * region information at all (an older API build — degrade to showing everyone,
 * never to an empty picker).
 *
 * A selection that matches NO engineer also yields the full list. An empty
 * Engineer dropdown would be a dead end — the user could not assign anyone, and
 * scheduling requires an engineer — so an unrecognised region fails open.
 */
export function engineersForAspCode<T extends RegionScopedEngineer>(
  engineers: T[],
  selectedAspCode: string | null | undefined,
  allValue = "ALL",
): T[] {
  const target = String(selectedAspCode ?? "").trim().toUpperCase();
  if (!target || target === allValue.toUpperCase()) {
    return engineers;
  }

  const knowsItsRegion = engineers.some(
    (engineer) =>
      String(engineer.regionCode ?? "").trim() !== "" ||
      String(engineer.regionName ?? "").trim() !== "",
  );
  if (!knowsItsRegion) {
    return engineers;
  }

  const scoped = engineers.filter((engineer) =>
    aspCodesForRegionIdentity(
      String(engineer.regionCode ?? ""),
      String(engineer.regionName ?? ""),
    ).has(target),
  );

  return scoped.length > 0 ? scoped : engineers;
}
