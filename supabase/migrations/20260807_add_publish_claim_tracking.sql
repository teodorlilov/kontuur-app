-- Publish scheduler under the */5 cron.
--
-- publish_claimed_at: stamped by claimPost. Stale-claim reclaim measures
-- staleness from the claim instead of the post's slot — a live run (max 300s)
-- can never look 30 minutes stale, so overlapping ticks cannot reclaim a post
-- another run is actively publishing (double-post on the client's Instagram).
-- The same stamp paces retries, so MAX_ATTEMPTS rides out a transient outage
-- instead of burning in three consecutive 5-minute ticks.
alter table posts add column if not exists publish_claimed_at timestamptz;

-- The due scan + missed-window sweep filter status + scheduled_at across all
-- clients, 288x/day; the only existing index is (status, client_id).
create index if not exists idx_posts_due_publish
  on posts (scheduled_at)
  where status in ('scheduled', 'publishing');
