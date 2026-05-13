ALTER TABLE daily_call_plan_report_rows
  ADD COLUMN IF NOT EXISTS product_line_name TEXT,
  ADD COLUMN IF NOT EXISTS work_location TEXT;
