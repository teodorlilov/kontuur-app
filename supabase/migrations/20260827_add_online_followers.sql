-- Hourly follower-online counts, from the online_followers metric
-- (probe-verified alive in v25 under Instagram Login, 2026-08-20).
--
-- One 24-hour map per day: {"0": 283, "1": 301, …}. Hour keys are anchored to
-- Meta's insights day (America/Los_Angeles — the same anchor as end_time's
-- 07:00Z boundaries); readers convert to the agency's clock at render time.
-- NULL means the API had nothing for that day (it serves {} for the most
-- recent day or two until consolidated — writers skip empty maps).
alter table ig_account_metrics
  add column if not exists online_followers_by_hour jsonb;

notify pgrst, 'reload schema';
