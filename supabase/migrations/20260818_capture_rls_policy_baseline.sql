-- The RLS policy baseline, brought into version control for the first time.
--
-- Until 2026-08-18 not one `CREATE POLICY` existed in this directory, while the live
-- database carried 18. Every one had been made by hand in the dashboard. That is how
-- `post_approval_tokens_public_read` — a `USING (true)` policy readable by `anon` —
-- survived unnoticed long enough to be found by an audit rather than by review: there was
-- no diff it could ever have appeared in.
--
-- This file is idempotent (`drop policy if exists` then `create policy`) and transcribes
-- the live state EXACTLY as measured, minus the one dropped in the sibling migration. It
-- is a snapshot, not a redesign: nothing here changes behaviour, and every predicate is
-- what production already enforces. Reviewing whether these are the RIGHT policies is a
-- separate pass — but it is now a pass someone can actually do, in a diff.
--
-- The shape is consistent and correct: every agency-scoped table resolves the caller to
-- their agency through `users.agency_id = auth.uid()`, then joins down. `FOR ALL` with no
-- WITH CHECK is fine — Postgres reuses the USING expression for INSERT/UPDATE checks when
-- WITH CHECK is omitted.
--
-- Applying to prod: the CLI has never tracked this project's migration history, so run
-- this in the SQL editor. It is safe to run against the live database as-is — each policy
-- is dropped and recreated identically.

-- ── The caller's own row ──────────────────────────────────────────────────────
drop policy if exists "users_self_access" on public.users;
create policy "users_self_access" on public.users
  for all to public using (id = auth.uid());

-- ── Agency-level ─────────────────────────────────────────────────────────────
drop policy if exists "agencies_member_access" on public.agencies;
create policy "agencies_member_access" on public.agencies
  for all to public
  using (id = (select users.agency_id from users where users.id = auth.uid()));

drop policy if exists "clients_agency_isolation" on public.clients;
create policy "clients_agency_isolation" on public.clients
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

drop policy if exists "intelligence_briefings_agency_isolation" on public.intelligence_briefings;
create policy "intelligence_briefings_agency_isolation" on public.intelligence_briefings
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

drop policy if exists "notifications_agency_isolation" on public.notifications;
create policy "notifications_agency_isolation" on public.notifications
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

-- ── Client-scoped: reachable from the caller's agency through `clients` ───────
drop policy if exists "analytics_reports_agency_isolation" on public.analytics_reports;
create policy "analytics_reports_agency_isolation" on public.analytics_reports
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "brand_profiles_agency_isolation" on public.brand_profiles;
create policy "brand_profiles_agency_isolation" on public.brand_profiles
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "generation_runs_agency_isolation" on public.generation_runs;
create policy "generation_runs_agency_isolation" on public.generation_runs
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "post_history_agency_isolation" on public.post_history;
create policy "post_history_agency_isolation" on public.post_history
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "posting_schedules_agency_isolation" on public.posting_schedules;
create policy "posting_schedules_agency_isolation" on public.posting_schedules
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "posts_agency_isolation" on public.posts;
create policy "posts_agency_isolation" on public.posts
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "social_connections_agency_isolation" on public.social_connections;
create policy "social_connections_agency_isolation" on public.social_connections
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

-- These two use a join rather than the nested subselect. Transcribed as they are rather
-- than normalised: this file's job is to record what production enforces, and rewriting a
-- predicate here would make the baseline a change instead of a snapshot.
drop policy if exists "Users can manage their agency's client assets" on public.client_assets;
create policy "Users can manage their agency's client assets" on public.client_assets
  for all to public
  using (client_id in (select c.id from clients c join users u on u.agency_id = c.agency_id
    where u.id = auth.uid()))
  with check (client_id in (select c.id from clients c join users u on u.agency_id = c.agency_id
    where u.id = auth.uid()));

drop policy if exists "Users can manage their agency's client sources" on public.client_sources;
create policy "Users can manage their agency's client sources" on public.client_sources
  for all to public
  using (client_id in (select c.id from clients c join users u on u.agency_id = c.agency_id
    where u.id = auth.uid()))
  with check (client_id in (select c.id from clients c join users u on u.agency_id = c.agency_id
    where u.id = auth.uid()));

-- ── Two hops from the caller's agency ────────────────────────────────────────
drop policy if exists "generation_themes_agency_isolation" on public.generation_themes;
create policy "generation_themes_agency_isolation" on public.generation_themes
  for all to public
  using (run_id in (select generation_runs.id from generation_runs
    where generation_runs.client_id in (select clients.id from clients
      where clients.agency_id = (select users.agency_id from users where users.id = auth.uid()))));

drop policy if exists "post_approval_tokens_agency_isolation" on public.post_approval_tokens;
create policy "post_approval_tokens_agency_isolation" on public.post_approval_tokens
  for all to public
  using (post_id in (select posts.id from posts
    where posts.client_id in (select clients.id from clients
      where clients.agency_id = (select users.agency_id from users where users.id = auth.uid()))));

-- ── Shared reference data, deliberately not agency-scoped ────────────────────
--
-- `language_rules` has no agency_id: it holds per-LANGUAGE writing rules (native CTA
-- phrases, formality defaults, banned anglicisms), identical for every agency. Readable by
-- any signed-in user is the intent, and the audit's "no agency reference" flag is a false
-- positive here. Kept as SELECT-only so it cannot be written from the browser.
drop policy if exists "language_rules_read_all" on public.language_rules;
create policy "language_rules_read_all" on public.language_rules
  for select to public using (auth.uid() is not null);

-- ── Deliberately NOT given policies ──────────────────────────────────────────
--
-- Eleven tables have RLS on with zero policies, i.e. service-role only:
--   brand_image_bank, brand_kit_extractions, brand_vector_bank, brand_visual_identity,
--   client_ideas, client_style_memos, discarded_drafts, idea_form_tokens,
--   image_generation_usage, post_canvas_docs, post_images
--
-- That state is left exactly as it is, and it is not an oversight to fix in this file.
-- Every one is reached through `createAdminSupabaseClient` after an ownership check in
-- code, which is why 53 files import that client — the workaround is load-bearing.
-- `client_ideas` and `idea_form_tokens` are the sharpest case: the public idea form is
-- unauthenticated, so there is no `auth.uid()` for a policy to key on and the admin client
-- is the only way it can work.
--
-- Making that posture deliberate rather than inherited is the remaining half of
-- docs/RLS-SECURITY-REVIEW.md — option B or C — and it is a design decision, not a
-- transcription.
