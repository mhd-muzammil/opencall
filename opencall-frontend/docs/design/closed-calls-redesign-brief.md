# Task: Redesign the Closed Calls page to match the approved mockup

Reference mockup: `Closed_Calls_Redesign_v3.html` (attached / in repo at `docs/design/closed-calls-v3.html`). Open it in a browser first. Match its layout, hierarchy, labels and colours. It is a static HTML file with sample data — copy its structure and CSS tokens, not its data or its JS.

## Scope

Frontend only, in `opencall-frontend/frontend/src`:

- `features/dashboard/components/ClosedCallsDashboardView.tsx` (2,987 lines, all inline styles) — split into components, restyle, fix the bugs listed below. Do not change what any number means.
- `app/globals.css` — add a `--cc-*` token block scoped to `.closedCalls`.
- `app/page.tsx:4579` — sidebar badge text only.
- `app/m/closed/page.tsx` — out of scope. Leave untouched.

Backend: no changes, except the one optional endpoint addition in section 6. Every existing endpoint, prop, token and permission stays exactly as it is.

## 1. Non-negotiables (read `docs/closed-calls-map.md` first)

1. **Four closed counts stay four.** Our closed count (synthetic CLOSED rows), FieldEZ (`case_closure_dates`), Raw (`flex_raw_records`) and the reconciliation buckets are different sources with different coverage. Do NOT reconcile, average, hide or "fix" them into one number. The redesign makes their source and coverage obvious; it does not merge them.
2. `rowInPeriod` semantics are unchanged: `today` ⇒ `carryForward.sameDayClosedRow === true` (report-day rule); everything else ⇒ range test on `output["Case Closed Date"]`; no date ⇒ excluded.
3. `closedCountFor(aspCode, allTimeCount)` stays the single resolver. Region cards must still sum to the ALL card in every preset.
4. Classifier order: CANCEL before CLOSE. Keep using `classifyFlexClosureOutcome` from `shared/analytics/flexClosure.ts`; do not reimplement it. Both `shared/` copies stay identical.
5. Raw counts are only trusted at day precision when the response has `dayPrecise: true`; otherwise show the month-level fallback with its hint. `hasSplit === false` hides the cancelled sub-line, never shows "0 cancelled".
6. Reconciliation keeps its own `reconDate`/`reconToDate`, seeded to today, capped at 31 days (`RECON_MAX_DAYS`). Do not bind it to the page period.
7. `POST /closure-dates/import` keeps sending `mode=merge` explicitly.
8. Ledger stays paged at 100 (`LEDGER_PAGE_SIZE`); counts and Excel export use the full filtered set.
9. All reads stay ASP-scoped through `summaryToken`; no new unauthenticated fetches.

## 2. Component split

Extract from `ClosedCallsDashboardView.tsx` into `features/dashboard/components/closedCalls/`:

| Component | Owns | Props in |
|---|---|---|
| `ClosedCallsHeader` | title, freshness badge, Import / Sync / Export / Open records buttons (permission-gated by `closureImportToken`) | tokens, handlers |
| `PeriodBar` | presets Today / Bill cycle / Custom / All dates, cycle select, from/to inputs, region tabs, "Showing …" scope text | period state, `selectedRegion`, `setSelectedRegion` |
| `SourceComparison` | the three source blocks (ours / FieldEZ / raw) with outcome split, coverage tag, extra lines (unmatched, no-region, undated), Δ line | resolved counts + coverage flags |
| `RegionCard` + `RegionCardGrid` | ALL card + one per region, `ClosedOutcomeSplit`, FieldEZ + Raw comparison rows with Δ pill | `closedCountFor`, comparison data |
| `RepeatVisitsPanel` | renders only when `unpaid > 0`; KPI trio; table sorted shortest gap first; gap tone ≤3 red / ≤10 amber / else grey | `/closure-dates/repeat-visits` result |
| `ReconciliationPanel` | own window inputs, 31-day cap tag (amber when exceeded), freshness badge, three bucket buttons, optional 4th line | recon state, `/closure-dates/reconciliation`, `/closure-dates/status` |
| `LedgerTable` | search, count line, 12-column table, pager, Feedback button | `filteredClosedRows`, page state |
| `DrillModal` | ONE portaled modal shell used by records drill, case detail and customer feedback | title, subtitle, body, footer |

`ClosedCallsDashboardView.tsx` becomes composition + state only. Target ≤ 500 lines.

## 3. Styling

- Add to `globals.css`, scoped under `.closedCalls`, the token block from the mockup's `:root` (`--cc-bg`, `--cc-card`, `--cc-line`, `--cc-ink*`, `--cc-primary*`, `--cc-ours*`, `--cc-fieldez*`, `--cc-raw*`, `--cc-warn*`, `--cc-bad*`, `--cc-ok`, `--cc-r`, `--cc-sh`). Keep the existing colour meanings: green = ours, purple = FieldEZ, orange = raw, amber = warnings.
- Move every inline style object into classes (CSS modules or the global scope — follow whatever the rest of `features/dashboard` uses). Zero `style={{…}}` in the new components except for genuinely dynamic values (bar widths).
- Font: Inter (already the app font). Tabular numerals on all numeric cells.

## 4. Bugs to fix while restructuring

1. **Ledger columns 16 → 12.** Drop the separate Customer Name, Customer Mail and Contact columns; render them inside the Customer / Segment cell as chips (segment chip + account/name + ✉ + ☎ icons with tooltips). Final order: #, Ticket ID, ASP/Region, WO OTC, Engineer, Customer/Segment, WIP aging, Created, Closed date, Customer status, RTPL status, Action.
2. **Search leak.** `activeRegionStats.closed` and `closedPercentage` must be computed from the period/region set, not `filteredClosedRows` (which includes `searchQuery`). Search narrows the ledger only. Count line reads "N matching of M in period" when a search is active.
3. **Sidebar badge** (`page.tsx:4579`): show the current-period closed count with the all-time count as a smaller secondary (`1,001 / 3,411`), not `overallClosedCount` alone.
4. **Two date pickers.** Page period lives in `PeriodBar`; the reconciliation window is a visibly separate boxed control inside `ReconciliationPanel` with the text "Separate from the page period above" and a `N days` tag.
5. **Single modal shell.** Replace `RecordsDrillModal` and the feedback modal's duplicated portal/backdrop/close logic with `DrillModal`.
6. **Closed date cell**: show our Case Closed Date; if the FieldEZ closure date differs, show it as a purple sub-line (`FieldEZ 27-07-2026`). If the row has no Flex closure outcome, show "no Flex closure" as an amber sub-line under RTPL status.

## 5. Coverage tags (must be data-driven, not hard-coded)

| Source | Preset | Tag |
|---|---|---|
| Ours | today | `report day` — same-day closed rows |
| Ours | cycle / custom | `day-precise` — Case Closed Date in range |
| Ours | all | `all time` — ledger accumulates, never pruned |
| FieldEZ | any range | `day-precise` (from/to summary) |
| FieldEZ | all | `all dates summary` |
| Raw | range with `dayPrecise: true` | `day-precise` |
| Raw | range without | `month-level` (amber) + "whole of <Mon YYYY> — raw data is not day-precise" |
| Raw | all | `all months` |

Extra lines on the FieldEZ block: `N unmatched` (no Work Location), `N undated` (closure with no date — excluded from any range). On the Raw block: `N on no region card`.

## 6. Optional — fourth reconciliation line (backend, small)

Add to `closureReconciliationService.ts` a fourth bucket `closedInFlexNoRow`: closures in `case_closure_dates` in the window with `status=closed` whose `wo_id` / `case_id` matches no row in `daily_call_plan_report_rows` at all. Return it alongside the existing three; keep the same ASP scoping and the 31-day cap. Frontend shows it as the "never in our WIP at all" line under the three buckets, tagged "new". If you skip this, render the line with a "not available" state — do not fake it.

## 7. Acceptance checklist

- [ ] All four presets produce the same numbers as before the refactor (compare against production for the Aug 2026 cycle and for today).
- [ ] Region cards sum to ALL in every preset, with and without a region selected.
- [ ] Typing in ledger search changes only the ledger and its count line.
- [ ] FieldEZ / Raw sub-lines hide (not "0") when the source was never imported or `hasSplit === false`.
- [ ] Reconciliation window > 31 days shows the amber cap tag and does not fire the request.
- [ ] Freshness badge states: green Auto-synced, red stale (> 45 min), neutral "no new closures yet".
- [ ] Every count (source blocks, region comparison rows, buckets, repeat WOs) opens `DrillModal` with the same scope + status it displays.
- [ ] Repeat panel hidden when unpaid = 0; visible and correctly toned otherwise.
- [ ] Export still writes `filteredClosedRows.map(r => r.output)` for the full filtered set.
- [ ] No inline style objects in the new components; no new colours outside the token block.
- [ ] `ClosedCallsDashboardView.tsx` ≤ 500 lines; each extracted component ≤ 300.
- [ ] Mobile `/m/closed` untouched and still builds.

## 8. Order of work

1. Add tokens + create empty component files with prop types.
2. Extract `DrillModal` and migrate both existing modals onto it.
3. Extract `LedgerTable` (with the column merge and search-leak fix) — verify counts.
4. Extract `PeriodBar`, then `RegionCard`/`SourceComparison` — verify sums per preset.
5. Extract `RepeatVisitsPanel` and `ReconciliationPanel`.
6. Restyle to the mockup; sidebar badge.
7. Optional bucket 4.
8. Run the acceptance checklist against production numbers before merging.

Work in small commits, one component per PR where possible. If any existing behaviour is unclear, read the code path in `docs/closed-calls-map.md` before changing it — do not guess.
