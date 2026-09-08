-- ── Remove the stored "best time to post" ─────────────────────────────────────────────────────
--
-- `best_time_json` held two claims per client: three best HOURS and three best DAYS, crossed by
-- the calendar into nine suggested slots a week. Measured against the live data on 2026-09-07,
-- only the hours were real.
--
-- The hour curve is a genuine measurement — followers online swing 9-13x between the night trough
-- and the waking plateau. The day ranking was not. Weekday-to-weekday variation across the three
-- clients with data was 1.04x-1.10x, and the gap between the third-ranked day (drawn as a "best
-- day") and the fourth (not drawn) was 0.41%, 0.47% and 3.82% — inside sampling error. Bootstrap
-- resampling the same 28 days reproduced the stored trio only 31-45% of the time. The statistic
-- made it worse: `Math.max(...row)` scored a weekday by its single busiest cell, backed by one to
-- four observations, so a noisier weekday ranked higher for being noisier. Swapping it for the row
-- mean — the statistic the same function already used for hours — changed two of three days.
--
-- Nothing can rescue the day half by adding an outcome signal. Across every client and all of
-- time there are 69 posts with reach; per-post reach varies with a CV of 46-153%, so telling two
-- posting hours apart by 20% needs 83-96 posts PER HOUR TESTED, or roughly fourteen months of
-- deliberately randomised publishing on live client accounts. There is also no natural experiment:
-- posts were scheduled into the recommended hours, so the hours never varied independently.
--
-- What survives is the part that was always honest and is not stored here: the observed
-- weekday x hour heat grid on the analytics report, built at read time from
-- `ig_account_metrics.online_followers_by_hour`. That column, its nightly capture and the grid
-- all stay. Only the derived recommendation and the slots generated from it are removed.
alter table public.brand_profiles
  drop column if exists best_time_json,
  drop column if exists best_time_updated_at;
