-- The billing review's cleanup half (docs/plans/BILLING-REVIEW-FIXES.md, step 2): the narrowing and
-- the revokes, each of which the code running before the deploy would trip over. Apply promptly
-- after the code deploys and before the next 08:00 UTC billing tick, then `npm run db:types`.
--
-- Preconditions, checked by hand before applying:
--   - production runs the deployed commit;
--   - `grep -rn billing_updated_at src --exclude-dir=__tests__` finds only src/types/database.ts;
--   - the read-only supabase/queries/invites-before-cleanup.sql has been run, and each login it
--     lists has been settled with its workspace's admin.
-- Once applied, the code before the deploy no longer runs: roll back only after 20260863.

-- ── the window's billing bells ─────────────────────────────────────────────────────────────
-- Reminders the old code wrote between 20260861 and the deploy carry no key. The backfill's own
-- guards (unkeyed rows only, never a key the agency already holds) make this second call safe; the
-- function has no use after it.

select public.billing_backfill_dedup_keys();
drop function public.billing_backfill_dedup_keys();

-- ── agencies.plan: only what nothing else says ─────────────────────────────────────────────
-- Paid is read from `stripe_subscription_id` (entitlementFor, src/lib/billing/entitlement.ts), so
-- the column keeps only the one fact it alone holds: a workspace set to house by hand.

update public.agencies set plan = 'trial' where plan = 'pro';
alter table public.agencies drop constraint if exists agencies_plan_check;
alter table public.agencies add constraint agencies_plan_check check (plan in ('trial', 'house'));

-- ── agencies: name and timezone are written by the admin-checked settings route alone ─────
-- The column grant let any member PATCH them through PostgREST past the route's admin check and its
-- timezone list; the route now writes through the admin client.

revoke update (name, timezone) on public.agencies from authenticated;

-- ── agencies.trial_ends_at: one source for the trial length ────────────────────────────────
-- createUserRecord (src/lib/auth/create-user-record.ts) writes it from TRIAL_DAYS
-- (src/lib/billing/plans.ts); a column default would be a second statement of the same number.

alter table public.agencies alter column trial_ends_at drop default;

-- ── agencies.billing_updated_at: written on every snapshot, read by nothing ────────────────

alter table public.agencies drop column if exists billing_updated_at;

-- ── sale_documents.tax_event_at: every document now carries its tax point ──────────────────
-- 20260861 backfilled the existing rows. From here a document the issuer sends without one fails on
-- the insert; issue_sale_document's `issued_at` fallback served only the code before the deploy.

alter table public.sale_documents alter column tax_event_at set not null;

-- ── generation_runs: runs killed before the abandoned-run closer existed ───────────────────
-- The closer reads the last 26 hours. An older run still `running` holds nothing — its reservation
-- was released by an earlier daily reset — so it is closed by status alone.

update public.generation_runs
set status = 'failed', completed_at = now()
where status = 'running'
  and created_at < (now() at time zone 'UTC') - interval '1 day';

notify pgrst, 'reload schema';
