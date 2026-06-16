# Native PivotTable export template

The `.xlsx` export (`Download Excel (.xlsx)`) produces a workbook whose **Pivot**
sheet is a *real* native Excel PivotTable — with the PivotTable Analyze tab, the
Fields pane, drag-and-drop fields, refresh, drill-down and expand/collapse.

SheetJS (the `xlsx` package) cannot create or preserve native PivotTable parts,
so the export instead injects the live report data into a **prebuilt template
workbook** that already contains the configured PivotTable. You author that
template once in Excel and commit it; the exporter
([`pivotWorkbook.ts`](../src/lib/pivotWorkbook.ts)) then, at download time:

1. rewrites the pivot's data sheet (`opencall`) with the day's open-call rows,
2. repoints the PivotTable cache source range at the new data extent,
3. sets `refreshOnLoad="1"` so Excel rebuilds the cache when the file opens,
4. fills the optional `Today Open Call` / `Today Closed Calls` sheets if present,
5. leaves **every** PivotTable XML part otherwise untouched.

Until the template file exists the export falls back to a plain two-sheet
workbook (no pivot) and logs a console warning — so nothing breaks meanwhile.

## Where the file goes

```
opencall-frontend/frontend/public/pivot-template.xlsx
```

Next serves `public/` at the site root, so the exporter fetches it from
`/pivot-template.xlsx`. Save it as a real **Excel Workbook (.xlsx)** — not
`.xlsm` / `.xlsb` / a CSV renamed to `.xlsx`.

## Sheets

| Sheet name           | Required? | Purpose                                    | Author it as |
| -------------------- | --------- | ------------------------------------------ | ------------ |
| `opencall`           | yes       | PivotTable data source                     | headers + sample rows |
| `pivot`              | yes       | the native PivotTable                      | built from `opencall` |
| `Today Open Call`    | optional  | verbatim open-call data (exporter fills)   | empty |
| `Today Closed Calls` | optional  | verbatim closed-call data (exporter fills) | empty |

A minimal template is just the two required sheets (`opencall` + `pivot`).

The exporter auto-detects the pivot's source sheet from the cache, so the data
sheet may be named anything (`opencall`, `Sheet1`, …) *as long as* the
PivotTable reads from it — Excel keeps that link in sync when you rename a tab.
The `pivot` sheet's name is purely cosmetic (the exporter never references it).
The two optional sheets, however, are matched by name and must be spelled
exactly (`Today Open Call`, `Today Closed Calls`) to be populated.

## `opencall` header row (row 1, columns A–Z)

Paste this tab-separated line into `A1` so the 26 columns land in `A1:Z1`,
in this exact order (it mirrors `DAILY_CALL_PLAN_COLUMNS`):

```
S.no	Ticket ID	Case ID	Segment	WIP aging	Location	RTPL status	Current Remarks	Engineer	Flex Status	Status Aging	HP Owner Status	Part	Product Name	Product S.No	Product Line Name	Work Location	WO OTC CODE	Account Name	Customer Name	Contact	WIP Aging Category	TAT	Customer Mail	RCA	Case Created Time
```

The pivot's cache fields are created from these headers in order, so the order
and exact text must not change. (If the column set ever changes, rebuild the
template.)

## Build steps (Excel)

1. New workbook; rename the first sheet to `opencall`.
2. Paste the header line above into `A1`.
3. Add ~15–30 representative sample rows beneath it. Cover several **RTPL
   status** values, several **WIP aging** numbers, a couple of **Segment** and
   **WO OTC CODE** values, and give every row a unique **Ticket ID**. (Sample
   data only seeds the layout; the exporter replaces it every download.)
4. Select the data range `A1:Z<n>` → **Insert ▸ PivotTable ▸ New Worksheet**.
   Build it from a **plain cell range, not an Excel Table / named range** — the
   exporter updates `worksheetSource ref`, which only exists for a range source.
5. Rename the new sheet to `pivot` and configure the Fields pane:
   - **Filters:** `Segment`, `WO OTC CODE`
   - **Rows:** `RTPL status`
   - **Columns:** `WIP aging`
   - **Values:** `Ticket ID` → must read **Count of Ticket ID** (if it shows
     *Sum*, open *Value Field Settings* and choose **Count**)
6. *(Optional)* Add empty sheets named exactly `Today Open Call` and
   `Today Closed Calls` if you also want verbatim data sheets in the export.
7. **Save As ▸ Excel Workbook (.xlsx)** → `pivot-template.xlsx` → place it in
   `opencall-frontend/frontend/public/`.

## Verify

1. Run the app, generate a report, click **Download Excel (.xlsx)**.
2. Open the file in Excel. The **Pivot** sheet should show a live PivotTable; on
   open Excel refreshes it from the freshly injected `Sheet1` data.
3. Click inside it → the **PivotTable Analyze** tab and **Fields** pane appear;
   fields drag/drop; right-click ▸ refresh / expand / collapse / drill-down all
   work.

If Excel ever prompts to "repair" the file, the template's XML was edited by
hand — re-create it from Excel using the steps above rather than patching XML.
