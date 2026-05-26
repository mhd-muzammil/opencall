-- Repair daily report dates that were saved with a stale UI date while the
-- history session title contains the intended business date.
WITH parsed_sessions AS (
  SELECT DISTINCT ON (sessions.daily_call_plan_report_id)
    sessions.daily_call_plan_report_id AS report_id,
    make_date(
      (title_date.parts)[3]::INT,
      (title_date.parts)[2]::INT,
      (title_date.parts)[1]::INT
    ) AS title_report_date
  FROM report_history_sessions sessions
  JOIN daily_call_plan_reports reports
    ON reports.id = sessions.daily_call_plan_report_id
  JOIN LATERAL regexp_match(
    sessions.title,
    'Report Session\s+([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})'
  ) AS title_date(parts) ON TRUE
  WHERE sessions.daily_call_plan_report_id IS NOT NULL
  ORDER BY sessions.daily_call_plan_report_id, sessions.updated_at DESC, sessions.id ASC
)
UPDATE daily_call_plan_reports reports
SET report_date = parsed_sessions.title_report_date
FROM parsed_sessions
WHERE reports.id = parsed_sessions.report_id
  AND reports.report_date IS DISTINCT FROM parsed_sessions.title_report_date;
