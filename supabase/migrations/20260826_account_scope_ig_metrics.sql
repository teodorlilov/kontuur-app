-- Account-scope the Instagram metric stores.
--
-- The three metrics tables and the report archive were keyed by client only,
-- while a client's connection can be repointed at a different Instagram
-- account at any time. After such a switch the old account's rows would blend
-- into the new account's report — the same leak posts.ig_account_id
-- (20260825) closed for publish pins, closed here for the synced data itself.
--
-- The invariant: analytics may only ever show rows stamped with the account
-- the client is connected to RIGHT NOW. A reconnect starts a new history
-- beside the old one (account-aware uniqueness) instead of overwriting it.
--
-- SUPERSEDED 2026-08-21, for the half of that sentence this file got wrong.
-- "Beside the old one" described rows no read could reach and no code could
-- delete — an accumulation, not a history. The OAuth callback now purges the
-- superseded account's rows on a switch (src/features/analytics/lib/
-- purge-account-metrics.ts). The account-aware uniqueness below stays: it is
-- what keeps a switch from colliding with the outgoing account's keys, and it
-- is still what the invariant's first sentence rests on.

alter table ig_account_metrics add column if not exists ig_account_id text;
alter table ig_post_metrics add column if not exists ig_account_id text;
alter table ig_audience_snapshots add column if not exists ig_account_id text;
alter table analytics_reports add column if not exists ig_account_id text;

-- Backfill from the current connection. Verified truthful on 2026-08-20:
-- every stored metrics row was synced through the client's current account
-- (the stored post rows match that account's live /media exactly), and the
-- account backfills asked the current account's token for historical days.
update ig_account_metrics m
  set ig_account_id = sc.account_id
  from social_connections sc
  where sc.client_id = m.client_id
    and lower(sc.platform) = 'instagram'
    and sc.account_id is not null
    and m.ig_account_id is null;

update ig_post_metrics m
  set ig_account_id = sc.account_id
  from social_connections sc
  where sc.client_id = m.client_id
    and lower(sc.platform) = 'instagram'
    and sc.account_id is not null
    and m.ig_account_id is null;

update ig_audience_snapshots s
  set ig_account_id = sc.account_id
  from social_connections sc
  where sc.client_id = s.client_id
    and lower(sc.platform) = 'instagram'
    and sc.account_id is not null
    and s.ig_account_id is null;

update analytics_reports r
  set ig_account_id = sc.account_id
  from social_connections sc
  where sc.client_id = r.client_id
    and lower(sc.platform) = 'instagram'
    and sc.account_id is not null
    and r.ig_account_id is null;

-- Metrics rows no connection can vouch for are unshowable under the invariant
-- and unusable as history — remove them. (Archive rows keep NULL instead:
-- they are exported deliverables, merely hidden from account-scoped listings.)
delete from ig_account_metrics where ig_account_id is null;
delete from ig_post_metrics where ig_account_id is null;
delete from ig_audience_snapshots where ig_account_id is null;

-- Swap the client-only uniques for account-aware ones. The metrics tables'
-- constraint names are 20260822's defaults, but analytics_reports was created
-- by hand in the dashboard, so every drop discovers the name instead of
-- assuming it.
do $$
declare
  tbl text;
  cname text;
begin
  foreach tbl in array array[
    'ig_account_metrics', 'ig_post_metrics', 'ig_audience_snapshots', 'analytics_reports'
  ] loop
    for cname in
      select conname from pg_constraint
      where conrelid = tbl::regclass and contype = 'u'
    loop
      execute format('alter table %I drop constraint %I', tbl, cname);
    end loop;
  end loop;
end $$;

alter table ig_account_metrics alter column ig_account_id set not null;
alter table ig_account_metrics
  add constraint ig_account_metrics_client_account_date_key
  unique (client_id, ig_account_id, metric_date);

alter table ig_post_metrics alter column ig_account_id set not null;
alter table ig_post_metrics
  add constraint ig_post_metrics_client_account_media_key
  unique (client_id, ig_account_id, ig_media_id);

alter table ig_audience_snapshots alter column ig_account_id set not null;
alter table ig_audience_snapshots
  add constraint ig_audience_snapshots_client_account_date_key
  unique (client_id, ig_account_id, snapshot_date);

-- Nullable on purpose (legacy deliverables); stamped rows carry the key.
alter table analytics_reports
  add constraint analytics_reports_client_account_period_key
  unique (client_id, ig_account_id, platform, period_start, period_end);

notify pgrst, 'reload schema';
