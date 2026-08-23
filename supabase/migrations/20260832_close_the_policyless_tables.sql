-- Give the eleven service-role-only tables a policy, closing TECH-DEBT §8.1's open half.
--
-- These tables run RLS-on with ZERO policies, so nothing but the service-role key can touch
-- them. That reads like the safest state on the list and is in one specific way the least
-- safe: with no policy, every read has to go through `createAdminSupabaseClient`, which
-- BYPASSES RLS entirely — so "does this row belong to the caller?" stops being a database
-- rule and becomes a hand-written line in each of 59 files that import that client.
--
-- That is not hypothetical. On 2026-08-24 `GET /api/extract/status` was found reading
-- `brand_kit_extractions` — one of these eleven — through the admin client, filtered on the
-- session id alone with no agency predicate. Every sibling route had its check; that one
-- did not, and nothing could catch it, because the only guard was a convention. See §8.8.
--
-- ── Why this is additive and cannot break the unauthenticated paths ───────────
--
-- `service_role` has BYPASSRLS. Adding a policy does not take anything away from it, so
-- every existing admin-client read keeps working byte for byte — including the two paths
-- that genuinely have no signed-in caller to key on:
--
--   * the public approval page reads `post_images` through the service-role client,
--   * the public idea form writes `client_ideas` and reads `idea_form_tokens` the same way.
--
-- Those keep using the admin client and are unaffected. What changes is that a signed-in
-- user's own client can now read its agency's rows directly, and — the point — a route that
-- forgets its ownership filter is no longer the only thing standing between two agencies.
--
-- `client_ideas` and `idea_form_tokens` are included deliberately. TECH-DEBT called them the
-- sharpest case, on the grounds that the public form is unauthenticated. That is an argument
-- for keeping service-role on the PUBLIC path, not against a policy for the authenticated
-- one: the dashboard reads both tables as a signed-in user, and that read deserves the same
-- database-level scope as every other.
--
-- ── Shape ─────────────────────────────────────────────────────────────────────
--
-- Transcribed from 20260818_capture_rls_policy_baseline.sql rather than invented: same
-- `users.agency_id = auth.uid()` resolution, same `for all to public`, same omitted
-- WITH CHECK (Postgres reuses USING for INSERT/UPDATE when it is absent). Idempotent —
-- `drop policy if exists` then `create policy` — so it is safe to re-run.
--
-- Applying to prod: the CLI has never tracked this project's migration history (every one of
-- the 64 reports an empty `remote`), so run this in the dashboard SQL editor.

-- ── Agency-level: the row carries agency_id directly ─────────────────────────
drop policy if exists "brand_kit_extractions_agency_isolation" on public.brand_kit_extractions;
create policy "brand_kit_extractions_agency_isolation" on public.brand_kit_extractions
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

drop policy if exists "image_generation_usage_agency_isolation" on public.image_generation_usage;
create policy "image_generation_usage_agency_isolation" on public.image_generation_usage
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

-- `client_ideas` and `idea_form_tokens` carry BOTH agency_id and client_id. Scoped on
-- agency_id, which is the column the dashboard queries filter on — and note M18: the two FKs
-- have no composite constraint, so a client reassigned between agencies keeps minting ideas
-- into the old one. This policy follows agency_id and therefore follows the row, which is the
-- honest behaviour until M18 is closed.
drop policy if exists "client_ideas_agency_isolation" on public.client_ideas;
create policy "client_ideas_agency_isolation" on public.client_ideas
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

drop policy if exists "idea_form_tokens_agency_isolation" on public.idea_form_tokens;
create policy "idea_form_tokens_agency_isolation" on public.idea_form_tokens
  for all to public
  using (agency_id = (select users.agency_id from users where users.id = auth.uid()));

-- ── Client-scoped: reachable from the caller's agency through `clients` ───────
drop policy if exists "brand_image_bank_agency_isolation" on public.brand_image_bank;
create policy "brand_image_bank_agency_isolation" on public.brand_image_bank
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "brand_vector_bank_agency_isolation" on public.brand_vector_bank;
create policy "brand_vector_bank_agency_isolation" on public.brand_vector_bank
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "brand_visual_identity_agency_isolation" on public.brand_visual_identity;
create policy "brand_visual_identity_agency_isolation" on public.brand_visual_identity
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "client_style_memos_agency_isolation" on public.client_style_memos;
create policy "client_style_memos_agency_isolation" on public.client_style_memos
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

drop policy if exists "discarded_drafts_agency_isolation" on public.discarded_drafts;
create policy "discarded_drafts_agency_isolation" on public.discarded_drafts
  for all to public
  using (client_id in (select clients.id from clients
    where clients.agency_id = (select users.agency_id from users where users.id = auth.uid())));

-- ── Two hops from the caller's agency, through `posts` ───────────────────────
--
-- Same shape the baseline already uses for `post_approval_tokens`. `post_images` is the one
-- that changes day-to-day behaviour rather than only posture: with no policy, a user-scoped
-- read of it returned nothing at all, which is why the calendar's images once came back empty
-- and why so much of the codebase reaches for the admin client. That workaround stays valid;
-- it is simply no longer the only thing that works.
drop policy if exists "post_images_agency_isolation" on public.post_images;
create policy "post_images_agency_isolation" on public.post_images
  for all to public
  using (post_id in (select posts.id from posts
    where posts.client_id in (select clients.id from clients
      where clients.agency_id = (select users.agency_id from users where users.id = auth.uid()))));

drop policy if exists "post_canvas_docs_agency_isolation" on public.post_canvas_docs;
create policy "post_canvas_docs_agency_isolation" on public.post_canvas_docs
  for all to public
  using (post_id in (select posts.id from posts
    where posts.client_id in (select clients.id from clients
      where clients.agency_id = (select users.agency_id from users where users.id = auth.uid()))));
