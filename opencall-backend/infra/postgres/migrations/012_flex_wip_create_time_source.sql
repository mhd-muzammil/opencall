ALTER TABLE flex_wip_records
  ADD COLUMN IF NOT EXISTS create_time TIMESTAMPTZ;

WITH parsed_flex_create_time AS (
  SELECT
    id,
    COALESCE(
      raw_row ->> 'Create Time',
      raw_row ->> 'CreateTime',
      raw_row ->> 'Created Time',
      raw_row ->> 'Case Created Time'
    ) AS raw_create_time
  FROM flex_wip_records
  WHERE create_time IS NULL
),
normalized_flex_create_time AS (
  SELECT
    id,
    CASE
      WHEN raw_create_time ~ '^\d{4}-\d{2}-\d{2}T' THEN raw_create_time::timestamptz
      WHEN raw_create_time ~ '^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM|am|pm)$'
        THEN to_timestamp(raw_create_time, 'DD-MM-YYYY HH12:MI:SS AM')
      WHEN raw_create_time ~ '^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM|am|pm)$'
        THEN to_timestamp(raw_create_time, 'DD/MM/YYYY HH12:MI:SS AM')
      WHEN raw_create_time ~ '^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM|am|pm)$'
        THEN to_timestamp(raw_create_time, 'DD-MM-YYYY HH12:MI AM')
      WHEN raw_create_time ~ '^\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}\s+(AM|PM|am|pm)$'
        THEN to_timestamp(raw_create_time, 'DD/MM/YYYY HH12:MI AM')
      ELSE NULL
    END AS create_time
  FROM parsed_flex_create_time
  WHERE raw_create_time IS NOT NULL
)
UPDATE flex_wip_records AS flex
SET create_time = normalized_flex_create_time.create_time
FROM normalized_flex_create_time
WHERE flex.id = normalized_flex_create_time.id
  AND normalized_flex_create_time.create_time IS NOT NULL;

WITH flex_matches AS (
  SELECT DISTINCT ON (rows.id)
    rows.id AS row_id,
    flex.create_time
  FROM daily_call_plan_report_rows AS rows
  JOIN daily_call_plan_reports AS reports
    ON reports.id = rows.report_id
  JOIN flex_wip_records AS flex
    ON flex.upload_batch_id = reports.flex_upload_batch_id
   AND flex.normalized_ticket_id = regexp_replace(upper(coalesce(rows.ticket_id, '')), '[^A-Z0-9]', '', 'g')
  WHERE flex.create_time IS NOT NULL
  ORDER BY rows.id, flex.row_number ASC, flex.id ASC
)
UPDATE daily_call_plan_report_rows AS rows
SET case_created_time = flex_matches.create_time
FROM flex_matches
WHERE rows.id = flex_matches.row_id;

CREATE TEMP TABLE opencall_case_created_time_backfill AS
  SELECT
    rows.id,
    reports.report_date,
    rows.serial_no,
    rows.change_type,
    regexp_replace(upper(coalesce(rows.ticket_id, '')), '[^A-Z0-9]', '', 'g') AS normalized_ticket_id,
    rows.case_created_time
  FROM daily_call_plan_report_rows AS rows
  JOIN daily_call_plan_reports AS reports
    ON reports.id = rows.report_id;

CREATE INDEX opencall_case_created_time_backfill_ticket_date_idx
  ON opencall_case_created_time_backfill(normalized_ticket_id, report_date DESC);

WITH previous_matches AS (
  SELECT DISTINCT ON (target.id)
    target.id AS row_id,
    source.case_created_time
  FROM opencall_case_created_time_backfill AS target
  JOIN opencall_case_created_time_backfill AS source
    ON source.normalized_ticket_id = target.normalized_ticket_id
   AND source.report_date < target.report_date
  WHERE target.change_type = 'CLOSED'
    AND target.normalized_ticket_id <> ''
    AND source.case_created_time IS NOT NULL
  ORDER BY target.id, source.report_date DESC, source.serial_no ASC, source.id ASC
)
UPDATE daily_call_plan_report_rows AS rows
SET case_created_time = previous_matches.case_created_time
FROM previous_matches
WHERE rows.id = previous_matches.row_id;

DROP TABLE opencall_case_created_time_backfill;
