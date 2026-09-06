-- A Facebook Page's daily metrics, in Facebook's own vocabulary.
--
-- Deliberately NOT a generalisation of `ig_account_metrics` (decided with the user
-- 2026-09-06): only five of that table's ~25 columns would be shared, and squeezing
-- Facebook concepts into Instagram-named columns (page views into profile_views) is a
-- column meaning two things. A purpose-shaped table costs a second store and a second
-- purge line, and buys honest names.
--
-- Every measure column is nullable, and NULL means "Meta served nothing for this day" —
-- never zero. That is the probe doctrine (docs/META-FB-PROBE.md): the Graph API's failure
-- mode is absence, and a stored 0 must mean the API said 0.
--
-- What is NOT here, because Meta deleted it on 2025-11-15 (probed, not assumed): reach and
-- impressions in any form, demographics, and follower-online hours. `page_video_views` is
-- alive but deliberately omitted — this product publishes photos, so the column would read
-- 0 forever.

create table fb_page_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  page_id text not null,
  metric_date date not null,
  -- The follower LEVEL at that day's close, from the page_follows day series (the
  -- page_fans insight is dead; the series carries the level, probed live).
  followers_count integer,
  follows integer,          -- page_daily_follows_unique
  unfollows integer,        -- page_daily_unfollows_unique
  post_engagements integer, -- page_post_engagements
  page_views integer,       -- page_views_total
  -- End of the sync attempt that last wrote this day, mirroring
  -- ig_account_metrics.totals_synced_at's role in the refill logic.
  totals_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, page_id, metric_date)
);

create index idx_fb_page_metrics_client_page_date
  on fb_page_metrics (client_id, page_id, metric_date);

alter table fb_page_metrics enable row level security;

-- The same agency-isolation shape as ig_account_metrics (20260822): user-scoped reads see
-- their agency's clients; the sync and the purge run as service role, which bypasses RLS.
drop policy if exists "fb_page_metrics_agency_isolation" on public.fb_page_metrics;
create policy "fb_page_metrics_agency_isolation" on public.fb_page_metrics
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));
