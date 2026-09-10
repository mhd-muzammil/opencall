# Closed Calls — how it works

The reference for anyone changing the Closed Calls page. Read this before altering a
number: several of the counts here look wrong until you know which system they come from.

Companion files:

- `docs/design/closed-calls-v3.html` — the approved redesign mockup (static, sample data).
- `docs/design/closed-calls-redesign-brief.md` — the implementation brief for that redesign.

---

## 1. There are FOUR different "closed" numbers, on purpose

| Number | Source | Means |
|---|---|---|
| **Our closed count** (green) | `report.rows` where `carryForward.closedSyntheticRow` | a ticket vanished from the Flex WIP file, so OpenCall synthesised a CLOSED row |
| **FieldEZ data closure** (purple) | `case_closure_dates` | what the Flex Closure ASP Report said |
| **Raw data closures** (orange) | `flex_raw_records` | what the standalone raw-data project's API says |
| **Reconciliation buckets** | report rows' evening status vs `case_closure_dates` | agreement / disagreement per ticket |

They cover different periods and different populations and **they will not match**. The
page's job is to make each one's source and coverage obvious. Do not average, hide,
reconcile or "fix" them into a single number.

### How our own closed rows are made

`manualFieldCarryForwardService.ts` — when yesterday's ticket is missing from today's
upload, a synthetic row is emitted with `changeType: "CLOSED"`,
`closedSyntheticRow: true` and `sameDayClosedRow: isSameDayClosure(...)`.

`dailyCallPlanGenerator.computeRegionBreakdown` counts those into
`regionBreakdown[].closedCount` and **excludes them from `count`** (active WIP).

> **The ledger accumulates forever.** A closed row is re-stamped CLOSED into every later
> report, with no pruning. So `overallClosedCount` answers *"how many have we ever
> closed"*, never "how many closed today". `sameDayClosedRow` is the only flag that
> separates them.

---

## 2. Props into `ClosedCallsDashboardView`

```ts
overallClosedCount        // Σ regionBreakdown[].closedCount — ALL TIME
closedRegionBreakdown     // [{aspCode, regionName, closedCount, activeCount}], closedCount>0
closedRows                // report.rows.filter(r => r.carryForward.closedSyntheticRow)
selectedRegion / setSelectedRegion    // shared with the rest of the workspace
openRecordsWithFilter     // jump to the Records table (app/page.tsx)
onOpenCaseDetail          // open the case-detail drawer
closureImportToken        // non-null ⇒ Import + Sync buttons (SUPER_ADMIN / REGION_ADMIN, not special-access)
onClosureDatesImported    // parent refetches the report
feedbackToken             // non-null ⇒ Feedback buttons
summaryToken              // read token for every comparison / recon / repeat fetch
```

All filtering is client-side over `closedRows` (can be ~2,000 rows).

---

## 3. The period filter is the spine

One `from`/`to` range scopes the header badge, the source blocks, every region card, the
comparison lines, repeat visits and the ledger. Persisted per tab in `sessionStorage`
under `closedCalls.periodFrom` / `closedCalls.periodTo` / `closedCalls.cycleKey`.
Defaults to today.

`periodPreset` is **derived, never stored** (`features/dashboard/utils/closedCallsPeriod.ts`):

```
!lo && !hi                 → "all"
lo === hi === today        → "today"
lo/hi === bill cycle bounds → "cycle"
otherwise                  → "custom"
```

**`rowInPeriod` — the page-wide predicate:**

- `today` → `row.carryForward.sameDayClosedRow === true` (the report-day rule, *not* a
  date comparison — it still catches a back-dated late closure)
- everything else → parse `output["Case Closed Date"]` (`DD-MM-YYYY` → ISO) and range-test
  it. **No Case Closed Date ⇒ excluded.**

**Bill cycle** = 25th → 24th, keyed by the month it *ends* in (`"2026-08"` = 25 Jul →
24 Aug). Lives in `features/dashboard/utils/billCycle.ts` and is shared with Engineer
Productivity — do not define a second one.

---

## 4. Card counting

`closedCountFor(aspCode, allTimeCount)` is the single resolver, so region cards always sum
to the ALL card:

| preset | ALL card | region card |
|---|---|---|
| today | `closedTodayCount` | `closedTodayCountByAsp` |
| cycle | `cycleTotal` | `cycleCountByAsp` (Case Closed Date in cycle) |
| custom | `dateFilteredTotal` | `dateFilteredCountByAsp` |
| all | `overallClosedCount` | `entry.closedCount` |

ASP code is read as `Work Location ?? "ASP Code" ?? Region ?? "ASP"`, upper-cased; the
region name comes from `ASP_CODE_REGION_MAP` in `@opencall/shared`.

**Outcome split** under each card = `closed / cancelled / unknown`, from
`classifyFlexClosureOutcome(output["Flex Status"])` over rows where
`hasFlexClosureOutcome(output)` (i.e. the key `"Flex Status (WIP)"` exists), with
`unknown = max(0, total − closed − cancelled)`.

---

## 5. The comparison sources

- **FieldEZ** → `GET /api/v1/closure-dates/summary` (day-precise `from`/`to` when a range
  is active, otherwise the all-dates summary).
- **Raw** → `GET /api/v1/flex-raw/summary`. Raw is stored per **month**; a scoped response
  is only trusted when it returns `dayPrecise: true` (needs migration 056). Otherwise the
  page falls back to month mapping and says so.

Both headline **completions only**. `Closed - Canceled` gets its own muted sub-figure.
`hasSplit === false` (a backend that predates the split) hides the sub-line rather than
claiming "0 cancelled".

**Classifier order: CANCEL before CLOSE.** `"Closed - Canceled"` contains both words. The
rule exists in three places kept deliberately in sync:

- `shared/analytics/flexClosure.ts` (frontend + productivity)
- `services/closureDates/closureStatusClassify.ts` (backend, incl. its SQL form generated
  from `CLOSURE_STATUS_MATCHERS`)

Both `shared/` copies (`opencall-frontend/shared`, `open_call_2/shared`) must stay
identical.

---

## 6. Repeat visits

`GET /closure-dates/repeat-visits`. A case closed again within **15 days**
(`REPEAT_VISIT_WINDOW_DAYS`) of its previous closure — HP pays nothing for the callback.

The SQL runs `LAG(...) OVER (PARTITION BY case_id ORDER BY closed_on, wo_id)` over
**every** stored closure and applies the range filter afterwards, so a repeat whose
original closed before the range still counts. Cancellations are excluded from the
sequence entirely.

The panel renders only when `unpaid > 0`. Table sorted **shortest gap first**; gap tone
≤3d red, ≤10d amber, else grey.

---

## 7. Reconciliation

`GET /closure-dates/reconciliation?date=&to=&asp=`

- `matched` — closed both sides
- `closedHereNotInFlex` — we closed it, Flex has not
- `closedInFlexNotHere` — Flex closed it, our evening status does not say closed
- `closedInFlexNoRow` — Flex closed it and **no report row exists for it at all**

It has **its own window**, seeded to today, capped at **31 days** on both sides
(`RECON_MAX_DAYS` / `MAX_RECONCILIATION_DAYS`). That cap exists because an unbounded range
emptied the 10-connection pg pool on 2026-08-27. Do not bind this window to the page
period.

"Closed here" = `eveningFirstStatus` (Evening → Morning → previous day) containing
`"case close"` or `"wo close"`, over rows passing the records-page visibility SQL
(`change_type IS DISTINCT FROM 'CLOSED' OR same_day_closed`, and not "Request to Cancel").
Without that filter every past closure re-counts every day.

**Freshness badge**: `GET /closure-dates/status`. Green "Auto-synced HH:mm" from
`lastSyncAt` (the run log, which includes imported-0 runs); red "stale" after 3 × 15 min;
neutral "no new closures yet" when the sync is alive but `lastImportedAt` is old. This
badge is the FieldEZ worker's liveness probe.

---

## 8. `Case Closed Date` and `Flex Status` are a serve-time overlay

`services/closureDates/closureDateEnricher.ts` stamps the outgoing report response only.
It never writes to `daily_call_plan_report_rows`, never regenerates, and swallows failures
(the report is served as-is).

Two rules that will bite you:

1. **One stored closure may be claimed by one row.** The WO-id pass runs across all rows
   first and claims; the Case-id fallback only gets unclaimed closures. Without it, one
   closure stamped 2–3 rows sharing a Case ID → 22 phantom completions in a bill cycle
   (2026-08-28).
2. **The Flex Status overlay is state-gated, not date-gated.** A closed row is always
   overlaid; an open row only when the closure is dated to this report's day. Otherwise a
   WO closed in June and later reopened stays branded closed forever. The vendor's WIP
   value is parked in `"Flex Status (WIP)"`, whose *presence* is what
   `hasFlexClosureOutcome` tests.

`loadClosureDateLookup` also **drops ambiguous case ids** (a case carrying more than one
closure) from the by-case map rather than coin-flipping.

There is exactly **one** closure date per row (`output["Case Closed Date"]`). There is no
separate "our close date" — our side records only the report day a ticket went CLOSED.

---

## 9. Imports, sync and permissions

| Action | Endpoint | Who |
|---|---|---|
| Import Closure Dates (file) | `POST /closure-dates/import` — **`mode=merge` sent explicitly** | SUPER_ADMIN / REGION_ADMIN |
| Sync Raw Data | `POST /flex-raw/sync` (pulls `FLEX_RAW_API_URL`, **replaces** the set) | SUPER_ADMIN / REGION_ADMIN |
| Auto closure sync | worker → same import endpoint, `source=AUTO`, every 15 min, 7-day lookback | FieldEZ worker |
| All reads | `requirePrincipal`, **ASP-scoped** — totals re-summed from in-scope regions; `unmatched` / `undatedClosed` forced to 0 | any principal |

`mode=merge` is load-bearing. Replace used to be the server default and a partial export
wiped three weeks of closure history on 2026-08-27. `replaceCaseClosureDates` also refuses
to run on an empty batch.

---

## 10. Where the code lives

**Frontend** — `opencall-frontend/frontend/src`

| Path | Role |
|---|---|
| `features/dashboard/components/ClosedCallsDashboardView.tsx` | composition + state only |
| `features/dashboard/components/closedCalls/` | every piece of the page |
| `features/dashboard/components/closureOutcome.ts` | closed/cancelled split readers |
| `features/dashboard/utils/closedCallsPeriod.ts` | the period spine (shared with the sidebar badge) |
| `features/dashboard/utils/billCycle.ts` | 25th→24th cycle (shared with Engineer Productivity) |
| `features/dashboard/hooks/useRecordRowSets.ts` | `closedRows`, `closedTodayRows` |
| `features/dashboard/hooks/useRegionAnalytics.ts` | `overallClosedCount`, `closedRegionBreakdown` |
| `lib/closureDateApiClient.ts` / `lib/flexRawApiClient.ts` / `lib/customerFeedbackApiClient.ts` | the three APIs |
| `app/globals.css` (`.closedCalls`, `.ccModalBg`) | every style — no inline style objects |
| `app/m/closed/page.tsx` | a **separate, simpler** mobile implementation. Changes here need doing twice. |

**Backend** — `open_call_2/backend/src`

| Path | Role |
|---|---|
| `routes/closureDateRoutes.ts` → `controllers/closureDateController.ts` → `repositories/caseClosureDateRepository.ts` | all closure SQL |
| `routes/flexRawDataRoutes.ts` → `controllers/flexRawDataController.ts` → `repositories/flexRawRecordRepository.ts` | raw data |
| `services/closureDates/` | import, serve-time enrichment, reconciliation, status classification |
| `services/flexRawData/` | raw sync + classification |
| `worker/fieldezSyncWorker.ts` | the 15-minute AUTO closure import |

Migrations: `024_same_day_closed_calls`, `029_case_closure_dates`, `030/031` customer
feedback, `036/037/056` flex raw, `041_closure_report_status`. Two more are **script-only,
not numbered migrations**: `applyClosureSyncRunsMigration.ts` (`closure_sync_runs`) and
`applyClosureCaseIdMultiWoMigration.ts` (drops the `case_id` unique index).
