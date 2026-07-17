# Work orders: header/detail (parts[]) model + received-parts filter

## Summary

The Flex WIP / ASP export is **one row per part**, so a single work order legitimately
spans multiple rows (40+ WOs have 2–5 distinct parts). The old
`dedupeRowsByTicket` collapsed each work order to a single "most complete" row and
silently discarded every other part. That lost parts in OpenCall and made one call
render as several separate work orders in Inventory.

This change replaces ticket collapsing with a **header + detail** model:

```ts
interface GroupedWorkOrder<THeader> {
  ticketKey: string;   // canonical key from normalizeTicketKey()
  header: THeader;     // WO-level fields, chosen ONCE by the existing ranking
  parts: PartLine[];   // ALL distinct part lines for this work order
}
```

Parts are kept, deduped only on the composite part key, and filtered per view by
`Good Part Installed Status`.

## The RCV_SPARE / YTR_INTRANSIT rule

`Good Part Installed Status`: **`RCV_SPARE`** = spare physically received;
**`YTR_INTRANSIT`** = ordered, not yet received; **blank/null** = no part line
(a service call with no spare).

- Received filter is `installedStatus === "RCV_SPARE"` — never `!== "YTR_INTRANSIT"`,
  so blank/no-part rows can never leak in as phantom stock.
- The filter runs **after** grouping, so a mixed work order keeps its identity.

**OpenCall** (call management): the Part column shows the `RCV_SPARE` descriptions
joined by `" / "`, with in-transit parts as a muted `⏳ N in transit` hint (never in
the joined string). A WO with zero received parts is still listed as `Awaiting parts`
— the work order never disappears.

**Inventory** (physical stock): received parts are grouped under one collapsible
work-order header (triangle toggle, collapsed by default).

## Keys (unchanged ranking / normalization)

- Work-order identity: existing `normalizeTicketKey()` (e.g. `WO-032942124` → `32942124`).
- Part-line identity within a WO: composite `(ticketKey + goodPartNo + partOrderNo)`.
  True duplicate lines collapse; genuinely different parts — and the *same* good part
  re-ordered under a new Part Order No — are kept as distinct lines.
- Header selection: the existing `shouldReplaceSelectedRow` ranking (most non-null
  fields → latest timestamp → lowest rowNumber → first-seen), unchanged.

## Backend changes

- **`normalization/dedupeRowsByTicket.ts`** — ADDED (existing exports untouched):
  - `PartLine`, `GroupedWorkOrder<T>`, `RECEIVED_INSTALLED_STATUS`, `IN_TRANSIT_INSTALLED_STATUS`.
  - `groupRowsByTicket<TRow>(rows)` → `{ workOrders, duplicatePartLineCount }`.
  - `dedupePartLineRows<TRow>(rows)` / `findDuplicatePartLineKeys` — flat-row dedup on
    the composite PART key (keeps multiple rows per ticket; identical to the old ticket
    dedup for part-less Renderways/Call Plan rows).
  - `filterReceivedParts` / `filterInTransitParts`, `buildOpenCallPartDisplay`,
    `formatOpenCallPartCell`, `sumReceivedPartValues`, `extractPartLine`.
  - Kept intact: `dedupeRowsByTicket`, `findDuplicateTicketKeys`,
    `getNormalizedTicketKey`, `normalizeTicketKey`, `shouldReplaceSelectedRow`.
- **`excelParser/sourceParsers.ts`** — `buildParsedSourceFile` now dedups on the
  composite **part** key, so a repeated ticket is legal and all distinct part lines
  survive to persistence. The residual-duplicate guard validates the part composite
  key (throws only if the *same part line* survives twice).
- **`excelParser/sourceParsers.ts` + `repositories/sourceRecordRepository.ts`** — Flex
  WIP parsing/read now captures the part-level fields (Good Part No, Part Order No, SO
  Number, Good Part Installed Status, Part Shipment Status(EEG), AWB, Expected Delivery
  Date, Serial Number). Read from the raw row → **no DB migration required**.
- **`compareService/matchingEngine.ts`** — `buildEnrichedRow` sets the `part` field
  (→ `output["Part"]`) to `formatOpenCallPartCell(parts)` (joined received + in-transit
  hint), falling back to the single `partDescription` for ungrouped/Renderways-only rows.
- **`callPlanGenerator/dailyCallPlanGenerator.ts` + `compareService/matchPreviewService.ts`**
  — group Flex WIP with `groupRowsByTicket`, attach `parts` to each header, and match on
  the headers. Duplicate tracking now reports `duplicatePartLineCount`.
- `reportComparison/compareReportsService.ts` intentionally unchanged: it compares
  already-generated report rows (one per work order after generation), so ticket dedup
  there remains correct.

## Frontend changes

- **OpenCall web** (`opencall-frontend/frontend/src/app/page.tsx`) — the `Part` cell
  renders the joined received descriptions plus a muted `⏳ N in transit` / italic
  `Awaiting parts` secondary hint. No other column, style, or layout changed.
- **OpenCall mobile** (`opencall_mobile`) — reads the same `output["Part"]`, so the
  joined string renders with no code change.
- **Inventory web** (`inventory_web/src/components/hp-stock/HPStockTable.tsx`) — rows are
  bucketed by `work_order_id`. A multi-part work order renders as **one collapsible
  header row** (triangle toggle, collapsed by default, `N parts` + aggregate price) with
  the part rows as children on expand; single-part work orders render inline as before.
  This stops one work order from appearing as several independent top-level rows.

## Tests

`backend/src/services/normalization/dedupeRowsByTicket.test.ts` — all pass:
3-part WO → 3 parts nothing dropped; true duplicate part line → collapsed +
`duplicatePartLineCount`; same good part under two Part Order Nos → kept as two;
mixed WO → OpenCall joins 2 received + `⏳ 1 in transit`, inventory shows 2, price =
sum of received; all-in-transit → `Awaiting parts` in OpenCall, absent from received;
blank installed status → never stock, WO still listed; header equals the ranking's
winning row; raw-row field fallback.

Full suite: **backend `tsc` clean + 146 tests green**; **opencall-frontend `tsc` clean
+ 136 unit tests green**; **inventory_web `tsc` clean**. (The 9 "failed" opencall-frontend
files under `tests/` are Playwright e2e/smoke/regression specs picked up by the bare
`vitest` runner — a pre-existing runner-scoping artifact, not a regression.)

## Before / after (for the reviewer)

- **Before:** WO `32942124` with 3 parts → 1 flat row; OpenCall Part shows 1 part, the
  other 2 lost; Inventory shows 3 unrelated "work orders."
- **After:** WO `32942124` → 1 `GroupedWorkOrder` with `parts.length === 3`; OpenCall
  Part shows `SPS-MB … / STRIP-ENCODER PLUS / ASSY-IDS_SYS` (+ `⏳ N in transit` if any);
  Inventory shows one collapsible `WO 32942124 · 3 parts` group.

## Inventory sync now emits one stock row per received part

`inventorySyncService.ts` previously created **one `HPStockItem` per case**, pulling a
single part number with `LIMIT 1` — so a multi-part work order lost its other parts in
Inventory (they showed in OpenCall but not Inventory). Fixed:

- New `resolveCasePartsToSync(caseId)` reads every Flex WIP row for the case (most recent
  batch first), builds the distinct part lines, and returns the **received** (`RCV_SPARE`)
  parts. If parts carry status but none are received (all in transit), it returns none
  (the work order holds no stock yet); if no row carries any installed-status info at all
  (legacy/unpopulated data), it returns all distinct parts so stock is never hidden.
- Each part is upserted as its **own** HP Stock item, keyed on
  `(case_id + good_part_number + part_order_number)`, with its own `part_description` /
  `so_number` / `part_shipment_status`. Both sync paths (HTTP API and local SQLite) were
  updated; SQLite updates now target the matched row **by id** (never the whole case) and
  still never overwrite workflow status / transition history.
- Combined with the collapsible `HPStockTable` grouping, a multi-part work order now shows
  all its received parts in Inventory under one `WO … · N parts` group.

**Existing data:** the multi-part rows only exist for uploads parsed under the new
`buildParsedSourceFile` (old uploads collapsed parts before persistence). To populate
Inventory for an already-uploaded multi-part work order, **regenerate the report** (fires
the sync on row insert) or run `pnpm hp-stock:backfill` — both now expand each case into
its received parts.
