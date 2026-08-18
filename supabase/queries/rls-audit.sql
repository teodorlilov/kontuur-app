-- RLS audit — paste into the Supabase dashboard SQL editor.
--
-- Answers docs/RLS-SECURITY-REVIEW.md / TECH-DEBT §8.1 with no local tooling: no Docker,
-- no CLI, no link. `supabase db dump` needs a Docker daemon (the CLI runs pg_dump in a
-- pinned container), which is a prerequisite this question does not actually have — the
-- state lives in the catalog and the catalog is queryable from the browser.
--
-- Read-only. Selects from pg_class / pg_policy and writes nothing.

-- ── 1. Per-table RLS state ────────────────────────────────────────────────────
--
-- Three verdicts, and the middle one is the one people miss:
--   OPEN   — no RLS. PostgREST serves these rows to ANY signed-in user, for any agency.
--            The anon key is in every browser bundle by design, so the app is not
--            involved and code-level `.eq('agency_id', …)` does not protect them.
--   LOCKED — RLS on with ZERO policies: nothing but service_role can touch it. Usually
--            arrived via a dashboard "Enable RLS" click rather than a migration. This is
--            how post_images and brand_visual_identity ended up behind the admin client.
--   SCOPED — RLS on with policies. Read the policies; this query does not judge them.
--
-- `force_rls` is worth a glance too: without it the table OWNER bypasses RLS. That is not
-- the exposure here (service_role has BYPASSRLS regardless) but it changes what a policy
-- guarantees if anything ever connects as the owner.
select
  c.relname                                                        as table_name,
  c.relrowsecurity                                                 as rls,
  c.relforcerowsecurity                                            as force_rls,
  count(p.polname)                                                 as policies,
  case
    when not c.relrowsecurity then 'OPEN — any signed-in user can read via PostgREST'
    when count(p.polname) = 0 then 'LOCKED — RLS on, no policy: service-role only'
    else 'SCOPED — ' || count(p.polname) || ' policies'
  end                                                              as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'          -- ordinary tables only; views have no RLS of their own
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relrowsecurity asc, c.relname asc;   -- OPEN tables first: they are the finding


-- ── 2. What the existing policies actually say ────────────────────────────────
--
-- Run only if query 1 reports any SCOPED table. A policy that exists is not a policy that
-- is correct, and the review doc's step 5 is explicit that this is verified by attacking
-- it, not by reading it.
select
  tablename,
  policyname,
  cmd            as applies_to,
  roles,
  qual           as using_expression,
  with_check     as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ── 3. TECH-DEBT §7.9 M21 — is wizard theme tracking silently failing? ────────
--
-- If either of these is rls=true with policies=0, every wizard theme insert has been
-- failing into `trackThemeSafe` and swallowed: doneCount reads zero and the "RECENTLY
-- COVERED TOPICS (do NOT suggest these)" exclusion list is empty on every run. That is a
-- live generation-quality bug, not a hypothetical — query 1 already covers it, this is
-- just the two rows to look at first.
select
  c.relname       as table_name,
  c.relrowsecurity as rls,
  count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('generation_runs', 'generation_themes')
group by c.relname, c.relrowsecurity;


-- ── 4. TECH-DEBT §2.9 — bucket MIME allowlist (manual, per environment) ───────
--
-- Must contain BOTH image/svg+xml (generated vectors) and image/webp (paste-from-web and
-- the editor's own file picker). A missing entry makes those uploads 500 at the storage
-- step with no code change able to fix it.
select id, public, allowed_mime_types, file_size_limit
from storage.buckets
where id = 'post-images';
