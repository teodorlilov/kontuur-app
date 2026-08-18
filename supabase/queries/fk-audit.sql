-- Foreign-key audit — paste into the Supabase dashboard SQL editor.
--
-- Answers the one question 20260820_cascade_client_deletes.sql cannot answer from the repo:
-- what does each client-owned foreign key actually do on DELETE in production?
--
-- The repo cannot say. TECH-DEBT §8.2: 49 migrations, five contain `create table`, and
-- nothing creates `clients`, `posts`, `brand_profiles`, `posting_schedules`, `post_history`,
-- `generation_runs`, `social_connections` or `analytics_reports`. Their DDL survives only as
-- docs/archive/MASTER_PROMPT.md, which carries no `on delete` clause anywhere — so every FK it
-- created is NO ACTION and `delete from clients` raises 23503. 20260817 proved that read correct
-- for client_ideas and idea_form_tokens. This confirms it for the rest before a migration
-- rewrites 13 constraints on a live database.
--
-- Needs no Docker and no CLI link: `supabase db dump` runs pg_dump in a container, but the
-- catalog is queryable from the browser. Same posture as rls-audit.sql next door.
--
-- Read-only. Selects from pg_constraint / pg_class / pg_attribute and writes nothing.
-- Query 3 is the exception in spirit only — it counts rows in three tables, still read-only.

-- ── 1. Every FK into the client tree, with its real delete rule ────────────────
--
-- `confdeltype` is the answer. Decoded here because the raw column is a one-char code and
-- nobody remembers that 'a' means NO ACTION rather than "all".
--
-- Expected before the migration: CASCADE for client_sources, brand_visual_identity,
-- discarded_drafts, client_style_memos, post_images, post_canvas_docs and the six
-- client_ideas/idea_form_tokens edges 20260817 fixed; SET NULL for posts.client_source_id,
-- discarded_drafts.client_source_id and client_ideas.generated_post_id; NO ACTION for
-- everything else. Anything that disagrees means the spec list in 20260820 needs editing
-- before it runs — a table already cascading is harmless to re-specify, but one that turns
-- out to be SET NULL is a deliberate decision this migration must not silently reverse.
select
  src.relname                                                      as child_table,
  (select string_agg(a.attname, ', ' order by k.ord)
     from unnest(c.conkey) with ordinality k(attnum, ord)
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
                                                                   as child_columns,
  tgt.relname                                                      as parent_table,
  c.conname                                                        as constraint_name,
  case c.confdeltype
    when 'a' then 'NO ACTION  ← blocks the delete'
    when 'r' then 'RESTRICT   ← blocks the delete'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end                                                              as on_delete
from pg_constraint c
join pg_class src on src.oid = c.conrelid
join pg_class tgt on tgt.oid = c.confrelid
join pg_namespace n on n.oid = src.relnamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and tgt.relname in ('clients', 'posts', 'generation_runs', 'idea_form_tokens')
order by
  case c.confdeltype when 'a' then 0 when 'r' then 0 else 1 end,   -- blockers first
  tgt.relname,
  src.relname;


-- ── 2. Orphan scan — RUN THIS, IT IS WHAT FAILS THE MIGRATION ─────────────────
--
-- `alter table … add constraint … foreign key` VALIDATES existing rows. One row pointing at
-- a parent that no longer exists aborts the whole DO block, and because 20260820 rewrites 13
-- constraints in one transaction, a single orphan in the last table undoes all of them.
--
-- notifications is the likeliest offender: its client_id/post_id were added out of band
-- (docs/plans/NOTIFICATION.md:72-73, no `on delete`), so nothing has ever cleaned up after a
-- deleted parent — and until now no parent could be deleted, which is exactly the kind of
-- gap that hides orphans rather than preventing them.
--
-- Anything reported here must be deleted or repointed BEFORE applying the migration.
do $$
declare
  spec record;
  n    bigint;
begin
  for spec in
    select * from (values
      ('analytics_reports',    'client_id', 'clients'),
      ('brand_image_bank',     'client_id', 'clients'),
      ('brand_profiles',       'client_id', 'clients'),
      ('brand_vector_bank',    'client_id', 'clients'),
      ('client_assets',        'client_id', 'clients'),
      ('generation_runs',      'client_id', 'clients'),
      ('notifications',        'client_id', 'clients'),
      ('post_history',         'client_id', 'clients'),
      ('posting_schedules',    'client_id', 'clients'),
      ('posts',                'client_id', 'clients'),
      ('social_connections',   'client_id', 'clients'),
      ('notifications',        'post_id',   'posts'),
      ('post_approval_tokens', 'post_id',   'posts'),
      ('generation_themes',    'run_id',    'generation_runs')
    ) as t(child, col, parent)
  loop
    if to_regclass('public.' || spec.child) is null then
      raise notice 'skip %.% — no such table', spec.child, spec.col;
      continue;
    end if;

    execute format(
      'select count(*) from public.%I ch left join public.%I p on p.id = ch.%I
        where ch.%I is not null and p.id is null',
      spec.child, spec.parent, spec.col, spec.col
    ) into n;

    if n > 0 then
      raise notice 'ORPHANS: %.% has % row(s) pointing at a missing %',
        spec.child, spec.col, n, spec.parent;
    end if;
  end loop;

  raise notice 'orphan scan complete';
end $$;


-- ── 3. The three tables no application code reads ─────────────────────────────
--
-- client_assets, brand_image_bank and brand_vector_bank carry client_id foreign keys and are
-- referenced by zero lines of src/. 20260820 cascades them rather than dropping them, because
-- dropping a table is a separate decision and a client delete must not fail on them meanwhile.
--
-- If all three come back 0, the follow-up is 20260821_drop_unused_asset_tables.sql.
-- If any is non-zero, note it: client_assets.storage_path and brand_image_bank.storage_path
-- point into a bucket this codebase never names, so deleteClient's prefix sweep — which only
-- knows `post-images` and `client-files` — will not reach their objects.
select 'client_assets'     as table_name, count(*) as rows from client_assets
union all
select 'brand_image_bank',  count(*) from brand_image_bank
union all
select 'brand_vector_bank', count(*) from brand_vector_bank;
