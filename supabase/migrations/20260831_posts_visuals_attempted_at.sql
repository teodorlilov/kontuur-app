-- Space the visuals cron's retries so a provider outage cannot burn a post's whole budget.
--
-- `visuals_attempts` caps a post at 3 tries, and the cron ticks hourly. An image-provider
-- outage lasting three hours therefore exhausts every attempt for the entire backlog before
-- the provider comes back, permanently excluding those posts from auto-visuals — the failure
-- is indistinguishable from "this post cannot be painted", which is what the cap is for.
--
-- Recording WHEN the last attempt happened lets the cron require a gap between them, so the
-- three attempts span half a day rather than three consecutive ticks.
alter table public.posts
  add column if not exists visuals_attempted_at timestamptz;

comment on column public.posts.visuals_attempted_at is
  'When the visuals cron last counted an attempt for this post. NULL = never attempted.';

-- The cron reads pending_review posts under the attempt cap and now also filters on this
-- column; without it the index scan would be followed by a filter on every candidate row.
create index if not exists posts_visuals_backlog
  on public.posts (status, visuals_attempts, visuals_attempted_at);
