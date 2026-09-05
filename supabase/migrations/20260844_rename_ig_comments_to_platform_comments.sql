-- Comments become a network-neutral table, so a second network is a row value rather
-- than a second table.
--
-- `ig_comments` was correct while Instagram was the only network that had any. It is
-- not correct now, and the alternative — an `fb_comments` sibling — is the shape the
-- publish path was rebuilt to avoid: two tables holding one concept means two sync
-- writers, two queue reads, and two places for a column to drift.
--
-- Renamed rather than recreated. Every existing row IS an Instagram comment, so the
-- discriminator backfills to a fact rather than a guess, and no data moves.
--
-- The column renames follow `post_publications` (20260838), which chose the same two
-- words for the same two ideas: which account on the network, and the network's own id
-- for the thing being commented on.

alter table ig_comments rename to platform_comments;

alter table platform_comments rename column ig_account_id to platform_account_id;
alter table platform_comments rename column ig_media_id to external_post_id;

-- Backfilled from what the rows already are, then the default is dropped: a writer that
-- forgets to name its network should fail, not silently file a Facebook comment under
-- Instagram.
alter table platform_comments add column if not exists platform text not null default 'instagram';
alter table platform_comments alter column platform drop default;

-- The vocabulary `social_connections.platform` and `post_publications.platform` use.
-- Named rather than a bare check so a future network reads as one line in a migration.
alter table platform_comments drop constraint if exists platform_comments_platform_known;
alter table platform_comments add constraint platform_comments_platform_known
  check (platform in ('instagram', 'facebook'));

-- The network's own comment id stays the primary key, as it was: the sync upserts on it
-- and every moderation action addresses it. It is NOT widened to (platform, id) —
-- Instagram issues numeric strings and Facebook `{post-id}_{comment-id}`, so a
-- collision between the two is not a thing that can happen, and a composite key would
-- make every read carry a discriminator it does not need.

-- Indexes follow their columns. Postgres keeps an index through a table or column
-- rename but not its NAME, so these are renamed explicitly rather than left reading
-- `idx_ig_comments_*` on a table called `platform_comments`.
alter index if exists idx_ig_comments_media rename to idx_platform_comments_external_post;
alter index if exists idx_ig_comments_post rename to idx_platform_comments_post;
alter index if exists idx_ig_comments_commented_at rename to idx_platform_comments_commented_at;

-- The queue's own index is REPLACED rather than renamed: it reads one client's comments
-- for the account it is connected to now, and now also for one network. A client with
-- both connected has two accounts, which two columns cannot separate.
drop index if exists idx_ig_comments_client_account;
create index if not exists idx_platform_comments_client_platform_account
  on platform_comments (client_id, platform, platform_account_id);

-- RLS survives a rename; the POLICY NAME does not describe the table any more.
alter policy "ig_comments_agency_isolation" on platform_comments
  rename to "platform_comments_agency_isolation";
