ALTER TABLE daily_call_plan_report_rows
ADD COLUMN IF NOT EXISTS flex_status_unchanged_days INTEGER;
