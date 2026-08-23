-- Schema baseline generator — paste into the Supabase dashboard SQL editor.
--
-- Answers docs/TECH-DEBT.md §8.2 with no local tooling, the same way rls-audit.sql answers
-- §8.1: `supabase db dump` runs pg_dump inside a pinned Docker container, and the CLI and
-- Management API both need a live access token. None of those are prerequisites the question
-- actually has — the schema lives in the catalog, and the catalog is queryable from a browser.
--
-- Read-only. Every statement below selects from pg_catalog and writes nothing.
--
-- ── What to do with the output ────────────────────────────────────────────────
--
-- The result is one `ddl` column, already ordered. Copy the whole column and save it as
-- `supabase/migrations/00000000_baseline.sql`. Every emitted statement is guarded — tables
-- and indexes with `if not exists`, constraints and RLS behind `do $$ … $$` existence
-- checks — so replaying the file against the live database is a no-op, which is the
-- property §8.2 asks for.
--
-- ── The part a dump would not have told you either ────────────────────────────
--
-- Committing this does NOT make `supabase db push` safe. The 63 existing migrations have
-- never been tracked by the CLI, so after the baseline runs they would all replay against a
-- database that already has their changes. A rebuilt database needs the baseline applied and
-- then the prior migrations marked as history:
--
--     supabase migration repair --status applied <each existing version>
--
-- That is an operational step against a fresh project, not something this file can do, and
-- it is why the repo has deliberately never had a `db:push` script. Recording the schema and
-- being able to replay the history are two separate problems; this closes the first one.
--
-- ── Not covered here, on purpose ──────────────────────────────────────────────
--
-- RLS *policies* are already in version control — `20260818_capture_rls_policy_baseline.sql`
-- records all 17, and `src/app/__tests__/rls-policies.test.ts` guards them. This file emits
-- the `enable row level security` flags only, so the two cannot fight over the same ground.

with cols as (
  select
    c.oid                                                                as reloid,
    c.relname                                                            as tbl,
    string_agg(
      format(
        '  %I %s%s%s',
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        case
          when a.attidentity in ('a', 'd')
            then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end
                 || ' as identity'
          when ad.adbin is not null
            then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
          else ''
        end,
        case when a.attnotnull then ' not null' else '' end
      ),
      e',\n' order by a.attnum
    )                                                                    as body
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attnum > 0
    and not a.attisdropped
  group by c.oid, c.relname
),

-- Tables first, with columns inline. Constraints are deliberately NOT inlined: a foreign key
-- inside `create table` would impose an ordering the emitter would then have to solve, and
-- getting that wrong is a file that only works if you happen to run it top to bottom.
tables as (
  select 1 as section, tbl as sort_key,
    format(e'create table if not exists public.%I (\n%s\n);', tbl, body) as ddl
  from cols
),

-- Primary keys, uniques and checks, then foreign keys — split into two sections so every
-- table exists before anything references it.
constraints as (
  select
    case when con.contype = 'f' then 3 else 2 end                        as section,
    rel.relname || ':' || con.conname                                    as sort_key,
    format(
      e'do $baseline$ begin\n  if not exists (select 1 from pg_constraint where conname = %L'
      || e' and conrelid = %L::regclass) then\n    alter table public.%I add constraint %I %s;'
      || e'\n  end if;\nend $baseline$;',
      con.conname, 'public.' || rel.relname, rel.relname, con.conname,
      pg_get_constraintdef(con.oid)
    )                                                                    as ddl
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relkind = 'r'
    and con.contype in ('p', 'u', 'c', 'f')
),

-- Indexes that are not already implied by a constraint above. `pg_get_indexdef` returns the
-- exact definition, so `create unique index` and partial predicates survive verbatim —
-- which matters: 20260830's slot claim is a partial unique index and its three WHERE
-- predicates are the whole behaviour.
indexes as (
  select 4 as section, i.indexrelid::regclass::text as sort_key,
    pg_get_indexdef(i.indexrelid) as ddl_raw
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class tc on tc.oid = i.indrelid
  join pg_namespace n on n.oid = tc.relnamespace
  where n.nspname = 'public'
    and tc.relkind = 'r'
    and not exists (
      select 1 from pg_constraint con where con.conindid = i.indexrelid
    )
),

-- Functions and triggers. `client_edit_stats`, `consume_image_credits`,
-- `refund_image_credits` and `swap_rendered_post_images` are RPCs the app calls by name, so
-- a baseline without them rebuilds a database the app cannot run against.
routines as (
  select 5 as section, p.proname as sort_key,
    pg_get_functiondef(p.oid) || ';' as ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
),

-- Guarded, unlike the functions above: `pg_get_functiondef` already emits CREATE OR REPLACE,
-- but there is no `create trigger if not exists`, so an unguarded trigger def is the one
-- statement in this file that would fail on replay — and a baseline that throws halfway
-- through is worse than none, because it leaves a half-built database.
triggers as (
  select 6 as section, t.tgname as sort_key,
    format(
      e'do $baseline$ begin\n  if not exists (select 1 from pg_trigger where tgname = %L'
      || e' and tgrelid = %L::regclass) then\n    %s;\n  end if;\nend $baseline$;',
      t.tgname, 'public.' || c.relname, pg_get_triggerdef(t.oid)
    ) as ddl
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
),

-- RLS flags only. Re-enabling an already-enabled table is a no-op, so this needs no guard —
-- and it must not be omitted: a rebuilt database with RLS off and no policies is the §8.1
-- exposure recreated from scratch.
rls as (
  select 7 as section, c.relname as sort_key,
    format('alter table public.%I enable row level security;', c.relname) as ddl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
)

select ddl from (
  select 0 as section, '' as sort_key,
    e'-- Schema baseline, generated from production by supabase/queries/schema-baseline.sql.\n'
    || e'-- Regenerate with that query rather than editing this file by hand.\n'
    || '-- Policies live in 20260818_capture_rls_policy_baseline.sql, not here.' as ddl
  union all select section, sort_key, ddl from tables
  union all select section, sort_key, ddl from constraints
  -- Both spellings need rewriting and one `replace` cannot catch both: 'CREATE INDEX ' is not
  -- a substring of 'CREATE UNIQUE INDEX ', so a single pass would silently leave every unique
  -- index unguarded — and those are the ones whose replay failure actually matters.
  union all
    select section, sort_key,
      case
        when ddl_raw like 'CREATE UNIQUE INDEX %'
          then replace(ddl_raw, 'CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        else replace(ddl_raw, 'CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
      end || ';'
    from indexes
  union all select section, sort_key, ddl from routines
  union all select section, sort_key, ddl from triggers
  union all select section, sort_key, ddl from rls
) emitted
order by section, sort_key;
