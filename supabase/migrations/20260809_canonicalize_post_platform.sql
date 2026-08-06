-- One spelling for posts.platform.
--
-- Two write paths disagreed: the generate wizard sent display case ('Instagram',
-- matching PLATFORMS in utils/constants), while POST /api/posts defaulted to
-- lowercase 'instagram' and stored whatever it was handed without validating.
-- The column ended up holding both, which made case-sensitive reads unreliable —
-- the calendar's "Publish to Instagram" button tested `platform === 'Instagram'`
-- and so never appeared for a lowercase row.
--
-- Canonical form is PLATFORMS' display case, because that is the vocabulary the
-- rest of the post pipeline already compares against (LIVE_PLATFORMS, run-plan,
-- weekly_mix_json keys) and renders directly in chips. The lowercase spelling
-- stays correct for social_connections.platform, which is a different table with
-- a different vocabulary — this migration must not touch it.

update posts p
set platform = c.canonical
from (values
  ('instagram',   'Instagram'),
  ('facebook',    'Facebook'),
  ('linkedin',    'LinkedIn'),
  ('tiktok',      'TikTok'),
  ('x / twitter', 'X / Twitter')
) as c(lowered, canonical)
where lower(trim(p.platform)) = c.lowered
  and p.platform <> c.canonical;

-- Keep it canonical going forward.
--
-- NOT VALID on purpose: this enforces every future insert and update without
-- requiring the existing table to pass first. The update above normalises every
-- spelling the app can produce, but a row predating the current PLATFORMS list
-- (an old 'Twitter', say) would otherwise abort the whole migration on deploy.
--
-- Nullable rows are allowed through: platform is nullable today and a post
-- without one is a state the UI already renders by omitting the chip.
--
-- To promote it once prod data is confirmed clean:
--   select distinct platform from posts;            -- expect only the five + null
--   alter table posts validate constraint posts_platform_canonical;
alter table posts drop constraint if exists posts_platform_canonical;
alter table posts add constraint posts_platform_canonical
  check (
    platform is null
    or platform in ('Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'X / Twitter')
  ) not valid;
