-- Source attribution: which client_source fueled each post, and which drafts were
-- rejected — the outcome signal for per-source usefulness and rank boosting.
-- Access is app-level: all reads/writes go through the admin (service-role)
-- client after agency-ownership checks. RLS is enabled with NO policies so the
-- anon/authenticated PostgREST roles get zero rows — the table is never exposed
-- cross-tenant. Idempotent: safe to re-run.

alter table posts
  add column if not exists client_source_id uuid
    references client_sources(id) on delete set null;

create table if not exists discarded_drafts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  client_source_id uuid references client_sources(id) on delete set null,
  pillar           text,
  source_url       text,
  source_type      text,
  platform         text,
  discarded_from   text not null check (discarded_from in ('wizard', 'review')),
  created_at       timestamptz not null default now()
);

-- Service-role bypasses RLS; with no policies defined, every other role is denied.
alter table discarded_drafts enable row level security;

-- Usefulness stats aggregate by source and by client.
create index if not exists posts_client_source_idx
  on posts (client_source_id) where client_source_id is not null;
create index if not exists discarded_drafts_client_idx
  on discarded_drafts (client_id);
create index if not exists discarded_drafts_source_idx
  on discarded_drafts (client_source_id) where client_source_id is not null;

notify pgrst, 'reload schema';
