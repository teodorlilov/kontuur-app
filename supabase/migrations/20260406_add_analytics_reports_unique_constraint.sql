-- Add unique constraint to support upsert in analytics_reports
ALTER TABLE analytics_reports
  ADD CONSTRAINT analytics_reports_client_platform_period_key
  UNIQUE (client_id, platform, period_start, period_end);
