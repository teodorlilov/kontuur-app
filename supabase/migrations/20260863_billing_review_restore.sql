-- Undoes 20260862, which reached production before the code it was written for. The deployed code
-- (e737ab4a) still selects `billing_updated_at` in every cached agency read (AGENCY_KEYS,
-- src/lib/queries/select-columns.ts), so every workspace read as locked; it writes `plan = 'pro'`
-- and `billing_updated_at` on every Stripe snapshot; it locks a subscribed row whose plan is 'trial'
-- (entitlementFor, src/lib/billing/entitlement.ts); the settings PUT writes name and timezone
-- through the user client; createUserRecord relies on the `trial_ends_at` default; and the
-- deployed issuer's insert type (IssueInput, src/lib/billing/documents.ts) leaves out
-- `tax_event_at`, which the generated types make required while the column is NOT NULL.
--
-- This restores exactly those. What 20260862 did that the deployed code does not notice stays:
-- the dedup keys it backfilled and the stale runs it closed. After the code deploys, 20260861 and
-- then 20260862 are applied again, both unchanged: 20260861 re-creates and runs the dedup-key
-- backfill for the bells written since, and 20260862 narrows, revokes and drops as it was written
-- to. Re-runnable.

-- ── agencies.billing_updated_at: selected and written by the deployed code ─────────────────

alter table public.agencies add column if not exists billing_updated_at timestamptz;

-- ── agencies.plan: 'pro' again, for the rows 20260862 turned to 'trial' ───────────────────
-- applySubscriptionSnapshot is the only writer of 'pro' and always writes it together with
-- `stripe_subscription_id`, which nothing clears (scripts/table-writers.json, agencies), so a
-- 'trial' row carrying a subscription id is exactly a row that was 'pro'.

alter table public.agencies drop constraint if exists agencies_plan_check;
alter table public.agencies
  add constraint agencies_plan_check check (plan in ('trial', 'pro', 'house'));

update public.agencies
set plan = 'pro'
where plan = 'trial' and stripe_subscription_id is not null;

-- ── agencies name and timezone: the settings PUT's grant, as 20260852 set it ──────────────

grant update (name, timezone) on public.agencies to authenticated;

-- ── agencies.trial_ends_at: the default, and the signups made without it ──────────────────
-- 20260852 gave every row without a subscription a trial end (`greatest` skips a NULL), and every
-- insert after it took the default, so a trial row with none and no subscription is a signup made
-- while the default was gone: it gets the fortnight the default would have given.

alter table public.agencies
  alter column trial_ends_at set default (now() + interval '14 days');

update public.agencies
set trial_ends_at = (created_at at time zone 'UTC') + interval '14 days'
where trial_ends_at is null
  and stripe_subscription_id is null
  and plan = 'trial';

-- ── sale_documents.tax_event_at: optional again until the issuer sends it ──────────────────
-- The deployed issuer sends the payment date as `issued_at`, which issue_sale_document stores as
-- the tax point, so no row lacks one; NOT NULL returns with 20260862 after the deploy.

alter table public.sale_documents alter column tax_event_at drop not null;

notify pgrst, 'reload schema';
