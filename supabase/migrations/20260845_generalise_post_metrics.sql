-- Post identity stops belonging to Instagram, so a second network's posts have a home.
--
-- This table already holds two different kinds of row, and has since comments shipped: the
-- nightly analytics sync writes MEASUREMENTS, and the comment sync writes IDENTITY ONLY —
-- caption, permalink, thumbnail, posted_at — so a post commented on this morning is not an
-- untitled grey box until 03:30 tomorrow. Facebook needs exactly that second kind, and giving
-- identity its own table would have meant two homes for one fact.
--
-- Renamed rather than recreated. Every existing row IS an Instagram post, so the discriminator
-- backfills to a fact and no data moves. Column names follow `post_publications` (20260838) and
-- `platform_comments` (20260844): the same two words for the same two ideas.
--
-- WHAT IS NOT RENAMED, and why: `ig_account_metrics` and `ig_audience_snapshots` stay as they
-- are. They hold Instagram's own account-level insights — followers, reach, online-followers —
-- and Facebook Page analytics is deliberately out of scope until its metrics are probed. A post
-- is the only thing both networks currently have here.

alter table ig_post_metrics rename to platform_post_metrics;

alter table platform_post_metrics rename column ig_account_id to platform_account_id;
alter table platform_post_metrics rename column ig_media_id to external_post_id;

alter table platform_post_metrics
  add column if not exists platform text not null default 'instagram';
alter table platform_post_metrics alter column platform drop default;

alter table platform_post_metrics drop constraint if exists platform_post_metrics_platform_known;
alter table platform_post_metrics add constraint platform_post_metrics_platform_known
  check (platform in ('instagram', 'facebook'));

/*
 * The upsert target gains `platform`.
 *
 * `post-metrics-store.ts` upserts on this exact triple, so without the network in it two
 * networks that ever issued the same post id would overwrite each other. That collision is
 * unlikely — Instagram issues numeric strings, Facebook `{page-id}_{post-id}` — but a
 * uniqueness key is the wrong place to depend on luck, and the sync writes through it blind.
 */
alter table platform_post_metrics
  drop constraint if exists ig_post_metrics_client_account_media_key;
alter table platform_post_metrics
  add constraint platform_post_metrics_client_account_post_key
  unique (client_id, platform, platform_account_id, external_post_id);

-- Postgres carries an index through a rename but not its NAME.
alter index if exists idx_ig_post_metrics_client_posted
  rename to idx_platform_post_metrics_client_posted;
alter index if exists idx_ig_post_metrics_post_id
  rename to idx_platform_post_metrics_post_id;

-- The analytics report and the AI's performance source both read (client, account) and are
-- already partitioned by account id, since each network issues its own. The comment queue's
-- withheld count reads (client, platform) and had neither — this is what lets it stop counting
-- Page posts as comments Instagram is withholding.
create index if not exists idx_platform_post_metrics_client_platform
  on platform_post_metrics (client_id, platform);

alter policy "ig_post_metrics_agency_isolation" on platform_post_metrics
  rename to "platform_post_metrics_agency_isolation";

-- NOT renamed, deliberately: `ig_post_metrics_pkey` and the two foreign-key constraints keep
-- their names. Postgres carries them through the rename intact and nothing reads them by name,
-- so churning them would be noise in a migration that already changes what the table means.
