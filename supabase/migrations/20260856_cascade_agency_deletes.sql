-- Workspace deletion: the four foreign keys that still block `delete from agencies` become
-- `on delete cascade`, so deleting a workspace is one statement and Postgres removes everything
-- it owns in one transaction (docs/plans/WORKSPACE-DELETION-RESEARCH.md §2).
--
-- The sequel to 20260820, which did this for the client tree. What blocks the agency row today:
--   clients.agency_id             NO ACTION (baseline:835) — the whole client tree hangs here
--   users.agency_id               NO ACTION (baseline:985) — the members
--   notifications.agency_id       NO ACTION (baseline:913), NOT NULL (20260813:51) — agency-wide
--                                 rows (billing reminders, client_id null) survive the client cascade
--   social_connections.user_id    NO ACTION (baseline:979) — a member's Canva or facebook_user row
--                                 blocks the users cascade
--
-- What a workspace delete then removes, so "everything" is checkable rather than claimed:
--   from clients   — 20260820's twelve live specs (analytics_reports, brand_profiles,
--                    generation_runs, notifications.client_id, post_history, posting_schedules,
--                    posts, social_connections.client_id, notifications.post_id,
--                    post_approval_tokens, generation_themes, client_assets) plus the cascades
--                    declared with their tables: client_sources, client_style_memos (20260819),
--                    brand_visual_identity (20260718), discarded_drafts (20260729), post_images
--                    (20260429), post_canvas_docs (20260723), ig_account_metrics,
--                    platform_post_metrics, ig_audience_snapshots (20260822), platform_comments
--                    (20260837), fb_page_metrics (20260846), post_publications (20260838);
--   from agencies  — client_ideas, idea_form_tokens (20260817), brand_kit_extractions (20260718),
--                    usage_counters, ai_usage_daily (20260852), all already cascading.
-- Kept on purpose, by SET NULL: sale_documents (20260855:57) and billing_events (20260852:242) are
-- the Наредба Н-18 records and the accountant's trail, and outlive the workspace with no owner.
-- intelligence_briefings has had no agency edge since 20260851.
--
-- PRE-FLIGHT: supabase/queries/fk-audit.sql query 1 with 'agencies' and 'users' added to its
-- parent list, then query 2's orphan scan with the four specs below — `add constraint` validates
-- existing rows, and one orphan aborts the whole DO block. Run them as separate statements:
-- query 3 still names the two bank tables 20260836 dropped.
--
-- Looked up by column rather than by name, for the reason 20260817 and 20260820 give: these
-- were created inline by REFERENCES, so the names are Postgres defaults. Missing tables and
-- columns are skipped with a notice. Idempotent: safe to re-run.

do $$
declare
  spec       record;
  live_name  text;
  col_attnum smallint;
begin
  for spec in
    select * from (values
      ('clients',            'agency_id', 'agencies'),
      ('users',              'agency_id', 'agencies'),
      ('notifications',      'agency_id', 'agencies'),
      ('social_connections', 'user_id',   'users')
    ) as t(child, col, parent)
  loop
    if to_regclass('public.' || spec.child) is null then
      raise notice '[20260856] skip %.% — no such table', spec.child, spec.col;
      continue;
    end if;

    select a.attnum into col_attnum
      from pg_attribute a
     where a.attrelid = to_regclass('public.' || spec.child)
       and a.attname = spec.col
       and a.attnum > 0
       and not a.attisdropped;

    if col_attnum is null then
      raise notice '[20260856] skip %.% — no such column', spec.child, spec.col;
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
-- Postgres indexes a foreign key's *referenced* primary key, never the referencing column
-- (20260820:107-110). clients.agency_id has idx_clients_agency_id (baseline:1029);
-- social_connections.user_id leads social_connections_user_id_platform_key (baseline:743-747).
-- Both columns below are NOT NULL, so the indexes are plain.
create index if not exists idx_users_agency_id         on users (agency_id);
create index if not exists idx_notifications_agency_id on notifications (agency_id);

notify pgrst, 'reload schema';
