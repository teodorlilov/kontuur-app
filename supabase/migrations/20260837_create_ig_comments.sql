-- What the audience said, stored so the queue can be read without calling Instagram.
--
-- The alternative was fetching live on every page render. It was costed and rejected:
-- `fetchMediaComments` does not paginate, so a cross-client queue is ~66 Graph calls
-- per page view, and Meta's quota is per-app — the same budget the publish cron
-- spends. `sync-metrics.ts` already records what that costs: "One rate-limit answer
-- poisons every remaining call in this run." Storing lets the cron compare a cheap
-- media-list count against what it already holds and fetch only what changed.
--
-- These rows hold OTHER PEOPLE'S personal data. Two consequences, both enforced
-- elsewhere and named here so the next reader sees them together:
--   1. `purgeAccountAnalytics` erases this table alongside the ig_* metrics, which is
--      what makes Meta's mandated data-deletion callback cover comments.
--   2. The sync sweeps rows older than 90 days. We keep a comment only while the
--      queue can still act on it.
--
-- Column names mirror the Graph API's field names, as every other ig_ table does
-- (`hidden`, `like_count`, `text`, `parent_id`). `text` is a column name here, not a
-- type — Postgres allows it, and matching the API beats inventing a synonym.

create table if not exists ig_comments (
  -- Instagram's own comment id IS the primary key. There is no second identity to
  -- invent: the sync upserts on it, and every moderation action addresses it.
  id text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  -- INVARIANT, established by 20260825/20260826 for every ig_ table: a client can be
  -- reconnected to a DIFFERENT Instagram account. Every read claims only rows stamped
  -- with the account it is connected to now, or one account's audience surfaces in
  -- another's queue.
  ig_account_id text not null,
  ig_media_id text not null,
  -- Resolved once by the sync, so the read never has to map media ids back to posts.
  -- SET NULL rather than CASCADE, matching ig_post_metrics: deleting a Kontuur post
  -- does not un-say what someone wrote under it on Instagram.
  post_id uuid references posts(id) on delete set null,
  -- NULL for a top-level comment; otherwise the comment this one replies to.
  -- Not a foreign key to this table: Instagram can hand us a reply in the same page
  -- as its parent or before it, and a self-reference would make insert order matter.
  parent_id text,
  -- Nullable because igCommentSchema makes them optional, and that is not defensive
  -- coding: under Standard Access Instagram returns HTTP 200 with the comment id
  -- alone, withholding body and author until the app has Advanced Access for
  -- instagram_business_manage_comments. NOT NULL here would turn a permissions state
  -- into a sync crash.
  author_username text,
  text text,
  hidden boolean not null default false,
  like_count integer,
  commented_at timestamp with time zone,
  synced_at timestamp with time zone default now() not null
);

-- The queue's read: every comment for one agency's clients, scoped to the account
-- each client is connected to now.
create index if not exists idx_ig_comments_client_account
  on ig_comments (client_id, ig_account_id);

-- The sync's per-media count comparison, and its upsert target.
create index if not exists idx_ig_comments_media
  on ig_comments (ig_media_id);

-- Grouping the queue by the post a comment sits under.
create index if not exists idx_ig_comments_post
  on ig_comments (post_id);

-- The 90-day sweep.
create index if not exists idx_ig_comments_commented_at
  on ig_comments (commented_at);

alter table ig_comments enable row level security;

-- One hop, through `clients` — the same shape ig_post_metrics uses (20260822). Every
-- reader in the codebase goes through the admin client, as it does for the other ig_
-- tables; this policy is the floor under that, not a substitute for it.
drop policy if exists "ig_comments_agency_isolation" on ig_comments;
create policy "ig_comments_agency_isolation" on ig_comments
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));
