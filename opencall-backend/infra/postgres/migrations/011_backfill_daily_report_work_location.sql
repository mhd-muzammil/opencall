-- Backfill daily report metadata added in 010 for reports that were generated
-- before product_line_name/work_location were persisted on final report rows.

WITH direct_matches AS (
  SELECT DISTINCT ON (rows.id)
    rows.id AS row_id,
    flex.product_line_name,
    flex.work_location
  FROM daily_call_plan_report_rows AS rows
  JOIN daily_call_plan_reports AS reports
    ON reports.id = rows.report_id
  JOIN flex_wip_records AS flex
    ON flex.upload_batch_id = reports.flex_upload_batch_id
   AND flex.normalized_ticket_id = regexp_replace(upper(coalesce(rows.ticket_id, '')), '[^A-Z0-9]', '', 'g')
  WHERE rows.product_line_name IS NULL OR rows.product_line_name = ''
     OR rows.work_location IS NULL OR rows.work_location = ''
  ORDER BY rows.id, flex.row_number ASC, flex.id ASC
)
UPDATE daily_call_plan_report_rows AS rows
SET
  product_line_name = COALESCE(NULLIF(rows.product_line_name, ''), direct_matches.product_line_name),
  work_location = COALESCE(NULLIF(rows.work_location, ''), direct_matches.work_location)
FROM direct_matches
WHERE rows.id = direct_matches.row_id
  AND (direct_matches.product_line_name IS NOT NULL OR direct_matches.work_location IS NOT NULL);

CREATE TEMP TABLE opencall_report_row_backfill AS
  SELECT
    rows.id,
    reports.report_date,
    rows.serial_no,
    rows.change_type,
    regexp_replace(upper(coalesce(rows.ticket_id, '')), '[^A-Z0-9]', '', 'g') AS normalized_ticket_id,
    rows.product_line_name,
    rows.work_location
  FROM daily_call_plan_report_rows AS rows
  JOIN daily_call_plan_reports AS reports
    ON reports.id = rows.report_id;

CREATE INDEX opencall_report_row_backfill_ticket_date_idx
  ON opencall_report_row_backfill(normalized_ticket_id, report_date DESC);

WITH
previous_matches AS (
  SELECT DISTINCT ON (target.id)
    target.id AS row_id,
    source.product_line_name,
    source.work_location
  FROM opencall_report_row_backfill AS target
  JOIN opencall_report_row_backfill AS source
    ON source.normalized_ticket_id = target.normalized_ticket_id
   AND source.report_date < target.report_date
  WHERE target.change_type = 'CLOSED'
    AND target.normalized_ticket_id <> ''
    AND (
      target.product_line_name IS NULL OR target.product_line_name = ''
      OR target.work_location IS NULL OR target.work_location = ''
    )
    AND (
      source.product_line_name IS NOT NULL OR source.work_location IS NOT NULL
    )
  ORDER BY target.id, source.report_date DESC, source.serial_no ASC, source.id ASC
)
UPDATE daily_call_plan_report_rows AS rows
SET
  product_line_name = COALESCE(NULLIF(rows.product_line_name, ''), previous_matches.product_line_name),
  work_location = COALESCE(NULLIF(rows.work_location, ''), previous_matches.work_location)
FROM previous_matches
WHERE rows.id = previous_matches.row_id;

DROP TABLE opencall_report_row_backfill;
