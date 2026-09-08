-- ── Repair: every hourly follower map was filed one day early ─────────────────────────────────
--
-- `fetchOnlineFollowers` dated each daily bucket with `toDateKey(end_time - 1 second,
-- 'America/Los_Angeles')`, while `dailySeriesOf` — the rule Instagram's reach series and all five
-- Facebook page-day series use — dates the same field as `end_time.split('T')`. A live probe on
-- 2026-09-08 confirmed both metrics return the identical stamp shape (`T07:00:00+0000`, midnight
-- Pacific), so the two rules were answering one question two ways, and one was wrong.
--
-- Which one, settled against Instagram's own `media.timestamp` on an account publishing every two
-- to three days: under `end_time.split('T')` the daily reach spikes land on the publish day; under
-- the minus-a-second reading they land the day BEFORE a publish, and show troughs on publish days.
-- A spike the day before a post cannot happen. `dailySeriesOf` is right.
--
-- So `online_followers_by_hour` at metric_date D actually holds day D+1's counts. Verified directly
-- for six consecutive days: every live bucket's map was found stored one day earlier.
--
-- Shifted forward rather than refetched. Meta serves roughly thirty days of `online_followers` and
-- the oldest stored rows reach back to 2026-07-24, so a refetch would silently drop six weeks of
-- one client's history. The shift is exact and loses nothing but the leading day of each account,
-- which has no successor to receive.
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE FIX. The bound below stops it touching anything
-- dated after the last buggy capture, but a fixed-code capture that runs first would rewrite
-- 2026-09-05 correctly and this would then shift it wrong. Supabase runs a migration once, so
-- there is no risk of a double shift from re-running.
--
-- Only `online_followers_by_hour` moves. Every other column on these rows was dated by
-- `dailySeriesOf` and is already correct — which is exactly why the rows currently mix two days:
-- reach for day D beside hours for day D+1.
begin;

create temporary table _online_followers_shift on commit drop as
select client_id, ig_account_id, metric_date, online_followers_by_hour
from public.ig_account_metrics
where online_followers_by_hour is not null
  and metric_date <= date '2026-09-05';

insert into public.ig_account_metrics (client_id, ig_account_id, metric_date, online_followers_by_hour)
select client_id, ig_account_id, metric_date + 1, online_followers_by_hour
from _online_followers_shift
on conflict (client_id, ig_account_id, metric_date)
do update set online_followers_by_hour = excluded.online_followers_by_hour;

-- The leading day of each account: an original date that is no shift's target, so nothing
-- overwrote it and it would otherwise keep a map belonging to the day after it.
update public.ig_account_metrics m
set online_followers_by_hour = null
from _online_followers_shift o
where m.client_id = o.client_id
  and m.ig_account_id = o.ig_account_id
  and m.metric_date = o.metric_date
  and not exists (
    select 1
    from _online_followers_shift s
    where s.client_id = o.client_id
      and s.ig_account_id = o.ig_account_id
      and s.metric_date + 1 = o.metric_date
  );

commit;
