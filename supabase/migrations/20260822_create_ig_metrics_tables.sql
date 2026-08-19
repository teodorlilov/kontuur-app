-- Instagram metric persistence — the analytics repair's storage half.
--
-- Until now every report re-fetched the whole range from the Graph API, so history
-- began at whatever the API still remembered and a revoked token erased the past.
-- The nightly metrics cron writes here instead; reports read what was captured.
--
-- The one rule, learned from the live probe (project_meta_probe_results): the API's
-- failure mode is a silent-empty HTTP 200 (`{"data":[]}`) — under-100-follower gates,
-- omitted metric_type, demographics floors. So EVERY metric column below is nullable,
-- and NULL means "the API had nothing for this day", which is a different fact from 0.
-- Writers must never coerce an empty response to 0.

-- One row per client per day, written by the metrics cron the morning after.
create table if not exists ig_account_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  metric_date date not null,
  followers_count int,
  follows_count int,
  media_count int,
  reach int,
  views int,
  accounts_engaged int,
  total_interactions int,
  likes int,
  comments int,
  saves int,
  shares int,
  replies int,
  reposts int,
  profile_views int,
  website_clicks int,
  follows int,
  unfollows int,
  profile_links_taps int,
  -- Breakdown maps, dimension -> value. media_product_type here speaks the insights
  -- vocabulary (POST/REEL/AD/CAROUSEL_CONTAINER/STORY), NOT /media's FEED/REELS —
  -- the two enums must never be joined.
  reach_by_media_product_type jsonb,
  interactions_by_media_product_type jsonb,
  link_taps_by_button_type jsonb,
  fetched_at timestamptz not null default now(),
  unique (client_id, metric_date)
);

-- Lifetime per-post insights, refreshed on every sync (media insights are
-- cumulative, so the latest write supersedes).
create table if not exists ig_post_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- set null, not cascade: the IG post outlives its Postflow draft.
  post_id uuid references posts(id) on delete set null,
  ig_media_id text not null,
  media_type text,
  media_product_type text,
  permalink text,
  thumbnail_url text,
  caption text,
  posted_at timestamptz,
  reach int,
  views int,
  like_count int,
  comments_count int,
  saved int,
  shares int,
  total_interactions int,
  follows int,
  profile_visits int,
  last_synced_at timestamptz not null default now(),
  unique (client_id, ig_media_id)
);

-- Weekly demographics snapshots. Each jsonb is
-- {age: {...}, gender: {...}, city: {...}, country: {...}} maps of dimension -> value;
-- NULL when the account is under the API's demographics floor.
create table if not exists ig_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  snapshot_date date not null,
  follower_demographics jsonb,
  engaged_audience_demographics jsonb,
  unique (client_id, snapshot_date)
);

create index if not exists idx_ig_account_metrics_client_date
  on ig_account_metrics (client_id, metric_date desc);
create index if not exists idx_ig_post_metrics_client_posted
  on ig_post_metrics (client_id, posted_at desc);
create index if not exists idx_ig_post_metrics_post_id
  on ig_post_metrics (post_id);

-- Same posture as analytics_reports: the cron writes through the admin client,
-- the app reads user-scoped, so each table gets the baseline's agency-join shape.
alter table ig_account_metrics enable row level security;
alter table ig_post_metrics enable row level security;
alter table ig_audience_snapshots enable row level security;

drop policy if exists "ig_account_metrics_agency_isolation" on public.ig_account_metrics;
create policy "ig_account_metrics_agency_isolation" on public.ig_account_metrics
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "ig_post_metrics_agency_isolation" on public.ig_post_metrics;
create policy "ig_post_metrics_agency_isolation" on public.ig_post_metrics
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "ig_audience_snapshots_agency_isolation" on public.ig_audience_snapshots;
create policy "ig_audience_snapshots_agency_isolation" on public.ig_audience_snapshots
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

notify pgrst, 'reload schema';
