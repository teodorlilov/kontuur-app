-- Client deletion: the remaining client-owned foreign keys become `on delete cascade`.
--
-- The sequel to 20260817, which fixed this for client_ideas and idea_form_tokens and stated
-- the diagnosis: "Every foreign key is NO ACTION, so deleting a client that ever received an
-- idea raises 23503 and the delete surfaces as a 500." The same is true of the other eleven,
-- for the same reason — docs/archive/MASTER_PROMPT.md created them by hand and carries no
-- `on delete` clause anywhere, and no migration has touched them since.
--
-- Two consequences, both live today:
--   1. There is no way to delete a client. DELETE /api/clients/[id] has existed since the
--      beginning, is documented "and everything cascading from it", and would have 500'd on
--      any client with a single post. It was never wired to a caller, so nobody found out.
--   2. createClient's rollback cannot roll back. It deletes the client row alone after a
--      child insert fails, which is exactly the case where a brand_profiles or client_sources
--      row already exists — so the rollback 23503s and leaves the orphan it meant to remove.
--
-- Deliberately NOT re-specified, because they are already right and re-stating them would be
-- duplication: client_ideas.* and idea_form_tokens.* (20260817), client_style_memos (20260819),
-- brand_visual_identity (20260718), discarded_drafts (20260729), client_sources (the archived
-- hand-run DDL), post_images (20260429), post_canvas_docs (20260723). The three `set null`
-- edges are decisions, not omissions, and stay: posts.client_source_id and
-- discarded_drafts.client_source_id (20260729 — attribution outlives the source), and
-- client_ideas.generated_post_id (20260817 — an idea outlives the post it produced).
--
-- PRE-FLIGHT: run supabase/queries/fk-audit.sql first. Query 2 is not optional — `add
-- constraint` validates existing rows, all 14 specs run in one implicit transaction, and one
-- orphaned notifications row aborts every one of them.
--
-- Looked up by column rather than by name, for the reason 20260817 gives: these were created
-- inline by REFERENCES, so the names are Postgres defaults and asserting them would fail on
-- any environment where one was recreated by hand. Missing tables and columns are skipped with
-- a notice. Idempotent: safe to re-run.

do $$
declare
  spec       record;
  live_name  text;
  col_attnum smallint;
begin
  for spec in
    select * from (values
      -- Direct children of clients.
      ('analytics_reports',    'client_id', 'clients'),
      ('brand_profiles',       'client_id', 'clients'),
      ('generation_runs',      'client_id', 'clients'),
      ('notifications',        'client_id', 'clients'),
      ('post_history',         'client_id', 'clients'),
      ('posting_schedules',    'client_id', 'clients'),
      ('posts',                'client_id', 'clients'),
      ('social_connections',   'client_id', 'clients'),
      -- Referenced by zero lines of src/. Cascaded rather than dropped: removing a table is a
      -- separate decision, and a client delete must not fail on them meanwhile. If fk-audit
      -- query 3 returns three zeros, the follow-up is 20260821_drop_unused_asset_tables.sql.
      ('brand_image_bank',     'client_id', 'clients'),
      ('brand_vector_bank',    'client_id', 'clients'),
      ('client_assets',        'client_id', 'clients'),
      -- Post descendants. post_images and post_canvas_docs already cascade.
      ('notifications',        'post_id',   'posts'),
      ('post_approval_tokens', 'post_id',   'posts'),
      -- Transitive, and the one most easily missed: deleting a client deletes its
      -- generation_runs, which fails on generation_themes unless this cascades too.
      ('generation_themes',    'run_id',    'generation_runs')
    ) as t(child, col, parent)
  loop
    if to_regclass('public.' || spec.child) is null then
      raise notice '[20260820] skip %.% — no such table', spec.child, spec.col;
      continue;
    end if;

    select a.attnum into col_attnum
      from pg_attribute a
     where a.attrelid = to_regclass('public.' || spec.child)
       and a.attname = spec.col
       and a.attnum > 0
       and not a.attisdropped;

    if col_attnum is null then
      raise notice '[20260820] skip %.% — no such column', spec.child, spec.col;
      continue;
    end if;

    -- A loop, not a single lookup: a column recreated by hand can carry more than one FK to
    -- the same parent, and leaving the second behind would keep the NO ACTION block in place
    -- while the add below reported success.
    for live_name in
      select c.conname
        from pg_constraint c
       where c.contype = 'f'
         and c.conrelid = to_regclass('public.' || spec.child)
         and c.confrelid = to_regclass('public.' || spec.parent)
         and c.conkey = array[col_attnum]::smallint[]
    loop
      execute format('alter table public.%I drop constraint %I', spec.child, live_name);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I)
         references public.%I(id) on delete cascade',
      spec.child,
      spec.child || '_' || spec.col || '_fkey',
      spec.col,
      spec.parent
    );
  end loop;
end $$;

-- ── Covering indexes ────────────────────────────────────────────────────────
--
-- Postgres indexes a foreign key's *referenced* primary key, never the referencing column —
-- the point 20260731 already made for clients.agency_id. Without these, one client delete is
-- a sequential scan per table, and the cascade fans out across all of them at once.
--
-- Omitted where an existing index already leads with the column: posts
-- (idx_posts_client_id_status), generation_runs (generation_runs_cron_dedup_idx, 20260816),
-- client_sources, client_ideas.client_id, idea_form_tokens (idea_form_tokens_one_per_client),
-- discarded_drafts, brand_visual_identity, client_style_memos, post_images, post_canvas_docs,
-- post_approval_tokens.post_id, and the (client_id, …) unique keys on social_connections and
-- analytics_reports. brand_profiles.client_id is unique.
create index if not exists idx_posting_schedules_client_id on posting_schedules (client_id);
create index if not exists idx_post_history_client_id      on post_history (client_id);
create index if not exists idx_generation_themes_run_id    on generation_themes (run_id);

-- Partial: both columns are nullable and an agency-wide notification carries neither, so a
-- full index would be mostly nulls.
create index if not exists idx_notifications_client_id
  on notifications (client_id) where client_id is not null;
create index if not exists idx_notifications_post_id
  on notifications (post_id) where post_id is not null;

notify pgrst, 'reload schema';
