/**
 * How many engineers each region has.
 *
 * The Engineers page could already answer "how many altogether" and "how many are missing an
 * HP ID", and answering "how many in Salem" meant picking Salem out of a dropdown, reading a
 * number, and doing it again for every other region. Nobody does that; they guess instead.
 *
 * EVERY REGION IS LISTED, INCLUDING THE EMPTY ONES. A region with nobody in it is the single
 * most useful thing this can say — it is a hole in the roster — and it is precisely what a
 * list built only from the engineers that exist cannot show, because there are none to
 * group by. So the regions come from the region list and the counts are filled in from the
 * engineers.
 */

export interface RegionCount {
  /** Region id, or "" for engineers whose region no longer exists. */
  id: string;
  name: string;
  count: number;
}

/** Engineers with no region, or a region id that is not in the list any more. */
export const UNASSIGNED_LABEL = "No region";

export function countByRegion(
  engineers: ReadonlyArray<{ regionId: string }>,
  regions: ReadonlyArray<{ id: string; name: string }>,
): RegionCount[] {
  const known = new Map<string, string>();
  for (const region of regions) known.set(region.id, region.name);

  const counts = new Map<string, number>();
  for (const region of regions) counts.set(region.id, 0);

  let unassigned = 0;
  for (const engineer of engineers) {
    const id = String(engineer.regionId ?? "").trim();
    // A region that has been deleted leaves its engineers pointing at nothing. They are
    // still engineers, and dropping them would make the region totals quietly disagree with
    // the Total Engineers card beside them.
    if (!id || !known.has(id)) {
      unassigned += 1;
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const rows: RegionCount[] = [...counts.entries()].map(([id, count]) => ({
    id,
    name: known.get(id) ?? id,
    count,
  }));
  // Only when there are any: an empty "No region" box is noise on a tidy roster, where an
  // empty "Salem" box is news.
  if (unassigned > 0) rows.push({ id: "", name: UNASSIGNED_LABEL, count: unassigned });

  // Busiest first, and alphabetical within a tie so the order does not shuffle between
  // renders when two regions happen to match.
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
