-- Where a post went, as its own row.
--
-- `posts` held one publish attempt against one network: one ig_media_id, one
-- ig_creation_id, one attempts counter, one claim. That is not a naming problem — it is a
-- locking one. The claim is an optimistic compare-and-swap on (status, publish_attempts),
-- and it is the only thing standing between a racing cron tick and a duplicate post. With
-- two destinations on one row there is one lock: Instagram mid-publish would block
-- Facebook from starting, and Facebook failing three times would exhaust the retry budget
-- Instagram never got to use.
--
-- So each destination gets a row, and with it its own lock, its own retry budget and its
-- own resumable reference. The alternative was fb_post_id beside ig_media_id and
-- fb_attempts beside publish_attempts — duplicated fields for one concept.
--
-- `posts.platform` deliberately SURVIVES this migration. It still means what it has always
-- meant: the network the copy was written for. It is what seeds a publication's platform,
-- and it is deleted in the next step, when generation stops choosing a network at all.

create table if not exists post_publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  -- Lowercase, the vocabulary social_connections uses — NOT posts.platform's display case.
  -- A publication is resolved against a connection, so it speaks the connection's language.
  platform text not null,
  -- NULL until the moment it is knowable. A publication is created when a post is
  -- scheduled, but which account it lands on is only settled when it actually publishes:
  -- a client can be repointed at a different account in between, and recording the
  -- intended account would make the analytics pin lie about where the post really went.
  account_id text,
  -- scheduled | publishing | published | failed. Deliberately free text, matching every
  -- other status column here; the app's POST_STATUSES is the enforcement.
  status text not null,
  -- The network's own id for what we published — Instagram's media id, a Page post id.
  external_post_id text,
  -- A resumable pointer for networks that accept content before it is live (Instagram's
  -- container). NULL for a network that publishes in one call.
  publish_ref text,
  published_at timestamptz,
  publish_error text,
  publish_attempts integer not null default 0,
  publish_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One publication per destination. This is also what makes the claim safe: two runs
  -- racing the same destination contend for one row.
  unique (post_id, platform)
);

-- The scheduler's due-query: publications ready to attempt, oldest first.
create index if not exists idx_post_publications_status_claimed
  on post_publications (status, publish_claimed_at);

-- Resolving a network's id back to the post it belongs to — the comments queue and the
-- metrics sync both do this.
create index if not exists idx_post_publications_external
  on post_publications (platform, external_post_id);

create index if not exists idx_post_publications_post
  on post_publications (post_id);

-- Backfill: every post that has reached the publishing lifecycle becomes one publication,
-- carrying its state across unchanged. Posts still in the editorial lifecycle (draft,
-- pending_review, approved) have no destination yet and get no row — which is the same
-- rule going forward.
insert into post_publications (
  post_id, platform, account_id, status, external_post_id, publish_ref,
  published_at, publish_error, publish_attempts, publish_claimed_at
)
select
  p.id,
  lower(p.platform),
  p.ig_account_id,
  p.status,
  p.ig_media_id,
  p.ig_creation_id,
  p.published_at,
  p.publish_error,
  p.publish_attempts,
  p.publish_claimed_at
from posts p
where p.status in ('scheduled', 'publishing', 'published', 'failed')
on conflict (post_id, platform) do nothing;

alter table post_publications enable row level security;

-- Two hops, through `posts` — the same shape post_images uses (20260832). A publication
-- has no client_id of its own on purpose: the post already knows its client, and copying
-- it here would be a second place for that fact to be wrong.
drop policy if exists "post_publications_agency_isolation" on post_publications;
create policy "post_publications_agency_isolation" on post_publications
  for all to public
  using (post_id in (select posts.id from posts
    where posts.client_id in (select clients.id from clients
      where clients.agency_id = (select users.agency_id from users where users.id = auth.uid()))));

-- The columns whose meaning moved. Dropped in the same migration that fills their
-- replacement, so there is never a window where both are readable and a reader could pick
-- the wrong one.
--
-- `published_at` goes too: each destination went live at its own moment, and a single
-- column cannot hold two.
alter table posts drop column if exists ig_media_id;
alter table posts drop column if exists ig_account_id;
alter table posts drop column if exists ig_creation_id;
alter table posts drop column if exists published_at;
alter table posts drop column if exists publish_error;
alter table posts drop column if exists publish_attempts;
alter table posts drop column if exists publish_claimed_at;
